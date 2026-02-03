# Gap 5: Circuit Breakers — Full Plan

**Gap:** No circuit breakers (failures can cascade)
**Target:** Implement §8.8 Cascading Failure Prevention from HA2HA spec
**Wave:** 3 (Depends on Trust Model)

---

## Phase 1: Context

**Current State:**
- Failures from one agent don't affect others
- No workflow depth tracking
- No automatic failure isolation

**Constraints:**
- Must integrate with Trust Model (Gap 1) for trust reduction on trip
- Must track per-agent failure state
- Must support automatic recovery (half-open state)

**Dependencies:**
- Gap 1 (Trust Model): Trust reduction when circuit trips

**Trigger:** Cascading failures risk (OWASP ASI08)

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `CircuitBreaker` class | Per-agent circuit state |
| `CircuitBreakerRegistry` | Manages all circuit breakers |
| `WorkflowDepthTracker` | Tracks task depth in chains |
| `FailureCounter` | Counts consecutive/windowed failures |

### NOT Building

- Distributed circuit breakers
- Complex recovery strategies

### Success Criteria

1. 3 consecutive failures → circuit OPEN
2. OPEN circuit → all requests blocked
3. 1 hour → automatic HALF_OPEN
4. Success in HALF_OPEN → CLOSED
5. Failure in HALF_OPEN → OPEN
6. Workflow depth > 3 → REJECTED

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Circuit breaker types | `src/circuit-breaker/types.ts` |
| `circuit-breaker.ts` | Single agent circuit | `src/circuit-breaker/circuit-breaker.ts` |
| `registry.ts` | All circuits | `src/circuit-breaker/registry.ts` |
| `workflow-depth.ts` | Depth tracking | `src/circuit-breaker/workflow-depth.ts` |
| `index.ts` | Exports | `src/circuit-breaker/index.ts` |

### State Machine

```
         ┌─────────────┐
         │   CLOSED    │◄─── Normal operation
         └──────┬──────┘
                │ (3 consecutive failures OR
                │  5 failures in 5 min OR
                │  any Critical violation)
                ▼
         ┌─────────────┐
         │    OPEN     │◄─── All requests blocked
         └──────┬──────┘
                │ (1 hour elapsed)
                ▼
         ┌─────────────┐
         │  HALF_OPEN  │◄─── Testing recovery
         └──────┬──────┘
                │
        ┌───────┴───────┐
        │               │
   (success)        (failure)
        │               │
        ▼               ▼
    CLOSED           OPEN
```

---

## Phase 4: Implementation Spec

### circuit-breaker.ts

```typescript
export class CircuitBreaker {
  constructor(agentId: string, trustRegistry: TrustRegistry) { ... }
  
  get state(): CircuitState { ... }
  get isOpen(): boolean { ... }
  
  recordSuccess(): void { ... }
  recordFailure(severity: ViolationSeverity): void { ... }
  
  canProceed(): boolean { ... }
  
  // Manual controls
  trip(reason: string): void { ... }
  reset(approvedBy: string): void { ... }
  
  toJSON(): CircuitBreakerStatus { ... }
}
```

### workflow-depth.ts

```typescript
export class WorkflowDepthTracker {
  static readonly MAX_DEPTH = 3;
  
  static getDepth(taskMetadata: Ha2haTaskMetadata): number { ... }
  static incrementDepth(taskMetadata: Ha2haTaskMetadata): Ha2haTaskMetadata { ... }
  static checkDepth(depth: number): boolean { ... }
}
```

---

## Phase 5: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `circuit-breaker.test.ts` | State transitions |
| `failure-counting.test.ts` | Consecutive + windowed |
| `workflow-depth.test.ts` | Depth limits |
| `recovery.test.ts` | Half-open recovery |

### Acceptance Criteria

- [ ] 3 failures → OPEN
- [ ] OPEN → requests rejected
- [ ] 1 hour → HALF_OPEN
- [ ] Workflow depth > 3 → WORKFLOW_DEPTH_EXCEEDED

---

## Delegation Brief

**Agent:** comms (Luca-Comms) — after Gap 2 completes
**Task:** Implement Gap 5: Circuit Breakers

**WAIT FOR:** Gap 1 to complete first!

**Inputs:**
- This plan
- Spec §8.8 from SPECIFICATION.md
- Trust module (`src/trust/`)

**Outputs:**
- `src/circuit-breaker/` directory
- Unit tests
- Updated exports

**Success:** Circuit breakers prevent cascading failures.
