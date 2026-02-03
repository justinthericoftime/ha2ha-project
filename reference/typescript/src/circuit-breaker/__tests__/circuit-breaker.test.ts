/**
 * Circuit Breaker Tests
 * 
 * Tests for per-agent circuit breaker state machine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../circuit-breaker';
import { CircuitState, CircuitStateChangeEvent } from '../types';
import { ViolationSeverity } from '../../trust/types';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('agent-1');
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.isClosed).toBe(true);
      expect(breaker.isOpen).toBe(false);
      expect(breaker.isHalfOpen).toBe(false);
    });

    it('should have zero counters initially', () => {
      expect(breaker.consecutiveFailures).toBe(0);
      expect(breaker.totalFailures).toBe(0);
      expect(breaker.totalSuccesses).toBe(0);
    });

    it('should allow requests when CLOSED', () => {
      const result = breaker.canProceed();
      expect(result.allowed).toBe(true);
      expect(result.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('success recording', () => {
    it('should increment success counter', () => {
      breaker.recordSuccess();
      expect(breaker.totalSuccesses).toBe(1);
    });

    it('should reset consecutive failures on success', () => {
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(breaker.consecutiveFailures).toBe(2);
      
      breaker.recordSuccess();
      expect(breaker.consecutiveFailures).toBe(0);
      expect(breaker.totalFailures).toBe(2);
    });
  });

  describe('failure recording', () => {
    it('should increment failure counters', () => {
      breaker.recordFailure(ViolationSeverity.MEDIUM, 'test failure');
      expect(breaker.consecutiveFailures).toBe(1);
      expect(breaker.totalFailures).toBe(1);
    });

    it('should trip after threshold consecutive failures', () => {
      // Default threshold is 3
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(breaker.state).toBe(CircuitState.CLOSED);
      
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(breaker.state).toBe(CircuitState.CLOSED);
      
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(breaker.state).toBe(CircuitState.OPEN);
      expect(breaker.isOpen).toBe(true);
    });

    it('should trip immediately on critical violation', () => {
      breaker.recordFailure(ViolationSeverity.CRITICAL, 'critical error');
      expect(breaker.state).toBe(CircuitState.OPEN);
    });
  });

  describe('windowed failures', () => {
    it('should trip after windowed failure threshold', () => {
      const shortWindowBreaker = new CircuitBreaker('agent-2', undefined, {
        failureThreshold: 10, // High threshold so consecutive doesn't trigger
        windowedFailureThreshold: 3,
        failureWindowMs: 60000,
      });

      // Failures with successes in between (not consecutive)
      shortWindowBreaker.recordFailure(ViolationSeverity.LOW);
      shortWindowBreaker.recordSuccess();
      shortWindowBreaker.recordFailure(ViolationSeverity.LOW);
      shortWindowBreaker.recordSuccess();
      
      // Third failure triggers windowed threshold
      shortWindowBreaker.recordFailure(ViolationSeverity.LOW);
      expect(shortWindowBreaker.state).toBe(CircuitState.OPEN);
    });
  });

  describe('OPEN state', () => {
    beforeEach(() => {
      // Trip the circuit
      breaker.trip('manual test trip');
    });

    it('should block requests when OPEN', () => {
      const result = breaker.canProceed();
      expect(result.allowed).toBe(false);
      expect(result.state).toBe(CircuitState.OPEN);
      expect(result.reason).toContain('Circuit is OPEN');
      expect(result.resetAt).toBeDefined();
    });

    it('should have last trip information', () => {
      const status = breaker.toJSON();
      expect(status.lastTrippedAt).not.toBeNull();
      expect(status.lastTripReason).toBe('manual test trip');
    });
  });

  describe('OPEN → HALF_OPEN transition', () => {
    it('should transition to HALF_OPEN after timeout', () => {
      const fastBreaker = new CircuitBreaker('agent-3', undefined, {
        resetTimeoutMs: 100, // 100ms timeout for testing
      });
      
      fastBreaker.trip('test trip');
      expect(fastBreaker.state).toBe(CircuitState.OPEN);

      // Wait for timeout
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(fastBreaker.state).toBe(CircuitState.HALF_OPEN);
          expect(fastBreaker.isHalfOpen).toBe(true);
          resolve();
        }, 150);
      });
    });
  });

  describe('HALF_OPEN state', () => {
    let halfOpenBreaker: CircuitBreaker;

    beforeEach(async () => {
      halfOpenBreaker = new CircuitBreaker('agent-4', undefined, {
        resetTimeoutMs: 50,
      });
      halfOpenBreaker.trip('test');
      
      // Wait for transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(halfOpenBreaker.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow single request in HALF_OPEN', () => {
      const result = halfOpenBreaker.canProceed();
      expect(result.allowed).toBe(true);
      expect(result.state).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition to CLOSED on success', () => {
      halfOpenBreaker.recordSuccess();
      expect(halfOpenBreaker.state).toBe(CircuitState.CLOSED);
      expect(halfOpenBreaker.isClosed).toBe(true);
    });

    it('should transition to OPEN on failure', () => {
      halfOpenBreaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(halfOpenBreaker.state).toBe(CircuitState.OPEN);
    });
  });

  describe('manual controls', () => {
    it('should trip circuit manually', () => {
      breaker.trip('manual intervention');
      expect(breaker.state).toBe(CircuitState.OPEN);
      expect(breaker.toJSON().lastTripReason).toBe('manual intervention');
    });

    it('should reset circuit manually', () => {
      breaker.trip('test');
      breaker.reset('admin-user');
      expect(breaker.state).toBe(CircuitState.CLOSED);
      expect(breaker.consecutiveFailures).toBe(0);
    });
  });

  describe('state change events', () => {
    it('should emit state change events', () => {
      const events: CircuitStateChangeEvent[] = [];
      const unsubscribe = breaker.onStateChange((event) => {
        events.push(event);
      });

      breaker.trip('test');
      
      expect(events.length).toBe(1);
      expect(events[0].fromState).toBe(CircuitState.CLOSED);
      expect(events[0].toState).toBe(CircuitState.OPEN);
      expect(events[0].agentId).toBe('agent-1');

      unsubscribe();
    });

    it('should allow unsubscribing from events', () => {
      const events: CircuitStateChangeEvent[] = [];
      const unsubscribe = breaker.onStateChange((event) => {
        events.push(event);
      });

      breaker.trip('test1');
      expect(events.length).toBe(1);

      unsubscribe();
      breaker.reset('admin');
      expect(events.length).toBe(1); // No new event
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      breaker.recordSuccess();
      
      const json = breaker.toJSON();
      
      expect(json.agentId).toBe('agent-1');
      expect(json.state).toBe(CircuitState.CLOSED);
      expect(json.stateName).toBe('CLOSED');
      expect(json.totalFailures).toBe(1);
      expect(json.totalSuccesses).toBe(1);
      expect(json.consecutiveFailures).toBe(0);
      expect(json.config).toBeDefined();
    });

    it('should deserialize from JSON', () => {
      breaker.recordFailure(ViolationSeverity.MEDIUM);
      breaker.recordSuccess();
      
      const json = breaker.toJSON();
      const restored = CircuitBreaker.fromJSON(json);
      
      expect(restored.agentId).toBe(breaker.agentId);
      expect(restored.state).toBe(breaker.state);
      expect(restored.totalFailures).toBe(breaker.totalFailures);
      expect(restored.totalSuccesses).toBe(breaker.totalSuccesses);
    });
  });

  describe('custom configuration', () => {
    it('should use custom failure threshold', () => {
      const customBreaker = new CircuitBreaker('agent-5', undefined, {
        failureThreshold: 5,
      });

      for (let i = 0; i < 4; i++) {
        customBreaker.recordFailure(ViolationSeverity.MEDIUM);
      }
      expect(customBreaker.state).toBe(CircuitState.CLOSED);

      customBreaker.recordFailure(ViolationSeverity.MEDIUM);
      expect(customBreaker.state).toBe(CircuitState.OPEN);
    });

    it('should respect tripOnCritical config', () => {
      const noCriticalBreaker = new CircuitBreaker('agent-6', undefined, {
        tripOnCritical: false,
      });

      noCriticalBreaker.recordFailure(ViolationSeverity.CRITICAL);
      expect(noCriticalBreaker.state).toBe(CircuitState.CLOSED);
    });
  });
});
