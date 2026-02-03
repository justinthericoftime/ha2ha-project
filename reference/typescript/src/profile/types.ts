/**
 * Profile Enforcement Types
 * 
 * Implements §10 Human Onboarding runtime enforcement from HA2HA specification.
 * Defines interfaces for profile enforcement, availability checking, and fatigue tracking.
 */

import { TrustLevel } from '../trust';
import { ApproverProfile, PreTrustedEntity } from '../onboarding';

/**
 * Result of an enforcement check.
 */
export interface EnforcementResult {
  /** Whether the action is allowed to proceed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Non-blocking warnings to consider */
  warnings: string[];
  /** Suggested action when not allowed */
  suggestedAction?: 'queue' | 'deny' | 'escalate';
}

/**
 * Status of fatigue tracking for an approver.
 */
export interface FatigueStatus {
  /** Number of approvals made this hour */
  approvalsThisHour: number;
  /** Configured limit (null = unlimited) */
  limit: number | null;
  /** Whether the limit has been exceeded */
  exceeded: boolean;
  /** Minutes until the current hour resets */
  minutesUntilReset: number;
}

/**
 * Availability status for an approver.
 */
export interface AvailabilityStatus {
  /** Whether the approver is currently available */
  available: boolean;
  /** Mode of availability checking */
  mode: 'always' | 'waking-hours' | 'scheduled';
  /** Whether enforcement is soft (queue) or strict (deny) */
  enforcement: 'soft' | 'strict';
  /** Next time the approver will be available (if not currently) */
  nextAvailableAt?: Date;
  /** Reason for unavailability */
  reason?: string;
}

/**
 * Result of pre-trusted entity resolution.
 */
export interface PreTrustResult {
  /** Whether the entity matched a pre-trusted entry */
  matched: boolean;
  /** The trust level to assign (if matched) */
  trustLevel?: TrustLevel;
  /** The matching pre-trusted entity configuration */
  entity?: PreTrustedEntity;
  /** Domains the entity is trusted for */
  domains?: string[];
}

/**
 * Configuration options for the profile enforcer.
 */
export interface ProfileEnforcerConfig {
  /** Path to the approver profile file */
  profilePath?: string;
  /** The approver profile (alternative to path) */
  profile?: ApproverProfile;
  /** Current time provider (for testing) */
  now?: () => Date;
}

/**
 * Options for checking availability.
 */
export interface AvailabilityCheckOptions {
  /** Time to check availability for (default: now) */
  at?: Date;
  /** Whether to ignore soft enforcement */
  ignoreEnforcement?: boolean;
}

/**
 * Options for resolving pre-trusted entities.
 */
export interface PreTrustResolveOptions {
  /** The agent ID to check */
  agentId?: string;
  /** The human-readable name to check */
  name?: string;
  /** Domain being requested (for domain filtering) */
  domain?: string;
}

/**
 * Approval record for fatigue tracking.
 */
export interface ApprovalRecord {
  /** When the approval occurred */
  timestamp: Date;
  /** Task ID that was approved */
  taskId: string;
  /** Agent ID that was approved */
  agentId: string;
}

/**
 * Waking hours configuration (for soft schedule enforcement).
 */
export interface WakingHoursConfig {
  /** Typical wake time (24-hour format, e.g., "08:00") */
  wakeTime?: string;
  /** Typical sleep time (24-hour format, e.g., "23:00") */
  sleepTime?: string;
  /** Timezone for the approver */
  timezone?: string;
}

/**
 * Default waking hours (reasonable defaults for most people).
 */
export const DEFAULT_WAKING_HOURS: Required<WakingHoursConfig> = {
  wakeTime: '08:00',
  sleepTime: '23:00',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Event emitted when profile enforcement takes action.
 */
export interface ProfileEnforcementEvent {
  /** Type of event */
  type: 'availability_check' | 'fatigue_check' | 'pre_trust_resolve' | 'timeout_applied';
  /** Timestamp of the event */
  timestamp: string;
  /** Result of the check */
  result: EnforcementResult | FatigueStatus | PreTrustResult | number;
  /** Additional context */
  context?: Record<string, unknown>;
}
