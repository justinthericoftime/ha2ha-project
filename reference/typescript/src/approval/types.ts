/**
 * Approval Workflow Types
 * 
 * Implements §6 Message Flows and §7 Operations from HA2HA specification.
 * Defines task states, approval scopes, and related structures.
 */

/**
 * Task lifecycle states as defined in the HA2HA spec.
 * Tasks progress through these states from submission to completion.
 */
export enum TaskState {
  /** Task received, awaiting human approval */
  SUBMITTED = 'SUBMITTED',
  /** Task approved and currently executing */
  WORKING = 'WORKING',
  /** Task completed successfully */
  COMPLETED = 'COMPLETED',
  /** Task execution failed */
  FAILED = 'FAILED',
  /** Task was rejected, timed out, or manually canceled */
  CANCELED = 'CANCELED',
}

/**
 * Scope of approval - determines what the approval covers.
 */
export enum ApprovalScope {
  /** Approves only this specific task */
  SINGLE = 'single',
  /** Approves this task and similar future tasks */
  SIMILAR = 'similar',
  /** Approves this entire category of tasks (not implemented in v0.1) */
  CATEGORY = 'category',
}

/**
 * Data structure for a pending task awaiting approval.
 */
export interface PendingTaskData {
  /** Unique task identifier */
  taskId: string;
  /** Agent that submitted the task */
  sourceAgent: string;
  /** Agent that will execute the task */
  targetAgent: string;
  /** The task payload (action, parameters, etc.) */
  payload: unknown;
  /** SHA-256 hash of the canonical JSON payload */
  payloadHash: string;
  /** Current task state */
  state: TaskState;
  /** When the task was received (ISO 8601) */
  receivedAt: string;
  /** When the task will auto-expire if not approved (ISO 8601) */
  expiresAt: string;
  /** Trust level of the source agent at submission time */
  trustLevel: number;
  /** Optional description of the task for human review */
  description?: string;
}

/**
 * Data structure for an approval request from a human.
 */
export interface ApprovalRequestData {
  /** Task ID being approved */
  taskId: string;
  /** Identity of the human approver */
  approvedBy: string;
  /** Scope of this approval */
  approvalScope: ApprovalScope;
  /** When the approval expires (ISO 8601), for SIMILAR scope */
  expiresAt?: string;
  /** SHA-256 hash of the payload being approved */
  payloadHash: string;
  /** Cryptographic signature from the approver */
  approverSignature: string;
  /** Optional conditions on the approval */
  conditions?: ApprovalConditions;
  /** When the approval was created (ISO 8601) */
  createdAt: string;
}

/**
 * Conditions that can be attached to an approval.
 */
export interface ApprovalConditions {
  /** Maximum cost/resource usage allowed */
  maxCost?: number;
  /** List of specific actions allowed */
  allowedActions?: string[];
  /** Custom conditions (implementation-specific) */
  custom?: Record<string, unknown>;
}

/**
 * Data structure for a task rejection.
 */
export interface RejectionData {
  /** Task ID being rejected */
  taskId: string;
  /** Identity of the human who rejected */
  rejectedBy: string;
  /** Human-readable reason for rejection */
  reason: string;
  /** Action to take on trust */
  trustAction: 'none' | 'reduce' | 'block';
  /** New trust level if action is 'reduce' */
  trustLevelNew?: number;
  /** When the rejection was created (ISO 8601) */
  createdAt: string;
}

/**
 * Error codes for approval workflow failures.
 */
export enum ApprovalError {
  /** The approval has expired */
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  /** Task was already rejected */
  TASK_ALREADY_REJECTED = 'TASK_ALREADY_REJECTED',
  /** Task was already approved */
  TASK_ALREADY_APPROVED = 'TASK_ALREADY_APPROVED',
  /** Task not found in the queue */
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  /** Payload hash doesn't match */
  HASH_MISMATCH = 'HASH_MISMATCH',
  /** Approver doesn't have permission */
  APPROVER_NOT_QUALIFIED = 'APPROVER_NOT_QUALIFIED',
  /** Signature verification failed */
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  /** Invalid state transition */
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  /** Task has timed out */
  TASK_TIMEOUT = 'TASK_TIMEOUT',
}

/**
 * Result of an approval validation.
 */
export interface ApprovalResult {
  /** Whether the approval was successful */
  success: boolean;
  /** Error code if unsuccessful */
  error?: ApprovalError;
  /** Human-readable error message */
  message?: string;
  /** The approved task data */
  task?: PendingTaskData;
}

/**
 * Result of a rejection.
 */
export interface RejectionResult {
  /** Whether the rejection was processed */
  success: boolean;
  /** Error code if unsuccessful */
  error?: ApprovalError;
  /** Human-readable error message */
  message?: string;
}

/**
 * Callback type for approval notifications.
 */
export type ApprovalNeededCallback = (task: PendingTaskData) => void;

/**
 * Callback type for state change notifications.
 */
export type StateChangeCallback = (task: PendingTaskData, previousState: TaskState) => void;

/**
 * Default timeout for pending tasks (1 hour in milliseconds).
 */
export const DEFAULT_TASK_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Default timeout for SIMILAR scope approvals (24 hours in milliseconds).
 */
export const DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;
