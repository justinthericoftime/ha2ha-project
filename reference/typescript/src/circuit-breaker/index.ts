/**
 * Circuit Breaker Module
 * 
 * Implements §8.8 Cascading Failure Prevention from HA2HA specification.
 * Provides circuit breakers and workflow depth tracking to prevent cascading failures.
 */

// Types
export {
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  CircuitCheckResult,
  CircuitTransitionReason,
  CircuitStateChangeEvent,
  FailureRecord,
  WorkflowDepthError,
  CIRCUIT_STATE_NAMES,
  DEFAULT_CIRCUIT_CONFIG,
} from './types';

// Circuit Breaker
export { CircuitBreaker } from './circuit-breaker';

// Registry
export {
  CircuitBreakerRegistry,
  type CircuitBreakerRegistryOptions,
  type CircuitBreakerRegistryStats,
} from './registry';

// Workflow Depth
export {
  WorkflowDepthTracker,
  WorkflowDepthExceededError,
  type Ha2haTaskMetadata,
  type DepthCheckResult,
} from './workflow-depth';
