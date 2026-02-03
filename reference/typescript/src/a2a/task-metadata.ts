/**
 * HA2HA Task Metadata Extension
 * 
 * Handles HA2HA metadata injection into A2A tasks.
 * Implements HA2HA Specification §4.4 (Task Metadata Extensions).
 */

import type {
  Ha2haTaskMetadata,
  Ha2haTrustContext,
} from './types';

/**
 * Default approval timeout in ISO 8601 duration format (1 hour).
 */
export const DEFAULT_APPROVAL_TIMEOUT = 'PT1H';

/**
 * Trust level names per specification.
 */
export const TRUST_LEVEL_NAMES: Record<number, string> = {
  0: 'BLOCKED',
  1: 'UNKNOWN',
  2: 'PROVISIONAL',
  3: 'STANDARD',
  4: 'TRUSTED',
  5: 'VERIFIED',
};

/**
 * Options for creating task metadata.
 */
export interface CreateTaskMetadataOptions {
  /** Agent ID making the request */
  requestingAgent: string;
  /** Human identifier associated with the request */
  requestingHuman: string;
  /** Current trust level of the requesting agent */
  trustLevel: number;
  /** Whether human approval is required (default: true) */
  approvalRequired?: boolean;
  /** Approval timeout in ISO 8601 duration (default: PT1H) */
  approvalTimeout?: string;
  /** Unique audit identifier (auto-generated if not provided) */
  auditId?: string;
}

/**
 * Create HA2HA task metadata for inclusion in A2A task requests.
 * 
 * @param options - Task metadata options
 * @returns HA2HA task metadata object
 * 
 * @example
 * ```typescript
 * const metadata = createTaskMetadata({
 *   requestingAgent: 'agent-a.example.ha2ha',
 *   requestingHuman: 'ricardo@example.com',
 *   trustLevel: 3,
 * });
 * 
 * const task = {
 *   id: 'task-uuid',
 *   metadata: {
 *     ha2ha: metadata,
 *   },
 * };
 * ```
 */
export function createTaskMetadata(options: CreateTaskMetadataOptions): Ha2haTaskMetadata {
  return {
    requestingAgent: options.requestingAgent,
    requestingHuman: options.requestingHuman,
    trustLevel: options.trustLevel,
    approvalRequired: options.approvalRequired ?? true,
    approvalTimeout: options.approvalTimeout ?? DEFAULT_APPROVAL_TIMEOUT,
    auditId: options.auditId ?? generateAuditId(),
  };
}

/**
 * Options for creating trust context.
 */
export interface CreateTrustContextOptions {
  /** Current trust level (0-5) */
  level: number;
  /** ISO 8601 timestamp of last transition */
  lastTransition: string;
  /** Reason for last change */
  transitionReason: string;
  /** Cumulative violations at current level */
  violationCount?: number;
  /** ISO 8601 timestamp when cooldown ends (optional) */
  cooldownExpires?: string;
  /** Pre-approved action categories (Level 3+) */
  preApprovalScope?: string[];
}

/**
 * Create trust context for inclusion in task metadata.
 * 
 * @param options - Trust context options
 * @returns HA2HA trust context object
 */
export function createTrustContext(options: CreateTrustContextOptions): Ha2haTrustContext {
  const levelName = TRUST_LEVEL_NAMES[options.level] ?? 'UNKNOWN';
  
  return {
    level: options.level,
    levelName,
    lastTransition: options.lastTransition,
    transitionReason: options.transitionReason,
    violationCount: options.violationCount ?? 0,
    cooldownExpires: options.cooldownExpires ?? null,
    preApprovalScope: options.preApprovalScope,
  };
}

/**
 * Validate task metadata.
 * 
 * @param metadata - Metadata to validate
 * @returns Validation result
 */
export function validateTaskMetadata(metadata: Ha2haTaskMetadata): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!metadata.requestingAgent) {
    errors.push('requestingAgent is required');
  }
  if (!metadata.requestingHuman) {
    errors.push('requestingHuman is required');
  }
  if (typeof metadata.trustLevel !== 'number') {
    errors.push('trustLevel must be a number');
  } else if (metadata.trustLevel < 0 || metadata.trustLevel > 5) {
    errors.push('trustLevel must be between 0 and 5');
  }
  if (typeof metadata.approvalRequired !== 'boolean') {
    errors.push('approvalRequired must be a boolean');
  }
  if (!metadata.approvalTimeout) {
    errors.push('approvalTimeout is required');
  } else if (!isValidIso8601Duration(metadata.approvalTimeout)) {
    errors.push('approvalTimeout must be valid ISO 8601 duration');
  }
  if (!metadata.auditId) {
    errors.push('auditId is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate trust context.
 * 
 * @param context - Context to validate
 * @returns Validation result
 */
export function validateTrustContext(context: Ha2haTrustContext): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof context.level !== 'number' || context.level < 0 || context.level > 5) {
    errors.push('level must be between 0 and 5');
  }
  if (!context.levelName) {
    errors.push('levelName is required');
  }
  if (!context.lastTransition || !isValidIso8601(context.lastTransition)) {
    errors.push('lastTransition must be valid ISO 8601 timestamp');
  }
  if (!context.transitionReason) {
    errors.push('transitionReason is required');
  }
  if (typeof context.violationCount !== 'number' || context.violationCount < 0) {
    errors.push('violationCount must be a non-negative number');
  }
  if (context.cooldownExpires !== null && !isValidIso8601(context.cooldownExpires)) {
    errors.push('cooldownExpires must be valid ISO 8601 timestamp or null');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extract HA2HA metadata from a task's metadata object.
 * 
 * @param taskMetadata - The task's full metadata object
 * @returns HA2HA metadata or undefined if not present
 */
export function extractHa2haMetadata(
  taskMetadata?: Record<string, unknown>
): Ha2haTaskMetadata | undefined {
  if (!taskMetadata || !taskMetadata.ha2ha) {
    return undefined;
  }
  return taskMetadata.ha2ha as Ha2haTaskMetadata;
}

/**
 * Extract trust context from a task's metadata object.
 * 
 * @param taskMetadata - The task's full metadata object
 * @returns Trust context or undefined if not present
 */
export function extractTrustContext(
  taskMetadata?: Record<string, unknown>
): Ha2haTrustContext | undefined {
  const ha2ha = extractHa2haMetadata(taskMetadata);
  if (!ha2ha) return undefined;
  
  // Trust context may be nested under ha2ha.trustContext
  const metadata = taskMetadata as { ha2ha?: { trustContext?: Ha2haTrustContext } };
  return metadata.ha2ha?.trustContext;
}

/**
 * Inject HA2HA metadata into an A2A task object.
 * 
 * @param task - The A2A task object
 * @param metadata - HA2HA metadata to inject
 * @returns Modified task with metadata
 */
export function injectMetadata<T extends { metadata?: Record<string, unknown> }>(
  task: T,
  metadata: Ha2haTaskMetadata
): T {
  return {
    ...task,
    metadata: {
      ...task.metadata,
      ha2ha: metadata,
    },
  };
}

/**
 * Inject both metadata and trust context into an A2A task.
 * 
 * @param task - The A2A task object
 * @param metadata - HA2HA metadata
 * @param trustContext - Trust context
 * @returns Modified task with metadata and trust context
 */
export function injectMetadataWithTrust<T extends { metadata?: Record<string, unknown> }>(
  task: T,
  metadata: Ha2haTaskMetadata,
  trustContext: Ha2haTrustContext
): T {
  return {
    ...task,
    metadata: {
      ...task.metadata,
      ha2ha: {
        ...metadata,
        trustContext,
      },
    },
  };
}

/**
 * Parse ISO 8601 duration to milliseconds.
 * Supports basic duration format: PT{hours}H{minutes}M{seconds}S
 * 
 * @param duration - ISO 8601 duration string
 * @returns Duration in milliseconds
 */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) {
    throw new Error(`Invalid ISO 8601 duration: ${duration}`);
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

/**
 * Convert milliseconds to ISO 8601 duration.
 * 
 * @param ms - Duration in milliseconds
 * @returns ISO 8601 duration string
 */
export function msToDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let duration = 'PT';
  if (hours > 0) duration += `${hours}H`;
  if (minutes > 0) duration += `${minutes}M`;
  if (seconds > 0 || duration === 'PT') duration += `${seconds}S`;

  return duration;
}

/**
 * Check if a task's approval has timed out.
 * 
 * @param submittedAt - When the task was submitted (ISO 8601)
 * @param approvalTimeout - Timeout duration (ISO 8601)
 * @param now - Current time (defaults to now)
 * @returns True if approval has timed out
 */
export function isApprovalTimedOut(
  submittedAt: string,
  approvalTimeout: string,
  now: Date = new Date()
): boolean {
  const submitted = new Date(submittedAt);
  const timeoutMs = parseDurationToMs(approvalTimeout);
  const expiresAt = new Date(submitted.getTime() + timeoutMs);
  return now >= expiresAt;
}

/**
 * Calculate when approval expires.
 * 
 * @param submittedAt - When the task was submitted (ISO 8601)
 * @param approvalTimeout - Timeout duration (ISO 8601)
 * @returns Expiration timestamp as ISO 8601
 */
export function calculateApprovalExpiry(
  submittedAt: string,
  approvalTimeout: string
): string {
  const submitted = new Date(submittedAt);
  const timeoutMs = parseDurationToMs(approvalTimeout);
  const expiresAt = new Date(submitted.getTime() + timeoutMs);
  return expiresAt.toISOString();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique audit ID.
 */
function generateAuditId(): string {
  // Simple UUID v4-like generation
  const hex = '0123456789abcdef';
  let id = 'audit-';
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) {
      id += '-';
    }
    id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}

/**
 * Check if a string is a valid ISO 8601 duration.
 */
function isValidIso8601Duration(duration: string): boolean {
  // Basic check for PT format
  return /^PT(?:\d+H)?(?:\d+M)?(?:\d+S)?$/.test(duration);
}

/**
 * Check if a string is a valid ISO 8601 timestamp.
 */
function isValidIso8601(timestamp: string): boolean {
  const date = new Date(timestamp);
  return !isNaN(date.getTime());
}
