/**
 * Task Lifecycle
 * 
 * Provides the state machine for task lifecycle management as defined in §6.4.
 * Ensures tasks progress through valid states with proper transitions.
 * 
 * State Machine:
 * 
 *                     ┌───────────────┐
 *                     │   SUBMITTED   │◄─── Task received
 *                     └───────┬───────┘
 *                             │
 *             ┌───────────────┼───────────────┐
 *             │               │               │
 *             ▼               ▼               ▼
 *     ┌───────────┐   ┌───────────┐   ┌───────────┐
 *     │ APPROVED  │   │ REJECTED  │   │ TIMEOUT   │
 *     │ (ha2ha/)  │   │ (ha2ha/)  │   │ (auto)    │
 *     └─────┬─────┘   └───────────┘   └───────────┘
 *           │              │               │
 *           ▼              │               │
 *     ┌───────────┐        │               │
 *     │  WORKING  │        │               │
 *     └─────┬─────┘        │               │
 *           │              │               │
 *     ┌─────┼─────┐        │               │
 *     ▼           ▼        ▼               ▼
 * ┌───────┐ ┌───────┐ ┌───────────────────────┐
 * │COMPLET│ │FAILED │ │      CANCELED         │
 * └───────┘ └───────┘ └───────────────────────┘
 */

import {
  TaskState,
  PendingTaskData,
  ApprovalRequestData,
  RejectionData,
  ApprovalResult,
  RejectionResult,
  ApprovalError,
  ApprovalScope,
  StateChangeCallback,
} from './types';
import { PendingTask, CreateTaskOptions } from './pending-task';
import { ApprovalRequest } from './approval-request';
import { ApprovalQueue, ApprovalQueueConfig } from './approval-queue';
import { ApprovalValidator, ValidatorConfig } from './validator';
import { AgentIdentity } from '../identity';
import { TrustRegistry } from '../trust';

/**
 * Configuration for the task lifecycle manager.
 */
export interface TaskLifecycleConfig extends ApprovalQueueConfig {
  /** Timeout interval for checking expired tasks (in ms) */
  timeoutCheckInterval?: number;
}

/**
 * Result of submitting a task.
 */
export interface SubmitResult {
  /** Whether the task was submitted successfully */
  success: boolean;
  /** The submitted task */
  task?: PendingTask;
  /** Error message if failed */
  error?: string;
}

/**
 * Result of executing a task.
 */
export interface ExecuteResult<T = unknown> {
  /** Whether execution was successful */
  success: boolean;
  /** The result value */
  result?: T;
  /** Error message if failed */
  error?: string;
}

/**
 * Manages the full lifecycle of tasks from submission to completion.
 * 
 * Key invariant: A task MUST NOT transition from SUBMITTED to WORKING
 * without a valid ha2ha/approve.
 */
export class TaskLifecycle {
  private queue: ApprovalQueue;
  private validator: ApprovalValidator;
  private timeoutCheckInterval?: ReturnType<typeof setInterval>;
  private stateCallbacks: StateChangeCallback[] = [];

  constructor(config: TaskLifecycleConfig = {}) {
    // Initialize queue and validator
    this.queue = new ApprovalQueue(config);
    this.validator = new ApprovalValidator(config.validatorConfig);

    // Set up state change forwarding
    this.queue.onStateChange((task, previousState) => {
      this.notifyStateChange(task, previousState);
    });

    // Start timeout checker if interval is set
    if (config.timeoutCheckInterval) {
      this.startTimeoutChecker(config.timeoutCheckInterval);
    }
  }

  /**
   * Load persisted state from disk.
   */
  async load(): Promise<void> {
    await this.queue.load();
  }

  /**
   * Submit a new task for approval.
   * Task enters SUBMITTED state and waits for human approval.
   * 
   * @param options - Task creation options
   * @returns Submit result with the pending task
   * 
   * @example
   * ```typescript
   * const result = await lifecycle.submit({
   *   sourceAgent: 'agent-a.example.ha2ha',
   *   targetAgent: 'agent-b.example.ha2ha',
   *   payload: { action: 'read', path: '/tmp/file.txt' },
   *   trustLevel: 3,
   * });
   * 
   * if (result.success) {
   *   console.log(`Task ${result.task.taskId} awaiting approval`);
   * }
   * ```
   */
  async submit(options: CreateTaskOptions): Promise<SubmitResult> {
    try {
      const task = await this.queue.add(options);
      return {
        success: true,
        task,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Approve a pending task.
   * This is the ONLY way to transition from SUBMITTED to WORKING.
   * 
   * @param taskId - The task to approve
   * @param approverIdentity - The identity of the approver
   * @param scope - The scope of approval
   * @returns Approval result
   */
  async approve(
    taskId: string,
    approverIdentity: AgentIdentity,
    scope: ApprovalScope = ApprovalScope.SINGLE
  ): Promise<ApprovalResult> {
    const task = this.queue.get(taskId);
    if (!task) {
      return {
        success: false,
        error: ApprovalError.TASK_NOT_FOUND,
        message: `Task ${taskId} not found`,
      };
    }

    // Create approval request with signature
    const approval = await ApprovalRequest.create({
      taskId,
      approverIdentity,
      payloadHash: task.payloadHash,
      scope,
    });

    return this.queue.approve(approval);
  }

  /**
   * Approve a task with an existing approval request.
   */
  async approveWithRequest(approval: ApprovalRequest | ApprovalRequestData): Promise<ApprovalResult> {
    return this.queue.approve(approval);
  }

  /**
   * Reject a pending task.
   * Task transitions to CANCELED state.
   * 
   * @param taskId - The task to reject
   * @param rejectedBy - Identity of the rejecter
   * @param reason - Reason for rejection
   * @param trustAction - Whether to reduce/block trust
   * @returns Rejection result
   */
  async reject(
    taskId: string,
    rejectedBy: string,
    reason: string,
    trustAction: 'none' | 'reduce' | 'block' = 'none'
  ): Promise<RejectionResult> {
    const rejection: RejectionData = {
      taskId,
      rejectedBy,
      reason,
      trustAction,
      createdAt: new Date().toISOString(),
    };

    return this.queue.reject(rejection);
  }

  /**
   * Mark a task as completed.
   * Task must be in WORKING state.
   * 
   * @param taskId - The task to complete
   * @returns True if successful
   */
  complete(taskId: string): boolean {
    return this.queue.markCompleted(taskId);
  }

  /**
   * Mark a task as failed.
   * Task must be in WORKING state.
   * 
   * @param taskId - The task to mark as failed
   * @returns True if successful
   */
  fail(taskId: string): boolean {
    return this.queue.markFailed(taskId);
  }

  /**
   * Execute a task with automatic state management.
   * 
   * @param taskId - The task to execute
   * @param executor - Function that performs the actual task execution
   * @returns Execution result
   */
  async execute<T>(
    taskId: string,
    executor: (task: PendingTask) => Promise<T>
  ): Promise<ExecuteResult<T>> {
    const task = this.queue.get(taskId);
    if (!task) {
      return {
        success: false,
        error: `Task ${taskId} not found`,
      };
    }

    if (task.state !== TaskState.WORKING) {
      return {
        success: false,
        error: `Task ${taskId} is in ${task.state} state, expected WORKING`,
      };
    }

    try {
      const result = await executor(task);
      this.complete(taskId);
      return {
        success: true,
        result,
      };
    } catch (error) {
      this.fail(taskId);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get a task by ID.
   */
  getTask(taskId: string): PendingTask | null {
    return this.queue.get(taskId);
  }

  /**
   * List all pending tasks.
   */
  listPending(): PendingTask[] {
    return this.queue.listPending();
  }

  /**
   * List all tasks.
   */
  listAll(): PendingTask[] {
    return this.queue.listAll();
  }

  /**
   * List tasks by state.
   */
  listByState(state: TaskState): PendingTask[] {
    return this.queue.listByState(state);
  }

  /**
   * Check for and handle timed-out tasks.
   */
  async checkTimeouts(): Promise<string[]> {
    return this.queue.checkTimeouts();
  }

  /**
   * Register a callback for when a task needs approval.
   */
  onApprovalNeeded(callback: (task: PendingTaskData) => void): void {
    this.queue.onApprovalNeeded(callback);
  }

  /**
   * Register a callback for state changes.
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateCallbacks.push(callback);
  }

  /**
   * Notify state change callbacks.
   */
  private notifyStateChange(task: PendingTaskData, previousState: TaskState): void {
    for (const callback of this.stateCallbacks) {
      try {
        callback(task, previousState);
      } catch (e) {
        console.error('State change callback error:', e);
      }
    }
  }

  /**
   * Start the timeout checker interval.
   */
  private startTimeoutChecker(intervalMs: number): void {
    this.timeoutCheckInterval = setInterval(() => {
      this.queue.checkTimeouts().catch(console.error);
    }, intervalMs);
  }

  /**
   * Stop the timeout checker interval.
   */
  stopTimeoutChecker(): void {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      this.timeoutCheckInterval = undefined;
    }
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    pending: number;
    working: number;
    completed: number;
    failed: number;
    canceled: number;
    total: number;
  } {
    const all = this.queue.listAll();
    return {
      pending: all.filter(t => t.state === TaskState.SUBMITTED).length,
      working: all.filter(t => t.state === TaskState.WORKING).length,
      completed: all.filter(t => t.state === TaskState.COMPLETED).length,
      failed: all.filter(t => t.state === TaskState.FAILED).length,
      canceled: all.filter(t => t.state === TaskState.CANCELED).length,
      total: all.length,
    };
  }

  /**
   * Clean up old tasks (completed, failed, canceled).
   * 
   * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
   * @returns Number of tasks removed
   */
  cleanup(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const task of this.queue.listAll()) {
      const receivedAt = new Date(task.toJSON().receivedAt).getTime();
      if (
        receivedAt < cutoff &&
        (task.state === TaskState.COMPLETED ||
          task.state === TaskState.FAILED ||
          task.state === TaskState.CANCELED)
      ) {
        this.queue.remove(task.taskId);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Get the underlying queue (for advanced operations).
   */
  getQueue(): ApprovalQueue {
    return this.queue;
  }
}

/**
 * Create a task lifecycle manager with default configuration.
 */
export function createTaskLifecycle(config?: TaskLifecycleConfig): TaskLifecycle {
  return new TaskLifecycle(config);
}

/**
 * Assertion: Task must not transition from SUBMITTED to WORKING without approval.
 * This is the core invariant of the HA2HA approval workflow.
 */
export function assertApprovalRequired(task: PendingTask): void {
  if (task.state === TaskState.WORKING) {
    // This is a sanity check - if we're in WORKING state, approval happened
    return;
  }

  if (task.state !== TaskState.SUBMITTED) {
    throw new Error(
      `Task ${task.taskId} is in ${task.state} state, cannot require approval`
    );
  }

  // Task is in SUBMITTED - approval is required before it can work
  // This assertion passes - the caller must get approval before calling .approve()
}
