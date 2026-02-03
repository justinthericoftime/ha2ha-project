# Gap 1: Trust Model — Full Plan

**Gap:** No trust model (binary allowlist only)
**Target:** Implement §5 Trust Model from HA2HA spec
**Wave:** 1 (Foundation, no dependencies)

---

## Phase 1: Context

**Current State:**
- OpenClaw has `tools.agentToAgent.allow[]` — binary allow/deny
- No trust levels, no transitions, no cooldowns
- No violation tracking or behavioral history

**Constraints:**
- Must integrate with existing OpenClaw agent system
- Must persist trust state across restarts
- Must be backward-compatible (existing agents continue working)

**Trigger:** HA2HA implementation requires graduated trust model

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `TrustLevel` enum | 6 levels (0-5) with metadata |
| `TrustEntry` class | Per-agent trust state |
| `TrustRegistry` class | Manages all trust entries |
| `TrustTransition` logic | Elevation/reduction rules |
| `ViolationHandler` | Severity-based trust reduction |
| Persistence layer | JSON file at `~/.openclaw/ha2ha/trust-store/` |
| OpenClaw integration | Config extension, runtime loading |

### NOT Building

- Human approval workflow (Gap 3)
- Cryptographic verification (Gap 2)
- Full behavioral monitoring (defer to v0.2)
- UI for trust management (CLI only for now)

### Success Criteria

1. Trust levels 0-5 exist with correct semantics
2. Trust can be elevated by human approval
3. Violations reduce trust based on severity
4. Cooldown periods are enforced
5. Trust state persists across restarts
6. Existing agent allowlist maps to initial trust levels

### Risks

| Risk | L/I | Mitigation |
|------|-----|------------|
| Breaking existing agents | M/H | Map allowlist → Level 3 (Standard) |
| Clock skew issues | L/M | 60-second tolerance per spec |
| State corruption | L/H | Atomic writes, backup on load |

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Trust enums and interfaces | `src/trust/types.ts` |
| `trust-entry.ts` | Single agent trust state | `src/trust/trust-entry.ts` |
| `trust-registry.ts` | Trust state management | `src/trust/trust-registry.ts` |
| `violations.ts` | Violation handling | `src/trust/violations.ts` |
| `persistence.ts` | File-based storage | `src/trust/persistence.ts` |
| `index.ts` | Public exports | `src/trust/index.ts` |

### Data Flow

```
Agent Request
     │
     ▼
┌─────────────────┐
│ TrustRegistry   │◄──── Load from persistence
│ .getTrust(id)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ TrustEntry      │
│ - level         │
│ - cooldown      │
│ - violations    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Decision:       │
│ Allow/Block/    │
│ RequireApproval │
└─────────────────┘
```

### Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage format | JSON | Human-readable, easy debugging |
| Storage location | `~/.openclaw/ha2ha/trust-store/` | Consistent with onboarding |
| Timestamp handling | luxon | Better timezone/ISO support than Date |
| Concurrency | File locking | Simple, reliable for single-process |

---

## Phase 4: Dependency Analysis

```
types.ts ─────────────────────┐
                              ▼
trust-entry.ts ──────────► violations.ts
       │                      │
       ▼                      │
persistence.ts ◄──────────────┘
       │
       ▼
trust-registry.ts
       │
       ▼
index.ts
```

**Build Order:**
1. `types.ts` (no deps)
2. `trust-entry.ts` (needs types)
3. `violations.ts` (needs types)
4. `persistence.ts` (needs types, trust-entry)
5. `trust-registry.ts` (needs all above)
6. `index.ts` (exports)

---

## Phase 5: File Ownership

| File | Owner | Permission |
|------|-------|------------|
| `src/trust/types.ts` | trust-model agent | CREATE |
| `src/trust/trust-entry.ts` | trust-model agent | CREATE |
| `src/trust/violations.ts` | trust-model agent | CREATE |
| `src/trust/persistence.ts` | trust-model agent | CREATE |
| `src/trust/trust-registry.ts` | trust-model agent | CREATE |
| `src/trust/index.ts` | trust-model agent | CREATE |
| `src/index.ts` | trust-model agent | MODIFY (add export) |

---

## Phase 6: Implementation Spec

### types.ts

```typescript
export enum TrustLevel {
  BLOCKED = 0,
  UNKNOWN = 1,
  PROVISIONAL = 2,
  STANDARD = 3,
  TRUSTED = 4,
  VERIFIED = 5,
}

export const TRUST_LEVEL_NAMES: Record<TrustLevel, string> = {
  [TrustLevel.BLOCKED]: 'BLOCKED',
  [TrustLevel.UNKNOWN]: 'UNKNOWN',
  [TrustLevel.PROVISIONAL]: 'PROVISIONAL',
  [TrustLevel.STANDARD]: 'STANDARD',
  [TrustLevel.TRUSTED]: 'TRUSTED',
  [TrustLevel.VERIFIED]: 'VERIFIED',
};

export const COOLDOWN_PERIODS: Record<TrustLevel, number> = {
  [TrustLevel.BLOCKED]: Infinity,  // Permanent until human unblock
  [TrustLevel.UNKNOWN]: 24 * 60 * 60 * 1000,     // 24 hours
  [TrustLevel.PROVISIONAL]: 4 * 60 * 60 * 1000,  // 4 hours
  [TrustLevel.STANDARD]: 1 * 60 * 60 * 1000,     // 1 hour
  [TrustLevel.TRUSTED]: 15 * 60 * 1000,          // 15 minutes
  [TrustLevel.VERIFIED]: 5 * 60 * 1000,          // 5 minutes
};

export enum ViolationSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum TransitionReason {
  INITIAL = 'initial',
  HUMAN_APPROVAL = 'human_approval',
  VIOLATION_CRITICAL = 'violation_critical',
  VIOLATION_HIGH = 'violation_high',
  VIOLATION_MEDIUM = 'violation_medium',
  VIOLATION_LOW = 'violation_low',
  HUMAN_OVERRIDE = 'human_override',
  COOLDOWN_EXPIRED = 'cooldown_expired',
}

export interface TrustContext {
  level: TrustLevel;
  levelName: string;
  lastTransition: string;  // ISO 8601
  transitionReason: TransitionReason;
  violationCount: number;
  cooldownExpires: string | null;  // ISO 8601 or null
  preApprovalScope: string[];
}

export interface TrustEntryData {
  agentId: string;
  level: TrustLevel;
  createdAt: string;
  lastTransition: string;
  transitionReason: TransitionReason;
  violationCount: number;
  cooldownExpires: string | null;
  preApprovalScope: string[];
  history: TrustHistoryEntry[];
}

export interface TrustHistoryEntry {
  timestamp: string;
  fromLevel: TrustLevel;
  toLevel: TrustLevel;
  reason: TransitionReason;
  approvedBy?: string;
  details?: string;
}
```

### trust-entry.ts

```typescript
export class TrustEntry {
  constructor(data: TrustEntryData) { ... }
  
  get level(): TrustLevel { ... }
  get isBlocked(): boolean { ... }
  get isInCooldown(): boolean { ... }
  get context(): TrustContext { ... }
  
  canElevate(): boolean { ... }
  elevate(approvedBy: string): void { ... }
  reduce(severity: ViolationSeverity): void { ... }
  block(reason: string): void { ... }
  unblock(approvedBy: string): void { ... }
  
  toJSON(): TrustEntryData { ... }
}
```

### trust-registry.ts

```typescript
export class TrustRegistry {
  constructor(storePath: string) { ... }
  
  async load(): Promise<void> { ... }
  async save(): Promise<void> { ... }
  
  getTrust(agentId: string): TrustEntry { ... }
  setTrust(agentId: string, level: TrustLevel, approvedBy: string): void { ... }
  recordViolation(agentId: string, severity: ViolationSeverity, details: string): void { ... }
  
  listAgents(): TrustEntry[] { ... }
  getBlockedAgents(): TrustEntry[] { ... }
  
  // Migration from allowlist
  importFromAllowlist(allowedAgents: string[]): void { ... }
}
```

---

## Phase 7: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `trust-levels.test.ts` | All 6 levels have correct metadata |
| `elevation.test.ts` | Trust elevation requires human + no cooldown |
| `violation.test.ts` | Violations reduce trust by severity |
| `cooldown.test.ts` | Cooldown periods are enforced |
| `persistence.test.ts` | State survives save/load cycle |

### Integration Tests

| Test | Description |
|------|-------------|
| `allowlist-migration.test.ts` | Existing allowlist maps to Level 3 |
| `cross-agent-trust.test.ts` | Two agents agree on minimum trust |

### Acceptance Criteria

- [ ] `npm test` passes all trust module tests
- [ ] Trust state persists in `~/.openclaw/ha2ha/trust-store/agents.json`
- [ ] Blocked agent (Level 0) cannot communicate
- [ ] New agent starts at Level 1 (Unknown)
- [ ] Existing allowed agents start at Level 3 (Standard)

---

## Delegation Brief

**Agent:** server (Luca-Server)
**Task:** Implement Gap 1: Trust Model

**Inputs:**
- This plan document
- Spec §5 from SPECIFICATION.md
- Protobuf definitions from ha2ha.proto

**Outputs:**
- `src/trust/` directory with all files
- Unit tests in `src/trust/__tests__/`
- Updated `src/index.ts` with trust exports

**Success:** All tests pass, trust state persists correctly.
