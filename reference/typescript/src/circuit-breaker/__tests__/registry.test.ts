/**
 * Circuit Breaker Registry Tests
 * 
 * Tests for central circuit breaker management.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CircuitBreakerRegistry } from '../registry';
import { CircuitState, CircuitStateChangeEvent } from '../types';
import { ViolationSeverity } from '../../trust/types';

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('circuit creation', () => {
    it('should create circuit on first access', () => {
      expect(registry.hasCircuit('agent-1')).toBe(false);
      
      const circuit = registry.getCircuit('agent-1');
      
      expect(circuit).toBeDefined();
      expect(circuit.agentId).toBe('agent-1');
      expect(registry.hasCircuit('agent-1')).toBe(true);
    });

    it('should return same circuit on subsequent access', () => {
      const circuit1 = registry.getCircuit('agent-1');
      const circuit2 = registry.getCircuit('agent-1');
      
      expect(circuit1).toBe(circuit2);
    });

    it('should create separate circuits per agent', () => {
      const circuit1 = registry.getCircuit('agent-1');
      const circuit2 = registry.getCircuit('agent-2');
      
      expect(circuit1).not.toBe(circuit2);
      expect(circuit1.agentId).toBe('agent-1');
      expect(circuit2.agentId).toBe('agent-2');
    });
  });

  describe('canProceed', () => {
    it('should allow requests for new agents', () => {
      const result = registry.canProceed('new-agent');
      expect(result.allowed).toBe(true);
      expect(result.state).toBe(CircuitState.CLOSED);
    });

    it('should block requests for open circuits', () => {
      registry.trip('agent-1', 'test');
      
      const result = registry.canProceed('agent-1');
      expect(result.allowed).toBe(false);
      expect(result.state).toBe(CircuitState.OPEN);
    });
  });

  describe('recording', () => {
    it('should record successes', () => {
      registry.recordSuccess('agent-1');
      registry.recordSuccess('agent-1');
      
      const circuit = registry.getCircuit('agent-1');
      expect(circuit.totalSuccesses).toBe(2);
    });

    it('should record failures', () => {
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM, 'test');
      registry.recordFailure('agent-1', ViolationSeverity.HIGH, 'test 2');
      
      const circuit = registry.getCircuit('agent-1');
      expect(circuit.totalFailures).toBe(2);
    });

    it('should trip circuit after threshold failures', () => {
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      
      expect(registry.isOpen('agent-1')).toBe(true);
    });
  });

  describe('manual controls', () => {
    it('should trip circuit manually', () => {
      registry.trip('agent-1', 'manual test');
      
      expect(registry.isOpen('agent-1')).toBe(true);
      const status = registry.getStatus('agent-1');
      expect(status.lastTripReason).toBe('manual test');
    });

    it('should reset circuit manually', () => {
      registry.trip('agent-1', 'test');
      registry.reset('agent-1', 'admin');
      
      expect(registry.isOpen('agent-1')).toBe(false);
      const circuit = registry.getCircuit('agent-1');
      expect(circuit.isClosed).toBe(true);
    });

    it('should reset all circuits', () => {
      registry.trip('agent-1', 'test');
      registry.trip('agent-2', 'test');
      registry.trip('agent-3', 'test');
      
      registry.resetAll('admin');
      
      expect(registry.getOpenCircuits().length).toBe(0);
    });
  });

  describe('circuit removal', () => {
    it('should remove circuit', () => {
      registry.getCircuit('agent-1');
      expect(registry.hasCircuit('agent-1')).toBe(true);
      
      const removed = registry.removeCircuit('agent-1');
      
      expect(removed).toBe(true);
      expect(registry.hasCircuit('agent-1')).toBe(false);
    });

    it('should return false when removing non-existent circuit', () => {
      const removed = registry.removeCircuit('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('listing circuits', () => {
    beforeEach(() => {
      registry.getCircuit('agent-1');
      registry.getCircuit('agent-2');
      registry.getCircuit('agent-3');
      registry.trip('agent-2', 'test');
    });

    it('should list all agent IDs', () => {
      const ids = registry.listAgentIds();
      expect(ids).toContain('agent-1');
      expect(ids).toContain('agent-2');
      expect(ids).toContain('agent-3');
      expect(ids.length).toBe(3);
    });

    it('should list all circuits', () => {
      const circuits = registry.listCircuits();
      expect(circuits.length).toBe(3);
    });

    it('should get open circuits', () => {
      const openCircuits = registry.getOpenCircuits();
      expect(openCircuits.length).toBe(1);
      expect(openCircuits[0].agentId).toBe('agent-2');
    });

    it('should get circuits by state', () => {
      const closedCircuits = registry.getCircuitsByState(CircuitState.CLOSED);
      expect(closedCircuits.length).toBe(2);
      
      const openCircuits = registry.getCircuitsByState(CircuitState.OPEN);
      expect(openCircuits.length).toBe(1);
    });
  });

  describe('global state change listener', () => {
    it('should emit events for all circuits', () => {
      const events: CircuitStateChangeEvent[] = [];
      const unsubscribe = registry.onStateChange((event) => {
        events.push(event);
      });

      registry.trip('agent-1', 'test 1');
      registry.trip('agent-2', 'test 2');
      
      expect(events.length).toBe(2);
      expect(events[0].agentId).toBe('agent-1');
      expect(events[1].agentId).toBe('agent-2');

      unsubscribe();
    });

    it('should stop receiving events after unsubscribe', () => {
      const events: CircuitStateChangeEvent[] = [];
      const unsubscribe = registry.onStateChange((event) => {
        events.push(event);
      });

      registry.trip('agent-1', 'test');
      expect(events.length).toBe(1);

      unsubscribe();
      registry.reset('agent-1', 'admin');
      expect(events.length).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should calculate stats', () => {
      registry.recordSuccess('agent-1');
      registry.recordSuccess('agent-1');
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      
      registry.trip('agent-2', 'test');
      
      registry.recordFailure('agent-3', ViolationSeverity.LOW);
      
      const stats = registry.getStats();
      
      expect(stats.totalCircuits).toBe(3);
      expect(stats.stateCounts[CircuitState.CLOSED]).toBe(2);
      expect(stats.stateCounts[CircuitState.OPEN]).toBe(1);
      expect(stats.totalFailures).toBe(2);
      expect(stats.totalSuccesses).toBe(2);
    });
  });

  describe('import/export', () => {
    it('should export all circuit statuses', () => {
      registry.getCircuit('agent-1');
      registry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      registry.trip('agent-2', 'test');
      
      const exported = registry.exportAll();
      
      expect(exported.length).toBe(2);
      expect(exported.find(s => s.agentId === 'agent-1')).toBeDefined();
      expect(exported.find(s => s.agentId === 'agent-2')).toBeDefined();
    });

    it('should import circuit statuses', () => {
      const sourceRegistry = new CircuitBreakerRegistry();
      sourceRegistry.recordFailure('agent-1', ViolationSeverity.MEDIUM);
      sourceRegistry.trip('agent-2', 'test');
      
      const exported = sourceRegistry.exportAll();
      
      const targetRegistry = new CircuitBreakerRegistry();
      targetRegistry.importAll(exported);
      
      expect(targetRegistry.hasCircuit('agent-1')).toBe(true);
      expect(targetRegistry.hasCircuit('agent-2')).toBe(true);
      expect(targetRegistry.isOpen('agent-2')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all circuits', () => {
      registry.getCircuit('agent-1');
      registry.getCircuit('agent-2');
      
      registry.clear();
      
      expect(registry.listAgentIds().length).toBe(0);
      expect(registry.hasCircuit('agent-1')).toBe(false);
    });
  });

  describe('custom default config', () => {
    it('should apply custom config to new circuits', () => {
      const customRegistry = new CircuitBreakerRegistry({
        defaultConfig: {
          failureThreshold: 10,
        },
      });

      const circuit = customRegistry.getCircuit('agent-1');
      expect(circuit.config.failureThreshold).toBe(10);
    });
  });
});
