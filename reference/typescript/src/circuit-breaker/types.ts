/**
 * Circuit Breaker Types
 * 
 * Implements §8.8 Cascading Failure Prevention from HA2HA specification.
 * Defines circuit states, transitions, and status tracking.
 */

import { ViolationSeverity } from '../trust/types';

/**
 * Circuit breaker states following standard state machine pattern.
 * 
 * State machine:
 * - CLOSED (normal) → 3 consecutive failures → OPEN
 * - OPEN (blocked) → 1 hour → HALF_OPEN
 * - HALF_OPEN (testing) → success → CLOSED, failure → OPEN
 */
export enum CircuitState {
  /** Normal operation, requests allowed */
  CLOSED = 'closed',
  /** Circuit tripped, all requests blocked */
  OPEN = 'open',
  /** Testing recovery, single request allowed */
  HALF_OPEN = 'half_open',
}

/**
 * Human-readable names for circuit states
 */
export const CIRCUIT_STATE_NAMES: Record<CircuitState, string> = {
  [CircuitState.CLOSED]: 'CLOSED',
  [CircuitState.OPEN]: 'OPEN',
  [CircuitState.HALF_OPEN]: 'HALF_OPEN',
};

/**
 * Configuration for circuit breaker behavior
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Number of failures in time window before opening circuit */
  windowedFailureThreshold: number;
  /** Time window for windowed failures (ms) */
  failureWindowMs: number;
  /** Time before OPEN → HALF_OPEN transition (ms) */
  resetTimeoutMs: number;
  /** Whether critical violations immediately trip the circuit */
  tripOnCritical: boolean;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,         // 3 consecutive failures
  windowedFailureThreshold: 5, // 5 failures in 5 minutes
  failureWindowMs: 5 * 60 * 1000, // 5 minutes
  resetTimeoutMs: 60 * 60 * 1000, // 1 hour
  tripOnCritical: true,
};

/**
 * Failure record for tracking
 */
export interface FailureRecord {
  /** When the failure occurred (ISO 8601) */
  timestamp: string;
  /** Severity of the failure */
  severity: ViolationSeverity;
  /** Reason for the failure */
  reason: string;
}

/**
 * Serializable circuit breaker status
 */
export interface CircuitBreakerStatus {
  /** Agent this circuit breaker is for */
  agentId: string;
  /** Current circuit state */
  state: CircuitState;
  /** Human-readable state name */
  stateName: string;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Total failure count */
  totalFailures: number;
  /** Total success count */
  totalSuccesses: number;
  /** When circuit was last tripped (ISO 8601) or null */
  lastTrippedAt: string | null;
  /** Why circuit was last tripped or null */
  lastTripReason: string | null;
  /** When circuit will transition to HALF_OPEN (ISO 8601) or null */
  resetAt: string | null;
  /** Recent failures within the window */
  recentFailures: FailureRecord[];
  /** When entry was created (ISO 8601) */
  createdAt: string;
  /** Configuration for this circuit breaker */
  config: CircuitBreakerConfig;
}

/**
 * Event emitted when circuit state changes
 */
export interface CircuitStateChangeEvent {
  /** Agent ID */
  agentId: string;
  /** Previous state */
  fromState: CircuitState;
  /** New state */
  toState: CircuitState;
  /** Reason for the transition */
  reason: string;
  /** When the transition occurred (ISO 8601) */
  timestamp: string;
}

/**
 * Reasons for circuit state transitions
 */
export enum CircuitTransitionReason {
  /** Initial circuit creation */
  INITIAL = 'initial',
  /** Consecutive failure threshold reached */
  CONSECUTIVE_FAILURES = 'consecutive_failures',
  /** Windowed failure threshold reached */
  WINDOWED_FAILURES = 'windowed_failures',
  /** Critical violation occurred */
  CRITICAL_VIOLATION = 'critical_violation',
  /** Manual trip by operator */
  MANUAL_TRIP = 'manual_trip',
  /** Reset timeout expired (OPEN → HALF_OPEN) */
  TIMEOUT_EXPIRED = 'timeout_expired',
  /** Success in HALF_OPEN state */
  HALF_OPEN_SUCCESS = 'half_open_success',
  /** Failure in HALF_OPEN state */
  HALF_OPEN_FAILURE = 'half_open_failure',
  /** Manual reset by operator */
  MANUAL_RESET = 'manual_reset',
}

/**
 * Result of attempting to proceed through a circuit
 */
export interface CircuitCheckResult {
  /** Whether the request can proceed */
  allowed: boolean;
  /** Current circuit state */
  state: CircuitState;
  /** Reason if not allowed */
  reason?: string;
  /** When the circuit will reset (ISO 8601) if OPEN */
  resetAt?: string;
}

/**
 * Workflow depth exceeded error details
 */
export interface WorkflowDepthError {
  /** Current depth */
  depth: number;
  /** Maximum allowed depth */
  maxDepth: number;
  /** Task chain that exceeded depth */
  taskChain: string[];
}
