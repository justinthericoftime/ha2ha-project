/**
 * Approval Queue
 * 
 * Manages pending tasks awaiting human approval.
 * Provides persistence, timeout handling, and notification callbacks.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import {
  TaskState,
  PendingTaskData,
  ApprovalRequestData,
  RejectionData,
  ApprovalResult,
  RejectionResult,
  ApprovalError,
  ApprovalNeededCallback,
  StateChangeCallback,
} from './types';
import { PendingTask, CreateTaskOptions } from './pending-task';
import { ApprovalRequest } from './approval-request';
import { ApprovalValidator, ValidatorConfig } from './validator';
import { TrustRegistry, ViolationSeverity } from '../trust';

/**
 * Configuration for the approval queue.
 */
export interface ApprovalQueueConfig {
  /** Path to store pending tasks (default: ~/.openclaw/ha2ha/pending/) */
  storePath?: string;
  /** Trust registry for violation handling */
  trustRegistry?: TrustRegistry;
  /** Validator configuration */
  validatorConfig?: ValidatorConfig;
  /** Auto-persist changes to disk */
  autoPersist?: boolean;
  /** Check timeouts on add/get operations */
  autoCheckTimeouts?: boolean;
}

/**
 * Index file structure for tracking pending tasks.
 */
interface QueueIndex {
  version: number;
  lastUpdated: string;
  tasks: string[]; // List of task IDs
}

/**
 * Manages pending tasks awaiting human approval.
 */
export class ApprovalQueue {
  private storePath: string;
  private trustRegistry?: TrustRegistry;
  private validator: ApprovalValidator;
  private autoPersist: boolean;
  private autoCheckTimeouts: boolean;

  private tasks: Map<string, PendingTask> = new Map();
  private approvalCallbacks: ApprovalNeededCallback[] = [];
  private stateChangeCallbacks: StateChangeCallback[] = [];

  constructor(config: ApprovalQueueConfig = {}) {
    this.storePath = config.storePath ?? join(homedir(), '.openclaw', 'ha2ha', 'pending');
    this.trustRegistry = config.trustRegistry;
    this.autoPersist = config.autoPersist ?? true;
    this.autoCheckTimeouts = config.autoCheckTimeouts ?? true;

    // Create validator with trust registry if provided
    const validatorConfig: ValidatorConfig = {
      ...config.validatorConfig,
      trustRegistry: this.trustRegistry,
    };
    this.validator = new ApprovalValidator(validatorConfig);
  }

  /**
   * Load pending tasks from disk.
   */
  async load(): Promise<void> {
    this.loadSync();
  }

  /**
   * Load pending tasks from disk synchronously.
   */
  loadSync(): void {
    this.tasks.clear();

    if (!existsSync(this.storePath)) {
      return;
    }

    const indexPath = join(this.storePath, 'index.json');
    if (!existsSync(indexPath)) {
      // Try loading individual task files
      this.loadTaskFiles();
      return;
    }

    try {
      const indexData = readFileSync(indexPath, 'utf-8');
      const index: QueueIndex = JSON.parse(indexData);

      for (const taskId of index.tasks) {
        const taskPath = join(this.storePath, `${taskId}.json`);
        if (existsSync(taskPath)) {
          try {
            const taskData = readFileSync(taskPath, 'utf-8');
            const task = PendingTask.fromJSON(JSON.parse(taskData));
            this.tasks.set(taskId, task);
          } catch (e) {
            console.error(`Failed to load task ${taskId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load queue index:', e);
      this.loadTaskFiles();
    }
  }

  /**
   * Load all task files from the store directory.
   */
  private loadTaskFiles(): void {
    if (!existsSync(this.storePath)) {
      return;
    }

    const files = readdirSync(this.storePath);
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'index.json') {
        try {
          const taskPath = join(this.storePath, file);
          const taskData = readFileSync(taskPath, 'utf-8');
          const task = PendingTask.fromJSON(JSON.parse(taskData));
          this.tasks.set(task.taskId, task);
        } catch (e) {
          console.error(`Failed to load task file ${file}:`, e);
        }
      }
    }
  }

  /**
   * Save the queue index and all tasks to disk.
   */
  async save(): Promise<void> {
    this.saveSync();
  }

  /**
   * Save the queue index and all tasks to disk synchronously.
   */
  saveSync(): void {
    // Ensure directory exists
    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
    }

    // Save index
    const index: QueueIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      tasks: Array.from(this.tasks.keys()),
    };
    writeFileSync(
      join(this.storePath, 'index.json'),
      JSON.stringify(index, null, 2)
    );

    // Save each task
    for (const [taskId, task] of this.tasks) {
      writeFileSync(
        join(this.storePath, `${taskId}.json`),
        JSON.stringify(task.toJSON(), null, 2)
      );
    }
  }

  /**
   * Save a single task to disk.
   */
  private saveTask(task: PendingTask): void {
    if (!this.autoPersist) return;

    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
    }

    writeFileSync(
      join(this.storePath, `${task.taskId}.json`),
      JSON.stringify(task.toJSON(), null, 2)
    );

    // Update index
    this.updateIndex();
  }

  /**
   * Remove a task file from disk.
   */
  private removeTaskFile(taskId: string): void {
    if (!this.autoPersist) return;

    const taskPath = join(this.storePath, `${taskId}.json`);
    if (existsSync(taskPath)) {
      unlinkSync(taskPath);
    }
    this.updateIndex();
  }

  /**
   * Update the index file.
   */
  private updateIndex(): void {
    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
    }

    const index: QueueIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      tasks: Array.from(this.tasks.keys()),
    };
    writeFileSync(
      join(this.storePath, 'index.json'),
      JSON.stringify(index, null, 2)
    );
  }

  /**
   * Add a new task to the queue.
   * 
   * @param options - Task creation options
   * @returns The created pending task
   */
  async add(options: CreateTaskOptions): Promise<PendingTask> {
    return this.addSync(options);
  }

  /**
   * Add a new task to the queue synchronously.
   */
  addSync(options: CreateTaskOptions): PendingTask {
    if (this.autoCheckTimeouts) {
      this.checkTimeoutsSync();
    }

    const task = PendingTask.create(options);
    this.tasks.set(task.taskId, task);
    this.saveTask(task);

    // Notify callbacks
    for (const callback of this.approvalCallbacks) {
      try {
        callback(task.toJSON());
      } catch (e) {
        console.error('Approval callback error:', e);
      }
    }

    return task;
  }

  /**
   * Add an existing PendingTask to the queue.
   */
  addTask(task: PendingTask): void {
    this.tasks.set(task.taskId, task);
    this.saveTask(task);
  }

  /**
   * Get a task by ID.
   * 
   * @param taskId - The task ID
   * @returns The pending task, or null if not found
   */
  get(taskId: string): PendingTask | null {
    if (this.autoCheckTimeouts) {
      this.checkTimeoutsSync();
    }
    return this.tasks.get(taskId) ?? null;
  }

  /**
   * Remove a task from the queue.
   * 
   * @param taskId - The task ID to remove
   * @returns True if the task was removed
   */
  remove(taskId: string): boolean {
    const removed = this.tasks.delete(taskId);
    if (removed) {
      this.removeTaskFile(taskId);
    }
    return removed;
  }

  /**
   * Approve a task.
   * 
   * @param approval - The approval request
   * @returns Approval result
   */
  async approve(approval: ApprovalRequest | ApprovalRequestData): Promise<ApprovalResult> {
    const approvalData = approval instanceof ApprovalRequest ? approval.toJSON() : approval;
    const task = this.tasks.get(approvalData.taskId);

    if (!task) {
      return {
        success: false,
        error: ApprovalError.TASK_NOT_FOUND,
        message: `Task ${approvalData.taskId} not found in queue`,
      };
    }

    // Validate the approval
    const result = await this.validator.validate(task.toJSON(), approvalData);

    if (!result.success) {
      return result;
    }

    // Transition task to WORKING
    const previousState = task.state;
    try {
      task.approve();
    } catch (e) {
      return {
        success: false,
        error: ApprovalError.INVALID_STATE_TRANSITION,
        message: e instanceof Error ? e.message : String(e),
      };
    }

    // Persist and notify
    this.saveTask(task);
    this.notifyStateChange(task, previousState);

    return {
      success: true,
      task: task.toJSON(),
    };
  }

  /**
   * Reject a task.
   * 
   * @param rejection - The rejection data
   * @returns Rejection result
   */
  async reject(rejection: RejectionData): Promise<RejectionResult> {
    const task = this.tasks.get(rejection.taskId);

    if (!task) {
      return {
        success: false,
        error: ApprovalError.TASK_NOT_FOUND,
        message: `Task ${rejection.taskId} not found in queue`,
      };
    }

    if (!task.isPending) {
      return {
        success: false,
        error: ApprovalError.INVALID_STATE_TRANSITION,
        message: `Task is in ${task.state} state and cannot be rejected`,
      };
    }

    // Transition task to CANCELED
    const previousState = task.state;
    task.reject();

    // Handle trust action
    if (this.trustRegistry && rejection.trustAction !== 'none') {
      try {
        if (rejection.trustAction === 'block') {
          await this.trustRegistry.blockAgent(task.sourceAgent, rejection.reason, rejection.rejectedBy);
        } else if (rejection.trustAction === 'reduce') {
          await this.trustRegistry.recordViolation(
            task.sourceAgent,
            ViolationSeverity.MEDIUM,
            `Task rejected: ${rejection.reason}`
          );
        }
      } catch (e) {
        console.error('Failed to update trust:', e);
      }
    }

    // Persist and notify
    this.saveTask(task);
    this.notifyStateChange(task, previousState);

    return { success: true };
  }

  /**
   * Check for and handle timed-out tasks.
   * 
   * @returns Array of task IDs that were timed out
   */
  async checkTimeouts(): Promise<string[]> {
    return this.checkTimeoutsSync();
  }

  /**
   * Check for and handle timed-out tasks synchronously.
   */
  checkTimeoutsSync(): string[] {
    const timedOut: string[] = [];

    for (const [taskId, task] of this.tasks) {
      if (task.isPending && task.isExpired) {
        const previousState = task.state;
        task.timeout();
        this.saveTask(task);
        this.notifyStateChange(task, previousState);
        timedOut.push(taskId);
      }
    }

    return timedOut;
  }

  /**
   * List all pending tasks (in SUBMITTED state).
   */
  listPending(): PendingTask[] {
    if (this.autoCheckTimeouts) {
      this.checkTimeoutsSync();
    }
    return Array.from(this.tasks.values()).filter(task => task.isPending);
  }

  /**
   * List all tasks (any state).
   */
  listAll(): PendingTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * List tasks by state.
   */
  listByState(state: TaskState): PendingTask[] {
    return Array.from(this.tasks.values()).filter(task => task.state === state);
  }

  /**
   * Get the count of pending tasks.
   */
  get pendingCount(): number {
    return this.listPending().length;
  }

  /**
   * Get the total count of tasks.
   */
  get totalCount(): number {
    return this.tasks.size;
  }

  /**
   * Register a callback for when a new task needs approval.
   */
  onApprovalNeeded(callback: ApprovalNeededCallback): void {
    this.approvalCallbacks.push(callback);
  }

  /**
   * Register a callback for task state changes.
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Notify state change callbacks.
   */
  private notifyStateChange(task: PendingTask, previousState: TaskState): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(task.toJSON(), previousState);
      } catch (e) {
        console.error('State change callback error:', e);
      }
    }
  }

  /**
   * Mark a task as completed (from WORKING state).
   */
  markCompleted(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== TaskState.WORKING) {
      return false;
    }

    const previousState = task.state;
    task.complete();
    this.saveTask(task);
    this.notifyStateChange(task, previousState);
    return true;
  }

  /**
   * Mark a task as failed (from WORKING state).
   */
  markFailed(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== TaskState.WORKING) {
      return false;
    }

    const previousState = task.state;
    task.fail();
    this.saveTask(task);
    this.notifyStateChange(task, previousState);
    return true;
  }

  /**
   * Clear all tasks from the queue.
   */
  clear(): void {
    for (const taskId of this.tasks.keys()) {
      this.removeTaskFile(taskId);
    }
    this.tasks.clear();
  }

  /**
   * Get the store path.
   */
  getStorePath(): string {
    return this.storePath;
  }
}

/**
 * Get the default store path for the approval queue.
 */
export function getDefaultQueueStorePath(): string {
  return join(homedir(), '.openclaw', 'ha2ha', 'pending');
}
