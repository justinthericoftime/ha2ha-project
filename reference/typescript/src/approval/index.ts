/**
 * Approval Workflow Module
 * 
 * Implements §6 Message Flows and §7 Operations from HA2HA specification.
 * Provides human approval workflow for cross-agent tasks.
 * 
 * Key Features:
 * - Tasks enter SUBMITTED state and await human approval
 * - Approvals include SHA-256 hash commitment to payload
 * - Hash mismatch results in rejection
 * - Timeout (1 hour default) auto-cancels tasks
 * - CLI commands for approve/reject/list
 * 
 * @example
 * ```typescript
 * import { TaskLifecycle, PendingTask, ApprovalScope } from '@ha2ha/reference/approval';
 * 
 * // Create lifecycle manager
 * const lifecycle = new TaskLifecycle();
 * await lifecycle.load();
 * 
 * // Submit a task
 * const result = await lifecycle.submit({
 *   sourceAgent: 'agent-a.example.ha2ha',
 *   targetAgent: 'agent-b.example.ha2ha',
 *   payload: { action: 'read', path: '/tmp/file.txt' },
 *   trustLevel: 3,
 * });
 * 
 * // Task is now in SUBMITTED state, awaiting approval
 * console.log(result.task.state); // 'SUBMITTED'
 * 
 * // Approve the task (requires human identity)
 * const approvalResult = await lifecycle.approve(
 *   result.task.taskId,
 *   humanIdentity,
 *   ApprovalScope.SINGLE
 * );
 * 
 * // Task is now WORKING
 * console.log(lifecycle.getTask(result.task.taskId).state); // 'WORKING'
 * ```
 */

// Types
export {
  TaskState,
  ApprovalScope,
  PendingTaskData,
  ApprovalRequestData,
  ApprovalConditions,
  RejectionData,
  ApprovalError,
  ApprovalResult,
  RejectionResult,
  ApprovalNeededCallback,
  StateChangeCallback,
  DEFAULT_TASK_TIMEOUT_MS,
  DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS,
} from './types';

// Hash utilities
export {
  computePayloadHash,
  verifyPayloadHash,
  getCanonicalJson,
  createApprovalMessage,
  createRejectionMessage,
} from './hash';

// Pending Task
export {
  PendingTask,
  CreateTaskOptions,
} from './pending-task';

// Approval Request
export {
  ApprovalRequest,
  CreateApprovalOptions,
} from './approval-request';

// Validator
export {
  ApprovalValidator,
  ValidatorConfig,
  createValidator,
} from './validator';

// Approval Queue
export {
  ApprovalQueue,
  ApprovalQueueConfig,
  getDefaultQueueStorePath,
} from './approval-queue';

// Task Lifecycle
export {
  TaskLifecycle,
  TaskLifecycleConfig,
  SubmitResult,
  ExecuteResult,
  createTaskLifecycle,
  assertApprovalRequired,
} from './task-lifecycle';

// CLI
export {
  runCli,
  parseArgs,
  formatTask,
  formatTaskTable,
  CliConfig,
  CliResult,
} from './cli';
