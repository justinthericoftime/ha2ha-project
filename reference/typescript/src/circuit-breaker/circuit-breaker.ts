/**
 * Circuit Breaker
 * 
 * Per-agent circuit breaker implementing §8.8 Cascading Failure Prevention.
 * Tracks failures and manages state transitions to prevent cascading failures.
 */

import { ViolationSeverity } from '../trust/types';
import { TrustRegistry } from '../trust/trust-registry';
import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  CircuitCheckResult,
  CircuitTransitionReason,
  CircuitStateChangeEvent,
  FailureRecord,
  DEFAULT_CIRCUIT_CONFIG,
  CIRCUIT_STATE_NAMES,
} from './types';

/**
 * Circuit breaker for a single agent
 * 
 * Tracks failures and manages state transitions:
 * - CLOSED: Normal operation, requests allowed
 * - OPEN: Circuit tripped, all requests blocked
 * - HALF_OPEN: Testing recovery, single request allowed
 */
export class CircuitBreaker {
  readonly agentId: string;
  private _state: CircuitState;
  private _consecutiveFailures: number;
  private _totalFailures: number;
  private _totalSuccesses: number;
  private _lastTrippedAt: Date | null;
  private _lastTripReason: string | null;
  private _recentFailures: FailureRecord[];
  private _createdAt: Date;
  private _config: CircuitBreakerConfig;
  private _trustRegistry?: TrustRegistry;
  private _stateChangeListeners: Array<(event: CircuitStateChangeEvent) => void>;

  constructor(
    agentId: string,
    trustRegistry?: TrustRegistry,
    config?: Partial<CircuitBreakerConfig>
  ) {
    this.agentId = agentId;
    this._state = CircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._totalFailures = 0;
    this._totalSuccesses = 0;
    this._lastTrippedAt = null;
    this._lastTripReason = null;
    this._recentFailures = [];
    this._createdAt = new Date();
    this._config = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this._trustRegistry = trustRegistry;
    this._stateChangeListeners = [];
  }

  /**
   * Current circuit state
   */
  get state(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    this.checkAutoTransition();
    return this._state;
  }

  /**
   * Whether the circuit is open (blocking requests)
   */
  get isOpen(): boolean {
    return this.state === CircuitState.OPEN;
  }

  /**
   * Whether the circuit is closed (allowing requests)
   */
  get isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Whether the circuit is half-open (testing recovery)
   */
  get isHalfOpen(): boolean {
    return this.state === CircuitState.HALF_OPEN;
  }

  /**
   * Consecutive failure count
   */
  get consecutiveFailures(): number {
    return this._consecutiveFailures;
  }

  /**
   * Total failure count
   */
  get totalFailures(): number {
    return this._totalFailures;
  }

  /**
   * Total success count
   */
  get totalSuccesses(): number {
    return this._totalSuccesses;
  }

  /**
   * Circuit breaker configuration
   */
  get config(): CircuitBreakerConfig {
    return { ...this._config };
  }

  /**
   * Check if a request can proceed through this circuit
   */
  canProceed(): CircuitCheckResult {
    const currentState = this.state; // triggers auto-transition check

    switch (currentState) {
      case CircuitState.CLOSED:
        return {
          allowed: true,
          state: currentState,
        };

      case CircuitState.OPEN:
        return {
          allowed: false,
          state: currentState,
          reason: `Circuit is OPEN: ${this._lastTripReason}`,
          resetAt: this.getResetTime()?.toISOString(),
        };

      case CircuitState.HALF_OPEN:
        // Allow single request to test recovery
        return {
          allowed: true,
          state: currentState,
        };

      default:
        return {
          allowed: false,
          state: currentState,
          reason: 'Unknown circuit state',
        };
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    this._consecutiveFailures = 0;
    this._totalSuccesses++;

    if (this._state === CircuitState.HALF_OPEN) {
      // Successful test in HALF_OPEN → CLOSED
      this.transitionTo(CircuitState.CLOSED, CircuitTransitionReason.HALF_OPEN_SUCCESS);
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(severity: ViolationSeverity, reason: string = 'Unknown failure'): void {
    this._consecutiveFailures++;
    this._totalFailures++;

    // Add to recent failures
    const failureRecord: FailureRecord = {
      timestamp: new Date().toISOString(),
      severity,
      reason,
    };
    this._recentFailures.push(failureRecord);

    // Prune old failures outside the window
    this.pruneOldFailures();

    // Record violation to trust registry if present
    if (this._trustRegistry) {
      this._trustRegistry.recordViolation(this.agentId, severity, reason).catch(() => {
        // Ignore errors from trust registry
      });
    }

    // Check if we should trip the circuit
    if (this._state === CircuitState.HALF_OPEN) {
      // Failure in HALF_OPEN → OPEN
      this.tripCircuit(CircuitTransitionReason.HALF_OPEN_FAILURE, reason);
    } else if (this._state === CircuitState.CLOSED) {
      this.checkTripConditions(severity, reason);
    }
  }

  /**
   * Manually trip the circuit
   */
  trip(reason: string): void {
    this.tripCircuit(CircuitTransitionReason.MANUAL_TRIP, reason);
  }

  /**
   * Manually reset the circuit (requires approval)
   */
  reset(approvedBy: string): void {
    if (this._state !== CircuitState.CLOSED) {
      this._consecutiveFailures = 0;
      this._recentFailures = [];
      this.transitionTo(
        CircuitState.CLOSED,
        CircuitTransitionReason.MANUAL_RESET,
        `Reset approved by ${approvedBy}`
      );
    }
  }

  /**
   * Add a listener for state changes
   */
  onStateChange(listener: (event: CircuitStateChangeEvent) => void): () => void {
    this._stateChangeListeners.push(listener);
    return () => {
      const index = this._stateChangeListeners.indexOf(listener);
      if (index !== -1) {
        this._stateChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get serializable status
   */
  toJSON(): CircuitBreakerStatus {
    return {
      agentId: this.agentId,
      state: this._state,
      stateName: CIRCUIT_STATE_NAMES[this._state],
      consecutiveFailures: this._consecutiveFailures,
      totalFailures: this._totalFailures,
      totalSuccesses: this._totalSuccesses,
      lastTrippedAt: this._lastTrippedAt?.toISOString() ?? null,
      lastTripReason: this._lastTripReason,
      resetAt: this.getResetTime()?.toISOString() ?? null,
      recentFailures: [...this._recentFailures],
      createdAt: this._createdAt.toISOString(),
      config: this._config,
    };
  }

  /**
   * Restore from serialized status
   */
  static fromJSON(data: CircuitBreakerStatus, trustRegistry?: TrustRegistry): CircuitBreaker {
    const breaker = new CircuitBreaker(data.agentId, trustRegistry, data.config);
    breaker._state = data.state;
    breaker._consecutiveFailures = data.consecutiveFailures;
    breaker._totalFailures = data.totalFailures;
    breaker._totalSuccesses = data.totalSuccesses;
    breaker._lastTrippedAt = data.lastTrippedAt ? new Date(data.lastTrippedAt) : null;
    breaker._lastTripReason = data.lastTripReason;
    breaker._recentFailures = [...data.recentFailures];
    breaker._createdAt = new Date(data.createdAt);
    return breaker;
  }

  // === Private Methods ===

  private checkAutoTransition(): void {
    if (this._state === CircuitState.OPEN && this._lastTrippedAt) {
      const resetTime = this.getResetTime();
      if (resetTime && resetTime <= new Date()) {
        // Timeout expired, transition to HALF_OPEN
        this.transitionTo(CircuitState.HALF_OPEN, CircuitTransitionReason.TIMEOUT_EXPIRED);
      }
    }
  }

  private getResetTime(): Date | null {
    if (this._state !== CircuitState.OPEN || !this._lastTrippedAt) {
      return null;
    }
    return new Date(this._lastTrippedAt.getTime() + this._config.resetTimeoutMs);
  }

  private checkTripConditions(severity: ViolationSeverity, reason: string): void {
    // Critical violation triggers immediate trip
    if (this._config.tripOnCritical && severity === ViolationSeverity.CRITICAL) {
      this.tripCircuit(CircuitTransitionReason.CRITICAL_VIOLATION, reason);
      return;
    }

    // Check consecutive failures
    if (this._consecutiveFailures >= this._config.failureThreshold) {
      this.tripCircuit(CircuitTransitionReason.CONSECUTIVE_FAILURES, reason);
      return;
    }

    // Check windowed failures
    if (this._recentFailures.length >= this._config.windowedFailureThreshold) {
      this.tripCircuit(CircuitTransitionReason.WINDOWED_FAILURES, reason);
      return;
    }
  }

  private tripCircuit(transitionReason: CircuitTransitionReason, failureReason: string): void {
    this._lastTrippedAt = new Date();
    this._lastTripReason = failureReason;
    this.transitionTo(CircuitState.OPEN, transitionReason, failureReason);
  }

  private transitionTo(
    newState: CircuitState,
    reason: CircuitTransitionReason,
    details?: string
  ): void {
    const previousState = this._state;
    if (previousState === newState) {
      return;
    }

    this._state = newState;

    const event: CircuitStateChangeEvent = {
      agentId: this.agentId,
      fromState: previousState,
      toState: newState,
      reason: details ?? reason,
      timestamp: new Date().toISOString(),
    };

    // Notify listeners
    for (const listener of this._stateChangeListeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this._config.failureWindowMs;
    this._recentFailures = this._recentFailures.filter(
      f => new Date(f.timestamp).getTime() > cutoff
    );
  }
}
