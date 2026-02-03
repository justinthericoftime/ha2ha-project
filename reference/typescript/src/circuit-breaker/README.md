# Circuit Breaker Module

**Implements §8.8 Cascading Failure Prevention from HA2HA Specification**

This module prevents cascading failures between federated agents using the circuit breaker pattern.

## Overview

When an agent starts failing repeatedly, the circuit breaker "trips" to prevent further requests until recovery is confirmed. This protects both agents from cascading failures.

## Key Types

### CircuitState (enum)

```typescript
enum CircuitState {
  CLOSED = 'closed',      // Normal operation, requests allowed
  OPEN = 'open',          // Circuit tripped, requests blocked
  HALF_OPEN = 'half_open', // Testing recovery, single request allowed
}
```

### CircuitBreakerConfig

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;        // Consecutive failures to trip (default: 3)
  windowedFailureThreshold: number; // Failures in window to trip (default: 5)
  failureWindowMs: number;         // Window duration (default: 5 minutes)
  resetTimeoutMs: number;          // OPEN → HALF_OPEN time (default: 1 hour)
  tripOnCritical: boolean;         // Trip on critical violation (default: true)
}
```

## Usage

### Creating Circuit Breakers

```typescript
import { CircuitBreaker, CircuitBreakerRegistry, TrustRegistry } from '@ha2ha/reference';

// Standalone circuit breaker
const breaker = new CircuitBreaker('peer-agent.example.ha2ha');

// Or with trust registry integration
const trustRegistry = await TrustRegistry.load('./trust-store');
const breaker = new CircuitBreaker('peer-agent.example.ha2ha', trustRegistry);

// Or use registry for multiple agents
const registry = new CircuitBreakerRegistry(trustRegistry);
const breaker = registry.getOrCreate('peer-agent.example.ha2ha');
```

### Checking Before Requests

```typescript
const check = breaker.canProceed();

if (!check.allowed) {
  console.log(`Circuit is ${check.state}: ${check.reason}`);
  if (check.resetAt) {
    console.log(`Will test recovery at: ${check.resetAt}`);
  }
  return; // Don't make request
}

// Proceed with request...
```

### Recording Outcomes

```typescript
import { ViolationSeverity } from '@ha2ha/reference';

try {
  const result = await makeRequest();
  breaker.recordSuccess();
} catch (error) {
  breaker.recordFailure(
    ViolationSeverity.MEDIUM,
    'Network timeout'
  );
}
```

### Manual Control

```typescript
// Manual trip (e.g., human operator decision)
breaker.trip('Suspicious activity detected');

// Manual reset (requires approval)
breaker.reset('admin@company.ha2ha');
```

### State Change Events

```typescript
const unsubscribe = breaker.onStateChange((event) => {
  console.log(`Circuit ${event.agentId}: ${event.fromState} → ${event.toState}`);
  console.log(`Reason: ${event.reason}`);
});

// Later: unsubscribe();
```

## State Machine

```
                ┌─────────────────────────────────────┐
                │                                     │
                ▼                                     │
        ┌──────────────┐                              │
        │    CLOSED    │─── 3 consecutive failures ──►│
        │   (normal)   │       or 5 in 5 min          │
        └──────┬───────┘       or critical            │
               │                                      │
               │ success                              │
               │                                      ▼
        ┌──────┴───────┐                      ┌──────────────┐
        │  HALF_OPEN   │◄─── 1 hour timeout ──│     OPEN     │
        │  (testing)   │                      │  (blocking)  │
        └──────┬───────┘                      └──────┬───────┘
               │                                      │
               │ failure                              │
               └──────────────────────────────────────┘
```

## Workflow Depth Tracking

Prevent cascading workflows that exceed allowed depth:

```typescript
import { WorkflowDepthTracker, WorkflowDepthExceededError } from '@ha2ha/reference';

const tracker = new WorkflowDepthTracker({ maxDepth: 3 });

// Check depth before processing
const result = tracker.check(taskMetadata);

if (!result.allowed) {
  throw new WorkflowDepthExceededError(result.depth, result.maxDepth);
}

// Track workflow chain
tracker.enter('task-1');
tracker.enter('task-2');
tracker.enter('task-3');
// tracker.enter('task-4'); // Would throw!

tracker.exit('task-3');
tracker.exit('task-2');
tracker.exit('task-1');
```

## Trip Conditions

A circuit trips (CLOSED → OPEN) when:

1. **Consecutive failures**: 3 failures in a row (default)
2. **Windowed failures**: 5 failures within 5 minutes (default)
3. **Critical violation**: Any ViolationSeverity.CRITICAL (if tripOnCritical enabled)
4. **Manual trip**: Human operator decision

## Recovery

1. After `resetTimeoutMs` (default: 1 hour), circuit transitions to HALF_OPEN
2. A single test request is allowed
3. **Success**: Circuit closes (normal operation)
4. **Failure**: Circuit opens again

## Spec References

- **§8.8** Cascading Failure Prevention - Pattern overview
- **§8.8.1** Workflow Depth Limits - Depth tracking
- **§8.8.2** Circuit Breaker Pattern - Trip conditions
- **§8.8.3** Failure Isolation - Recovery handling
