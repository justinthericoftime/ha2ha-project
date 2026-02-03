/**
 * Trust Model Types
 * 
 * Implements §5 Trust Model from HA2HA specification.
 * Defines trust levels, transitions, and violation handling.
 */

/**
 * Trust levels from 0 (blocked) to 5 (verified).
 * Each level determines what actions an agent can perform.
 */
export enum TrustLevel {
  /** Permanently blocked until human intervention */
  BLOCKED = 0,
  /** Unknown agent, minimal permissions */
  UNKNOWN = 1,
  /** Provisional trust, limited interactions */
  PROVISIONAL = 2,
  /** Standard trust for normal operations */
  STANDARD = 3,
  /** Trusted agent with elevated permissions */
  TRUSTED = 4,
  /** Verified agent with cryptographic proof */
  VERIFIED = 5,
}

/**
 * Human-readable names for trust levels
 */
export const TRUST_LEVEL_NAMES: Record<TrustLevel, string> = {
  [TrustLevel.BLOCKED]: 'BLOCKED',
  [TrustLevel.UNKNOWN]: 'UNKNOWN',
  [TrustLevel.PROVISIONAL]: 'PROVISIONAL',
  [TrustLevel.STANDARD]: 'STANDARD',
  [TrustLevel.TRUSTED]: 'TRUSTED',
  [TrustLevel.VERIFIED]: 'VERIFIED',
};

/**
 * Cooldown periods in milliseconds before trust can be elevated again.
 * Lower trust levels have longer cooldowns to prevent rapid gaming.
 */
export const COOLDOWN_PERIODS: Record<TrustLevel, number> = {
  [TrustLevel.BLOCKED]: Infinity,              // Permanent until human unblock
  [TrustLevel.UNKNOWN]: 24 * 60 * 60 * 1000,   // 24 hours
  [TrustLevel.PROVISIONAL]: 4 * 60 * 60 * 1000, // 4 hours
  [TrustLevel.STANDARD]: 1 * 60 * 60 * 1000,   // 1 hour
  [TrustLevel.TRUSTED]: 15 * 60 * 1000,        // 15 minutes
  [TrustLevel.VERIFIED]: 5 * 60 * 1000,        // 5 minutes
};

/**
 * Severity levels for trust violations
 */
export enum ViolationSeverity {
  /** Minor protocol deviation, warning only */
  LOW = 'low',
  /** Moderate violation, trust reduction */
  MEDIUM = 'medium',
  /** Serious violation, significant trust reduction */
  HIGH = 'high',
  /** Critical violation, immediate block */
  CRITICAL = 'critical',
}

/**
 * Trust reduction amounts by violation severity
 */
export const VIOLATION_PENALTIES: Record<ViolationSeverity, number> = {
  [ViolationSeverity.LOW]: 0,      // Warning only, no reduction
  [ViolationSeverity.MEDIUM]: 1,   // Drop one level
  [ViolationSeverity.HIGH]: 2,     // Drop two levels
  [ViolationSeverity.CRITICAL]: 5, // Immediate block (drop to 0)
};

/**
 * Reasons for trust level transitions
 */
export enum TransitionReason {
  /** Initial trust assignment */
  INITIAL = 'initial',
  /** Human approved trust elevation */
  HUMAN_APPROVAL = 'human_approval',
  /** Critical violation caused block */
  VIOLATION_CRITICAL = 'violation_critical',
  /** High severity violation */
  VIOLATION_HIGH = 'violation_high',
  /** Medium severity violation */
  VIOLATION_MEDIUM = 'violation_medium',
  /** Low severity violation (warning) */
  VIOLATION_LOW = 'violation_low',
  /** Human manually adjusted trust */
  HUMAN_OVERRIDE = 'human_override',
  /** Cooldown period expired */
  COOLDOWN_EXPIRED = 'cooldown_expired',
  /** Migration from allowlist */
  ALLOWLIST_MIGRATION = 'allowlist_migration',
}

/**
 * Trust context returned for authorization decisions
 */
export interface TrustContext {
  /** Current trust level */
  level: TrustLevel;
  /** Human-readable level name */
  levelName: string;
  /** When trust level last changed (ISO 8601) */
  lastTransition: string;
  /** Why trust level last changed */
  transitionReason: TransitionReason;
  /** Total violation count */
  violationCount: number;
  /** When cooldown expires (ISO 8601) or null */
  cooldownExpires: string | null;
  /** Pre-approved action scopes */
  preApprovalScope: string[];
}

/**
 * Serializable trust entry data for persistence
 */
export interface TrustEntryData {
  /** Unique agent identifier */
  agentId: string;
  /** Current trust level */
  level: TrustLevel;
  /** When entry was created (ISO 8601) */
  createdAt: string;
  /** When trust level last changed (ISO 8601) */
  lastTransition: string;
  /** Why trust level last changed */
  transitionReason: TransitionReason;
  /** Total violation count */
  violationCount: number;
  /** When cooldown expires (ISO 8601) or null */
  cooldownExpires: string | null;
  /** Pre-approved action scopes */
  preApprovalScope: string[];
  /** Historical trust transitions */
  history: TrustHistoryEntry[];
}

/**
 * Record of a trust level transition
 */
export interface TrustHistoryEntry {
  /** When transition occurred (ISO 8601) */
  timestamp: string;
  /** Trust level before transition */
  fromLevel: TrustLevel;
  /** Trust level after transition */
  toLevel: TrustLevel;
  /** Why transition occurred */
  reason: TransitionReason;
  /** Who approved the transition (if applicable) */
  approvedBy?: string;
  /** Additional details */
  details?: string;
}

/**
 * Options for creating a new trust entry
 */
export interface TrustEntryOptions {
  /** Initial trust level (defaults to UNKNOWN) */
  initialLevel?: TrustLevel;
  /** Reason for initial trust assignment */
  reason?: TransitionReason;
  /** Who created this entry */
  createdBy?: string;
}

/**
 * Trust store data structure for persistence
 */
export interface TrustStoreData {
  /** Schema version for migrations */
  version: number;
  /** When store was last updated (ISO 8601) */
  lastUpdated: string;
  /** Trust entries keyed by agent ID */
  agents: Record<string, TrustEntryData>;
}
