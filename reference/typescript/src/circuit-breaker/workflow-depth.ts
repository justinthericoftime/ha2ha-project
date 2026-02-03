/**
 * Workflow Depth Tracker
 * 
 * Tracks task chain depth to prevent infinite delegation loops.
 * Implements §8.8 depth limiting from HA2HA specification.
 */

import { WorkflowDepthError } from './types';

/**
 * Task metadata that includes workflow depth information
 */
export interface Ha2haTaskMetadata {
  /** Current workflow depth (1 = original task) */
  workflowDepth?: number;
  /** Chain of task IDs leading to this task */
  taskChain?: string[];
  /** Original task ID that started the chain */
  originTaskId?: string;
  /** Any other metadata */
  [key: string]: unknown;
}

/**
 * Result of a depth check
 */
export interface DepthCheckResult {
  /** Whether the depth is within limits */
  allowed: boolean;
  /** Current depth */
  depth: number;
  /** Maximum allowed depth */
  maxDepth: number;
  /** Error details if not allowed */
  error?: WorkflowDepthError;
}

/**
 * Tracks workflow depth to prevent infinite task delegation
 * 
 * Maximum depth of 3 means:
 * - Depth 1: Original task from human
 * - Depth 2: First delegation
 * - Depth 3: Second delegation (maximum)
 * - Depth 4+: Rejected
 */
export class WorkflowDepthTracker {
  /** Maximum allowed workflow depth */
  static readonly MAX_DEPTH = 3;

  /**
   * Get the current depth from task metadata
   */
  static getDepth(taskMetadata: Ha2haTaskMetadata): number {
    return taskMetadata.workflowDepth ?? 1;
  }

  /**
   * Get the task chain from metadata
   */
  static getTaskChain(taskMetadata: Ha2haTaskMetadata): string[] {
    return taskMetadata.taskChain ?? [];
  }

  /**
   * Check if the current depth is within limits
   */
  static checkDepth(depth: number): boolean {
    return depth <= WorkflowDepthTracker.MAX_DEPTH;
  }

  /**
   * Check depth and return detailed result
   */
  static checkDepthDetailed(taskMetadata: Ha2haTaskMetadata): DepthCheckResult {
    const depth = WorkflowDepthTracker.getDepth(taskMetadata);
    const allowed = WorkflowDepthTracker.checkDepth(depth);

    if (allowed) {
      return {
        allowed: true,
        depth,
        maxDepth: WorkflowDepthTracker.MAX_DEPTH,
      };
    }

    return {
      allowed: false,
      depth,
      maxDepth: WorkflowDepthTracker.MAX_DEPTH,
      error: {
        depth,
        maxDepth: WorkflowDepthTracker.MAX_DEPTH,
        taskChain: WorkflowDepthTracker.getTaskChain(taskMetadata),
      },
    };
  }

  /**
   * Check if a delegation would exceed depth limits
   */
  static canDelegate(taskMetadata: Ha2haTaskMetadata): boolean {
    const depth = WorkflowDepthTracker.getDepth(taskMetadata);
    // Can delegate if next depth would be within limits
    return depth < WorkflowDepthTracker.MAX_DEPTH;
  }

  /**
   * Increment depth for a delegated task
   */
  static incrementDepth(
    taskMetadata: Ha2haTaskMetadata,
    taskId?: string
  ): Ha2haTaskMetadata {
    const currentDepth = WorkflowDepthTracker.getDepth(taskMetadata);
    const currentChain = WorkflowDepthTracker.getTaskChain(taskMetadata);
    const originTaskId = taskMetadata.originTaskId ?? taskId;

    return {
      ...taskMetadata,
      workflowDepth: currentDepth + 1,
      taskChain: taskId ? [...currentChain, taskId] : currentChain,
      originTaskId,
    };
  }

  /**
   * Create initial metadata for a new workflow
   */
  static createInitialMetadata(taskId?: string): Ha2haTaskMetadata {
    return {
      workflowDepth: 1,
      taskChain: taskId ? [taskId] : [],
      originTaskId: taskId,
    };
  }

  /**
   * Validate that metadata is properly formed
   */
  static validateMetadata(taskMetadata: Ha2haTaskMetadata): boolean {
    const depth = taskMetadata.workflowDepth;
    const chain = taskMetadata.taskChain;

    // Depth must be positive integer
    if (depth !== undefined && (typeof depth !== 'number' || depth < 1 || !Number.isInteger(depth))) {
      return false;
    }

    // Chain must be array of strings
    if (chain !== undefined && (!Array.isArray(chain) || !chain.every(id => typeof id === 'string'))) {
      return false;
    }

    // Chain length should be consistent with depth (if both present)
    if (depth !== undefined && chain !== undefined) {
      // Chain length should be depth - 1 (original task has depth 1, chain length 0)
      // or depth (if current task is in chain)
      if (chain.length > depth) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Error thrown when workflow depth is exceeded
 */
export class WorkflowDepthExceededError extends Error {
  readonly depth: number;
  readonly maxDepth: number;
  readonly taskChain: string[];

  constructor(error: WorkflowDepthError) {
    super(
      `Workflow depth exceeded: ${error.depth} > ${error.maxDepth}. ` +
      `Task chain: ${error.taskChain.join(' → ') || '(empty)'}`
    );
    this.name = 'WorkflowDepthExceededError';
    this.depth = error.depth;
    this.maxDepth = error.maxDepth;
    this.taskChain = error.taskChain;
  }
}
