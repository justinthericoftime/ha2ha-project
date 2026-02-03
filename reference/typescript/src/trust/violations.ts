/**
 * Violation Handling
 * 
 * Handles trust violations based on severity.
 * Maps violation types to trust reductions.
 */

import {
  ViolationSeverity,
  TransitionReason,
  VIOLATION_PENALTIES,
} from './types';

/**
 * Calculate trust level reduction for a violation severity
 */
export function calculateTrustReduction(severity: ViolationSeverity): number {
  return VIOLATION_PENALTIES[severity];
}

/**
 * Map violation severity to transition reason
 */
export function violationToTransitionReason(severity: ViolationSeverity): TransitionReason {
  switch (severity) {
    case ViolationSeverity.CRITICAL:
      return TransitionReason.VIOLATION_CRITICAL;
    case ViolationSeverity.HIGH:
      return TransitionReason.VIOLATION_HIGH;
    case ViolationSeverity.MEDIUM:
      return TransitionReason.VIOLATION_MEDIUM;
    case ViolationSeverity.LOW:
      return TransitionReason.VIOLATION_LOW;
    default:
      return TransitionReason.VIOLATION_LOW;
  }
}

/**
 * Common violation types with their default severities
 */
export const VIOLATION_TYPES = {
  // Authentication/Authorization
  INVALID_CREDENTIALS: ViolationSeverity.CRITICAL,
  EXPIRED_TOKEN: ViolationSeverity.LOW,
  UNAUTHORIZED_ACTION: ViolationSeverity.HIGH,
  SCOPE_EXCEEDED: ViolationSeverity.MEDIUM,

  // Protocol violations
  MALFORMED_MESSAGE: ViolationSeverity.MEDIUM,
  INVALID_SIGNATURE: ViolationSeverity.CRITICAL,
  REPLAY_ATTACK: ViolationSeverity.CRITICAL,
  TIMESTAMP_SKEW: ViolationSeverity.LOW,

  // Rate limiting
  RATE_LIMIT_EXCEEDED: ViolationSeverity.LOW,
  RATE_LIMIT_BURST: ViolationSeverity.MEDIUM,

  // Behavioral
  SUSPICIOUS_PATTERN: ViolationSeverity.MEDIUM,
  DATA_EXFILTRATION: ViolationSeverity.CRITICAL,
  HUMAN_BYPASS_ATTEMPT: ViolationSeverity.CRITICAL,
} as const;

/**
 * Violation type keys
 */
export type ViolationType = keyof typeof VIOLATION_TYPES;

/**
 * Get violation severity for a known violation type
 */
export function getViolationSeverity(type: ViolationType): ViolationSeverity {
  return VIOLATION_TYPES[type];
}

/**
 * Violation record for logging and analysis
 */
export interface ViolationRecord {
  /** When violation occurred (ISO 8601) */
  timestamp: string;
  /** Agent that committed the violation */
  agentId: string;
  /** Type of violation */
  type: ViolationType | string;
  /** Severity level */
  severity: ViolationSeverity;
  /** Detailed description */
  details: string;
  /** Trust level before violation */
  trustBefore: number;
  /** Trust level after violation */
  trustAfter: number;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Create a violation record
 */
export function createViolationRecord(
  agentId: string,
  type: ViolationType | string,
  severity: ViolationSeverity,
  details: string,
  trustBefore: number,
  trustAfter: number,
  context?: Record<string, unknown>
): ViolationRecord {
  return {
    timestamp: new Date().toISOString(),
    agentId,
    type,
    severity,
    details,
    trustBefore,
    trustAfter,
    context,
  };
}

/**
 * Check if a violation is severe enough to require notification
 */
export function requiresNotification(severity: ViolationSeverity): boolean {
  return severity === ViolationSeverity.HIGH || severity === ViolationSeverity.CRITICAL;
}

/**
 * Check if a violation should trigger immediate block
 */
export function triggersImmediateBlock(severity: ViolationSeverity): boolean {
  return severity === ViolationSeverity.CRITICAL;
}
