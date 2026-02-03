/**
 * CLI Commands for Approval Workflow
 * 
 * Provides command-line interface for:
 * - ha2ha approve <taskId> - Approve a pending task
 * - ha2ha reject <taskId> --reason "..." - Reject a pending task
 * - ha2ha list - List pending tasks
 * - ha2ha show <taskId> - Show task details
 */

import { ApprovalQueue } from './approval-queue';
import { ApprovalRequest } from './approval-request';
import { ApprovalScope, TaskState, RejectionData } from './types';
import { PendingTask } from './pending-task';
import { getCanonicalJson } from './hash';

/**
 * CLI configuration options.
 */
export interface CliConfig {
  /** Path to the approval queue store */
  storePath?: string;
  /** Whether to output in JSON format */
  json?: boolean;
}

/**
 * Result of a CLI command.
 */
export interface CliResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Output message */
  message: string;
  /** Data for JSON output */
  data?: unknown;
  /** Exit code */
  exitCode: number;
}

/**
 * Parse CLI arguments into a structured format.
 */
export function parseArgs(args: string[]): {
  command: string;
  taskId?: string;
  options: Record<string, string | boolean>;
} {
  const command = args[0] ?? 'help';
  const taskId = args[1] && !args[1].startsWith('--') ? args[1] : undefined;

  const options: Record<string, string | boolean> = {};
  for (let i = taskId ? 2 : 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options[key] = nextArg;
        i++;
      } else {
        options[key] = true;
      }
    }
  }

  return { command, taskId, options };
}

/**
 * Run the CLI with the given arguments.
 * 
 * @param args - Command line arguments (without 'ha2ha' prefix)
 * @param config - CLI configuration
 * @returns CLI result
 * 
 * @example
 * ```typescript
 * // Approve a task
 * const result = await runCli(['approve', 'abc-123']);
 * 
 * // Reject a task
 * const result = await runCli(['reject', 'abc-123', '--reason', 'Not authorized']);
 * 
 * // List pending tasks
 * const result = await runCli(['list']);
 * 
 * // Show task details
 * const result = await runCli(['show', 'abc-123']);
 * ```
 */
export async function runCli(args: string[], config: CliConfig = {}): Promise<CliResult> {
  const { command, taskId, options } = parseArgs(args);

  // Load the queue
  const queue = new ApprovalQueue({ storePath: config.storePath });
  try {
    await queue.load();
  } catch (e) {
    // Queue might not exist yet
  }

  switch (command) {
    case 'approve':
      return handleApprove(queue, taskId, options, config);
    case 'reject':
      return handleReject(queue, taskId, options, config);
    case 'list':
      return handleList(queue, options, config);
    case 'show':
      return handleShow(queue, taskId, options, config);
    case 'help':
    default:
      return handleHelp();
  }
}

/**
 * Handle the 'approve' command.
 */
async function handleApprove(
  queue: ApprovalQueue,
  taskId: string | undefined,
  options: Record<string, string | boolean>,
  config: CliConfig
): Promise<CliResult> {
  if (!taskId) {
    return {
      success: false,
      message: 'Usage: ha2ha approve <taskId> [--approver <id>]',
      exitCode: 1,
    };
  }

  const task = queue.get(taskId);
  if (!task) {
    return {
      success: false,
      message: `Task not found: ${taskId}`,
      exitCode: 1,
    };
  }

  if (!task.canBeApproved) {
    return {
      success: false,
      message: `Task cannot be approved: ${task.isExpired ? 'expired' : task.state}`,
      exitCode: 1,
    };
  }

  // Create an unsigned approval (CLI approval without cryptographic signature)
  const approver = (options.approver as string) ?? 'cli-user';
  const approval = ApprovalRequest.createUnsigned(
    taskId,
    approver,
    task.payloadHash,
    ApprovalScope.SINGLE
  );

  // Validate approval without signature requirement
  const result = await queue.approve(approval);

  if (result.success) {
    const output = config.json
      ? JSON.stringify({ success: true, taskId, approvedBy: approver })
      : `✓ Task ${taskId} approved by ${approver}`;
    return {
      success: true,
      message: output,
      data: { taskId, approvedBy: approver },
      exitCode: 0,
    };
  } else {
    const output = config.json
      ? JSON.stringify({ success: false, error: result.error, message: result.message })
      : `✗ Approval failed: ${result.message}`;
    return {
      success: false,
      message: output,
      data: { error: result.error, message: result.message },
      exitCode: 1,
    };
  }
}

/**
 * Handle the 'reject' command.
 */
async function handleReject(
  queue: ApprovalQueue,
  taskId: string | undefined,
  options: Record<string, string | boolean>,
  config: CliConfig
): Promise<CliResult> {
  if (!taskId) {
    return {
      success: false,
      message: 'Usage: ha2ha reject <taskId> --reason "<reason>" [--trust-action none|reduce|block]',
      exitCode: 1,
    };
  }

  const task = queue.get(taskId);
  if (!task) {
    return {
      success: false,
      message: `Task not found: ${taskId}`,
      exitCode: 1,
    };
  }

  if (!task.isPending) {
    return {
      success: false,
      message: `Task cannot be rejected: already in ${task.state} state`,
      exitCode: 1,
    };
  }

  const reason = (options.reason as string) ?? 'Rejected via CLI';
  const trustAction = (options['trust-action'] as 'none' | 'reduce' | 'block') ?? 'none';
  const rejectedBy = (options.rejector as string) ?? 'cli-user';

  const rejection: RejectionData = {
    taskId,
    rejectedBy,
    reason,
    trustAction,
    createdAt: new Date().toISOString(),
  };

  const result = await queue.reject(rejection);

  if (result.success) {
    const output = config.json
      ? JSON.stringify({ success: true, taskId, reason, trustAction })
      : `✓ Task ${taskId} rejected: ${reason}`;
    return {
      success: true,
      message: output,
      data: { taskId, reason, trustAction },
      exitCode: 0,
    };
  } else {
    const output = config.json
      ? JSON.stringify({ success: false, error: result.error, message: result.message })
      : `✗ Rejection failed: ${result.message}`;
    return {
      success: false,
      message: output,
      data: { error: result.error, message: result.message },
      exitCode: 1,
    };
  }
}

/**
 * Handle the 'list' command.
 */
async function handleList(
  queue: ApprovalQueue,
  options: Record<string, string | boolean>,
  config: CliConfig
): Promise<CliResult> {
  const all = options.all === true;
  const state = options.state as string | undefined;

  let tasks: PendingTask[];
  if (state) {
    const stateEnum = TaskState[state.toUpperCase() as keyof typeof TaskState];
    if (!stateEnum) {
      return {
        success: false,
        message: `Invalid state: ${state}. Valid: SUBMITTED, WORKING, COMPLETED, FAILED, CANCELED`,
        exitCode: 1,
      };
    }
    tasks = queue.listByState(stateEnum);
  } else if (all) {
    tasks = queue.listAll();
  } else {
    tasks = queue.listPending();
  }

  if (config.json) {
    return {
      success: true,
      message: JSON.stringify(tasks.map(t => t.toJSON()), null, 2),
      data: tasks.map(t => t.toJSON()),
      exitCode: 0,
    };
  }

  if (tasks.length === 0) {
    return {
      success: true,
      message: all ? 'No tasks in queue.' : 'No pending tasks awaiting approval.',
      exitCode: 0,
    };
  }

  const lines = [
    `${tasks.length} task(s):`,
    '',
    '  ID                                   From                          State       Time Left',
    '  ─────────────────────────────────────────────────────────────────────────────────────────',
  ];

  for (const task of tasks) {
    const timeRemaining = task.isPending
      ? `${Math.ceil(task.timeRemaining / 1000 / 60)} min`
      : '—';
    lines.push(
      `  ${task.taskId.padEnd(36)} ${task.sourceAgent.padEnd(29)} ${task.state.padEnd(11)} ${timeRemaining}`
    );
  }

  return {
    success: true,
    message: lines.join('\n'),
    data: tasks.map(t => t.toJSON()),
    exitCode: 0,
  };
}

/**
 * Handle the 'show' command.
 */
async function handleShow(
  queue: ApprovalQueue,
  taskId: string | undefined,
  options: Record<string, string | boolean>,
  config: CliConfig
): Promise<CliResult> {
  if (!taskId) {
    return {
      success: false,
      message: 'Usage: ha2ha show <taskId>',
      exitCode: 1,
    };
  }

  const task = queue.get(taskId);
  if (!task) {
    return {
      success: false,
      message: `Task not found: ${taskId}`,
      exitCode: 1,
    };
  }

  if (config.json) {
    const data = {
      ...task.toJSON(),
      canonicalPayload: getCanonicalJson(task.payload),
    };
    return {
      success: true,
      message: JSON.stringify(data, null, 2),
      data,
      exitCode: 0,
    };
  }

  const lines = [
    task.getSummary(),
    '',
    'Payload:',
    JSON.stringify(task.payload, null, 2),
  ];

  return {
    success: true,
    message: lines.join('\n'),
    data: task.toJSON(),
    exitCode: 0,
  };
}

/**
 * Handle the 'help' command.
 */
function handleHelp(): CliResult {
  const help = `
HA2HA Approval Workflow CLI

Commands:
  approve <taskId>     Approve a pending task
    --approver <id>    Identity of the approver (default: cli-user)

  reject <taskId>      Reject a pending task
    --reason <text>    Reason for rejection (required)
    --trust-action <action>  Trust action: none, reduce, block (default: none)
    --rejector <id>    Identity of the rejecter (default: cli-user)

  list                 List pending tasks
    --all              Show all tasks, not just pending
    --state <state>    Filter by state: SUBMITTED, WORKING, COMPLETED, FAILED, CANCELED

  show <taskId>        Show details of a task

Options:
  --json               Output in JSON format

Examples:
  ha2ha approve abc-123
  ha2ha reject abc-123 --reason "Not authorized" --trust-action reduce
  ha2ha list
  ha2ha list --all --json
  ha2ha show abc-123
`;

  return {
    success: true,
    message: help.trim(),
    exitCode: 0,
  };
}

/**
 * Format a task for display.
 */
export function formatTask(task: PendingTask): string {
  return task.getSummary();
}

/**
 * Format tasks as a table.
 */
export function formatTaskTable(tasks: PendingTask[]): string {
  if (tasks.length === 0) {
    return 'No tasks.';
  }

  const lines = [
    'ID                                   From                          State       Time Left',
    '─────────────────────────────────────────────────────────────────────────────────────────',
  ];

  for (const task of tasks) {
    const timeRemaining = task.isPending
      ? `${Math.ceil(task.timeRemaining / 1000 / 60)} min`
      : '—';
    lines.push(
      `${task.taskId.padEnd(36)} ${task.sourceAgent.padEnd(29)} ${task.state.padEnd(11)} ${timeRemaining}`
    );
  }

  return lines.join('\n');
}
