/**
 * Audit Types
 * 
 * Defines types for the hash-chained audit log system as specified
 * in HA2HA Specification §8.9 (Audit Log Integrity).
 */

/**
 * Event types that can be recorded in the audit log.
 * These cover all significant HA2HA protocol events.
 */
export enum AuditEventType {
  // Task lifecycle events
  TASK_SUBMITTED = 'task.submitted',
  TASK_APPROVED = 'task.approved',
  TASK_REJECTED = 'task.rejected',
  TASK_EXECUTED = 'task.executed',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_TIMEOUT = 'task.timeout',
  TASK_CANCELLED = 'task.cancelled',
  
  // Trust events
  TRUST_ESTABLISHED = 'trust.established',
  TRUST_ELEVATED = 'trust.elevated',
  TRUST_REDUCED = 'trust.reduced',
  TRUST_REVOKED = 'trust.revoked',
  TRUST_VIOLATION = 'trust.violation',
  
  // Federation events
  FEDERATION_REQUEST = 'federation.request',
  FEDERATION_ACCEPTED = 'federation.accepted',
  FEDERATION_REJECTED = 'federation.rejected',
  
  // Security events
  SECURITY_ALERT = 'security.alert',
  SECURITY_CIRCUIT_OPEN = 'security.circuit_open',
  SECURITY_CIRCUIT_CLOSE = 'security.circuit_close',
  
  // Chain events
  CHAIN_GENESIS = 'chain.genesis',
  CHAIN_VERIFIED = 'chain.verified',
  CHAIN_TAMPER_DETECTED = 'chain.tamper_detected',
  
  // System events
  SYSTEM_STARTUP = 'system.startup',
  SYSTEM_SHUTDOWN = 'system.shutdown',
}

/**
 * Outcome of an audited event.
 */
export type AuditOutcome = 'success' | 'rejected' | 'error' | 'pending';

/**
 * Serializable data for an audit entry (before hash computation).
 */
export interface AuditEntryData {
  /** ISO 8601 timestamp when the event occurred */
  timestamp: string;
  
  /** Type of event being recorded */
  eventType: AuditEventType;
  
  /** Unique identifier for the entry */
  entryId: string;
  
  /** Task ID if this event relates to a specific task */
  taskId?: string;
  
  /** Agent ID of the source/initiator */
  sourceAgentId: string;
  
  /** Agent ID of the target/recipient (may be same as source) */
  targetAgentId: string;
  
  /** Human approver ID if applicable */
  humanId?: string;
  
  /** Trust level at the time of the event */
  trustLevel: number;
  
  /** Outcome of the event */
  outcome: AuditOutcome;
  
  /** Additional event-specific details */
  details: Record<string, unknown>;
  
  /** Hash of the previous entry in the chain (null for genesis) */
  prevHash: string | null;
}

/**
 * Complete audit entry including its computed hash.
 */
export interface AuditEntry extends AuditEntryData {
  /** SHA-256 hash of this entry's content (excluding this field) */
  hash: string;
}

/**
 * Input data for creating a new audit entry.
 * entryId, timestamp, prevHash, and hash are computed automatically.
 */
export interface AuditEntryInput {
  eventType: AuditEventType;
  taskId?: string;
  sourceAgentId: string;
  targetAgentId: string;
  humanId?: string;
  trustLevel: number;
  outcome: AuditOutcome;
  details?: Record<string, unknown>;
}

/**
 * Result of chain verification.
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  
  /** Total number of entries verified */
  entriesVerified: number;
  
  /** Index where the chain breaks (if invalid) */
  brokenAt?: number;
  
  /** Type of integrity violation detected */
  errorType?: 'hash_mismatch' | 'prev_hash_mismatch' | 'missing_entry' | 'invalid_format';
  
  /** Description of the error */
  errorMessage?: string;
  
  /** Entries around the break point for forensic analysis */
  evidence?: AuditEntry[];
  
  /** Timestamp of verification */
  verifiedAt: string;
}

/**
 * Options for querying the audit log.
 */
export interface AuditQueryOptions {
  /** Filter by event types */
  eventTypes?: AuditEventType[];
  
  /** Filter by task ID */
  taskId?: string;
  
  /** Filter by source agent ID */
  sourceAgentId?: string;
  
  /** Filter by target agent ID */
  targetAgentId?: string;
  
  /** Filter by human approver ID */
  humanId?: string;
  
  /** Filter by outcome */
  outcome?: AuditOutcome;
  
  /** Start time for time range filter (inclusive) */
  startTime?: string;
  
  /** End time for time range filter (exclusive) */
  endTime?: string;
  
  /** Maximum number of entries to return */
  limit?: number;
  
  /** Number of entries to skip (for pagination) */
  offset?: number;
  
  /** Sort order: 'asc' for oldest first, 'desc' for newest first */
  order?: 'asc' | 'desc';
}

/**
 * Result of an audit query.
 */
export interface AuditQueryResult {
  /** Matching entries */
  entries: AuditEntry[];
  
  /** Total count of matching entries (before pagination) */
  totalCount: number;
  
  /** Whether there are more entries beyond the current page */
  hasMore: boolean;
  
  /** Query execution timestamp */
  queriedAt: string;
}

/**
 * Configuration for the audit chain.
 */
export interface AuditChainConfig {
  /** Path to the audit log file */
  storePath: string;
  
  /** Whether to verify chain integrity on load (default: true) */
  verifyOnLoad?: boolean;
  
  /** Agent ID of this node (used for chain genesis) */
  agentId: string;
  
  /** Auto-flush after each append (default: true) */
  autoFlush?: boolean;
}

/**
 * Default configuration values.
 */
export const DEFAULT_AUDIT_CONFIG: Partial<AuditChainConfig> = {
  verifyOnLoad: true,
  autoFlush: true,
};

/**
 * Human-readable names for event types.
 */
export const EVENT_TYPE_NAMES: Record<AuditEventType, string> = {
  [AuditEventType.TASK_SUBMITTED]: 'Task Submitted',
  [AuditEventType.TASK_APPROVED]: 'Task Approved',
  [AuditEventType.TASK_REJECTED]: 'Task Rejected',
  [AuditEventType.TASK_EXECUTED]: 'Task Executed',
  [AuditEventType.TASK_COMPLETED]: 'Task Completed',
  [AuditEventType.TASK_FAILED]: 'Task Failed',
  [AuditEventType.TASK_TIMEOUT]: 'Task Timeout',
  [AuditEventType.TASK_CANCELLED]: 'Task Cancelled',
  [AuditEventType.TRUST_ESTABLISHED]: 'Trust Established',
  [AuditEventType.TRUST_ELEVATED]: 'Trust Elevated',
  [AuditEventType.TRUST_REDUCED]: 'Trust Reduced',
  [AuditEventType.TRUST_REVOKED]: 'Trust Revoked',
  [AuditEventType.TRUST_VIOLATION]: 'Trust Violation',
  [AuditEventType.FEDERATION_REQUEST]: 'Federation Request',
  [AuditEventType.FEDERATION_ACCEPTED]: 'Federation Accepted',
  [AuditEventType.FEDERATION_REJECTED]: 'Federation Rejected',
  [AuditEventType.SECURITY_ALERT]: 'Security Alert',
  [AuditEventType.SECURITY_CIRCUIT_OPEN]: 'Circuit Breaker Open',
  [AuditEventType.SECURITY_CIRCUIT_CLOSE]: 'Circuit Breaker Close',
  [AuditEventType.CHAIN_GENESIS]: 'Chain Genesis',
  [AuditEventType.CHAIN_VERIFIED]: 'Chain Verified',
  [AuditEventType.CHAIN_TAMPER_DETECTED]: 'Tamper Detected',
  [AuditEventType.SYSTEM_STARTUP]: 'System Startup',
  [AuditEventType.SYSTEM_SHUTDOWN]: 'System Shutdown',
};
