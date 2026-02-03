/**
 * Circuit Breaker Registry
 * 
 * Central management for all agent circuit breakers.
 * Handles creation, lookup, and bulk operations.
 */

import { ViolationSeverity } from '../trust/types';
import { TrustRegistry } from '../trust/trust-registry';
import { CircuitBreaker } from './circuit-breaker';
import {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  CircuitCheckResult,
  CircuitStateChangeEvent,
  DEFAULT_CIRCUIT_CONFIG,
} from './types';

/**
 * Configuration options for CircuitBreakerRegistry
 */
export interface CircuitBreakerRegistryOptions {
  /** Trust registry for violation recording */
  trustRegistry?: TrustRegistry;
  /** Default circuit breaker configuration */
  defaultConfig?: Partial<CircuitBreakerConfig>;
}

/**
 * Statistics about the circuit breaker registry
 */
export interface CircuitBreakerRegistryStats {
  /** Total number of circuits */
  totalCircuits: number;
  /** Count of circuits in each state */
  stateCounts: Record<CircuitState, number>;
  /** Total failures across all circuits */
  totalFailures: number;
  /** Total successes across all circuits */
  totalSuccesses: number;
}

/**
 * Central registry for managing circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker>;
  private trustRegistry?: TrustRegistry;
  private defaultConfig: CircuitBreakerConfig;
  private globalListeners: Array<(event: CircuitStateChangeEvent) => void>;

  constructor(options: CircuitBreakerRegistryOptions = {}) {
    this.breakers = new Map();
    this.trustRegistry = options.trustRegistry;
    this.defaultConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...options.defaultConfig };
    this.globalListeners = [];
  }

  /**
   * Get or create a circuit breaker for an agent
   */
  getCircuit(agentId: string): CircuitBreaker {
    let breaker = this.breakers.get(agentId);

    if (!breaker) {
      breaker = new CircuitBreaker(agentId, this.trustRegistry, this.defaultConfig);
      
      // Add global listener
      breaker.onStateChange((event) => {
        for (const listener of this.globalListeners) {
          try {
            listener(event);
          } catch {
            // Ignore listener errors
          }
        }
      });

      this.breakers.set(agentId, breaker);
    }

    return breaker;
  }

  /**
   * Check if an agent's circuit allows requests
   */
  canProceed(agentId: string): CircuitCheckResult {
    return this.getCircuit(agentId).canProceed();
  }

  /**
   * Record a success for an agent
   */
  recordSuccess(agentId: string): void {
    this.getCircuit(agentId).recordSuccess();
  }

  /**
   * Record a failure for an agent
   */
  recordFailure(agentId: string, severity: ViolationSeverity, reason?: string): void {
    this.getCircuit(agentId).recordFailure(severity, reason);
  }

  /**
   * Check if an agent's circuit is open
   */
  isOpen(agentId: string): boolean {
    return this.getCircuit(agentId).isOpen;
  }

  /**
   * Trip a circuit manually
   */
  trip(agentId: string, reason: string): void {
    this.getCircuit(agentId).trip(reason);
  }

  /**
   * Reset a circuit manually
   */
  reset(agentId: string, approvedBy: string): void {
    this.getCircuit(agentId).reset(approvedBy);
  }

  /**
   * Check if an agent has a circuit breaker
   */
  hasCircuit(agentId: string): boolean {
    return this.breakers.has(agentId);
  }

  /**
   * Remove a circuit breaker
   */
  removeCircuit(agentId: string): boolean {
    return this.breakers.delete(agentId);
  }

  /**
   * Get status for an agent's circuit
   */
  getStatus(agentId: string): CircuitBreakerStatus {
    return this.getCircuit(agentId).toJSON();
  }

  /**
   * List all agent IDs with circuits
   */
  listAgentIds(): string[] {
    return Array.from(this.breakers.keys());
  }

  /**
   * List all circuit breakers
   */
  listCircuits(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Get all open circuits
   */
  getOpenCircuits(): CircuitBreaker[] {
    return this.listCircuits().filter(b => b.isOpen);
  }

  /**
   * Get all half-open circuits
   */
  getHalfOpenCircuits(): CircuitBreaker[] {
    return this.listCircuits().filter(b => b.isHalfOpen);
  }

  /**
   * Get circuits by state
   */
  getCircuitsByState(state: CircuitState): CircuitBreaker[] {
    return this.listCircuits().filter(b => b.state === state);
  }

  /**
   * Add a global state change listener
   */
  onStateChange(listener: (event: CircuitStateChangeEvent) => void): () => void {
    this.globalListeners.push(listener);
    return () => {
      const index = this.globalListeners.indexOf(listener);
      if (index !== -1) {
        this.globalListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get statistics about all circuits
   */
  getStats(): CircuitBreakerRegistryStats {
    const circuits = this.listCircuits();
    const stateCounts: Record<CircuitState, number> = {
      [CircuitState.CLOSED]: 0,
      [CircuitState.OPEN]: 0,
      [CircuitState.HALF_OPEN]: 0,
    };

    let totalFailures = 0;
    let totalSuccesses = 0;

    for (const circuit of circuits) {
      stateCounts[circuit.state]++;
      totalFailures += circuit.totalFailures;
      totalSuccesses += circuit.totalSuccesses;
    }

    return {
      totalCircuits: circuits.length,
      stateCounts,
      totalFailures,
      totalSuccesses,
    };
  }

  /**
   * Reset all circuits (emergency use only)
   */
  resetAll(approvedBy: string): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset(approvedBy);
    }
  }

  /**
   * Export all circuit statuses
   */
  exportAll(): CircuitBreakerStatus[] {
    return this.listCircuits().map(b => b.toJSON());
  }

  /**
   * Import circuit statuses
   */
  importAll(statuses: CircuitBreakerStatus[]): void {
    for (const status of statuses) {
      const breaker = CircuitBreaker.fromJSON(status, this.trustRegistry);
      
      // Add global listener
      breaker.onStateChange((event) => {
        for (const listener of this.globalListeners) {
          try {
            listener(event);
          } catch {
            // Ignore listener errors
          }
        }
      });

      this.breakers.set(status.agentId, breaker);
    }
  }

  /**
   * Clear all circuits
   */
  clear(): void {
    this.breakers.clear();
  }
}
