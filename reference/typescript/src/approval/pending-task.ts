/**
 * Pending Task
 * 
 * Represents a task awaiting human approval.
 * Tasks are created in SUBMITTED state and must be approved
 * before transitioning to WORKING.
 */

import { randomUUID } from 'crypto';
import {
  TaskState,
  PendingTaskData,
  DEFAULT_TASK_TIMEOUT_MS,
} from './types';
import { computePayloadHash } from './hash';

/**
 * Options for creating a new pending task.
 */
export interface CreateTaskOptions {
  /** Source agent submitting the task */
  sourceAgent: string;
  /** Target agent that will execute the task */
  targetAgent: string;
  /** The task payload */
  payload: unknown;
  /** Trust level of the source agent */
  trustLevel: number;
  /** Optional custom task ID (auto-generated if not provided) */
  taskId?: string;
  /** Optional custom timeout in milliseconds */
  timeoutMs?: number;
  /** Optional description for human review */
  description?: string;
}

/**
 * A task awaiting human approval.
 */
export class PendingTask {
  private data: PendingTaskData;

  /**
   * Create a PendingTask from existing data.
   * Use PendingTask.create() for new tasks.
   */
  constructor(data: PendingTaskData) {
    this.data = { ...data };
  }

  /**
   * Create a new pending task.
   * 
   * @param options - Task creation options
   * @returns New PendingTask in SUBMITTED state
   * 
   * @example
   * ```typescript
   * const task = PendingTask.create({
   *   sourceAgent: 'agent-a.example.ha2ha',
   *   targetAgent: 'agent-b.example.ha2ha',
   *   payload: { action: 'read', path: '/tmp/file.txt' },
   *   trustLevel: 3,
   * });
   * ```
   */
  static create(options: CreateTaskOptions): PendingTask {
    const now = new Date();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    const expiresAt = new Date(now.getTime() + timeoutMs);

    const data: PendingTaskData = {
      taskId: options.taskId ?? randomUUID(),
      sourceAgent: options.sourceAgent,
      targetAgent: options.targetAgent,
      payload: options.payload,
      payloadHash: computePayloadHash(options.payload),
      state: TaskState.SUBMITTED,
      receivedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      trustLevel: options.trustLevel,
      description: options.description,
    };

    return new PendingTask(data);
  }

  /**
   * Deserialize from JSON data.
   */
  static fromJSON(data: PendingTaskData): PendingTask {
    return new PendingTask(data);
  }

  /**
   * Serialize to JSON data.
   */
  toJSON(): PendingTaskData {
    return { ...this.data };
  }

  // Getters for task properties

  get taskId(): string {
    return this.data.taskId;
  }

  get sourceAgent(): string {
    return this.data.sourceAgent;
  }

  get targetAgent(): string {
    return this.data.targetAgent;
  }

  get payload(): unknown {
    return this.data.payload;
  }

  get payloadHash(): string {
    return this.data.payloadHash;
  }

  get state(): TaskState {
    return this.data.state;
  }

  get receivedAt(): Date {
    return new Date(this.data.receivedAt);
  }

  get expiresAt(): Date {
    return new Date(this.data.expiresAt);
  }

  get trustLevel(): number {
    return this.data.trustLevel;
  }

  get description(): string | undefined {
    return this.data.description;
  }

  /**
   * Check if the task has expired.
   */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if the task is still pending approval.
   */
  get isPending(): boolean {
    return this.data.state === TaskState.SUBMITTED;
  }

  /**
   * Check if the task can still be approved.
   */
  get canBeApproved(): boolean {
    return this.isPending && !this.isExpired;
  }

  /**
   * Get remaining time until expiry in milliseconds.
   */
  get timeRemaining(): number {
    const remaining = this.expiresAt.getTime() - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Transition to a new state.
   * Validates the transition according to the state machine.
   * 
   * @param newState - The target state
   * @throws Error if the transition is invalid
   */
  transition(newState: TaskState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(
        `Invalid state transition: ${this.data.state} -> ${newState}`
      );
    }
    this.data.state = newState;
  }

  /**
   * Check if a state transition is valid.
   * 
   * Valid transitions:
   * - SUBMITTED -> WORKING (approved)
   * - SUBMITTED -> CANCELED (rejected, timeout, or manual cancel)
   * - WORKING -> COMPLETED (success)
   * - WORKING -> FAILED (error)
   * - WORKING -> CANCELED (manual cancel)
   */
  canTransitionTo(newState: TaskState): boolean {
    const currentState = this.data.state;

    // No self-transitions
    if (currentState === newState) {
      return false;
    }

    // Terminal states cannot transition
    if (
      currentState === TaskState.COMPLETED ||
      currentState === TaskState.FAILED ||
      currentState === TaskState.CANCELED
    ) {
      return false;
    }

    // Valid transitions from SUBMITTED
    if (currentState === TaskState.SUBMITTED) {
      return newState === TaskState.WORKING || newState === TaskState.CANCELED;
    }

    // Valid transitions from WORKING
    if (currentState === TaskState.WORKING) {
      return (
        newState === TaskState.COMPLETED ||
        newState === TaskState.FAILED ||
        newState === TaskState.CANCELED
      );
    }

    return false;
  }

  /**
   * Mark as approved and transition to WORKING.
   * @throws Error if task cannot be approved (expired or wrong state)
   */
  approve(): void {
    if (!this.canBeApproved) {
      if (this.isExpired) {
        throw new Error('Cannot approve: task has expired');
      }
      throw new Error(`Cannot approve: task is in ${this.state} state`);
    }
    this.transition(TaskState.WORKING);
  }

  /**
   * Mark as rejected and transition to CANCELED.
   * @throws Error if task is not pending
   */
  reject(): void {
    if (!this.isPending) {
      throw new Error(`Cannot reject: task is in ${this.state} state`);
    }
    this.transition(TaskState.CANCELED);
  }

  /**
   * Mark as timed out and transition to CANCELED.
   */
  timeout(): void {
    if (this.isPending) {
      this.transition(TaskState.CANCELED);
    }
  }

  /**
   * Mark as completed.
   * @throws Error if task is not WORKING
   */
  complete(): void {
    if (this.state !== TaskState.WORKING) {
      throw new Error(`Cannot complete: task is in ${this.state} state`);
    }
    this.transition(TaskState.COMPLETED);
  }

  /**
   * Mark as failed.
   * @throws Error if task is not WORKING
   */
  fail(): void {
    if (this.state !== TaskState.WORKING) {
      throw new Error(`Cannot fail: task is in ${this.state} state`);
    }
    this.transition(TaskState.FAILED);
  }

  /**
   * Get a human-readable summary for CLI display.
   */
  getSummary(): string {
    const lines = [
      `Task: ${this.taskId}`,
      `From: ${this.sourceAgent}`,
      `To: ${this.targetAgent}`,
      `State: ${this.state}`,
      `Trust Level: ${this.trustLevel}`,
      `Received: ${this.data.receivedAt}`,
      `Expires: ${this.data.expiresAt}`,
    ];

    if (this.description) {
      lines.push(`Description: ${this.description}`);
    }

    if (this.isPending) {
      const remaining = Math.ceil(this.timeRemaining / 1000 / 60);
      lines.push(`Time remaining: ${remaining} minutes`);
    }

    lines.push(`Payload hash: ${this.payloadHash}`);

    return lines.join('\n');
  }
}
