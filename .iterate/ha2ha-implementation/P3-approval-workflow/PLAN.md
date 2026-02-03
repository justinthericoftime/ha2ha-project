# Gap 3: Human Approval Workflow — Full Plan

**Gap:** No human approval workflow (tasks execute immediately)
**Target:** Implement §6 Message Flows + §7 Operations from HA2HA spec
**Wave:** 2 (Depends on Trust Model + Crypto Identity)

---

## Phase 1: Context

**Current State:**
- OpenClaw `sessions_spawn` executes tasks immediately if agent is in allowlist
- No approval queue, no SUBMITTED state
- No hash commitment on approvals
- No timeout handling

**Constraints:**
- Must integrate with Trust Model (Gap 1) for trust-level checks
- Must integrate with Crypto Identity (Gap 2) for approver signatures
- Must not break existing session workflow (backward compatible)
- Must provide CLI for approval (no GUI requirement)

**Dependencies:**
- Gap 1 (Trust Model): Need trust levels for approval scope decisions
- Gap 2 (Crypto Identity): Need signatures for approval hash commitment

**Trigger:** Core HA2HA principle — human approval required for all cross-agent tasks

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `PendingTask` class | Task awaiting approval |
| `ApprovalQueue` class | Manages pending tasks |
| `ApprovalRequest` class | Human approval with hash commitment |
| `ApprovalValidator` | Validates approval requests |
| `TaskLifecycle` | State machine per spec §6.4 |
| CLI commands | `ha2ha approve`, `ha2ha reject`, `ha2ha list` |
| Notification | Alert human of pending approvals |

### NOT Building

- GUI for approvals (CLI only)
- Approval batching (single approvals only for v0.1)
- Pre-approval rules (defer to Gap 4 profile enforcement)
- Category-wide approvals (single/similar only)

### Success Criteria

1. Cross-agent tasks enter SUBMITTED state and wait
2. Tasks require explicit human approval before WORKING
3. Approval includes SHA-256 hash of task payload
4. Hash mismatch → rejection + trust reduction
5. Timeout → auto-deny (fail-secure)
6. Human notified of pending approvals

### Risks

| Risk | L/I | Mitigation |
|------|-----|------------|
| Approval latency | H/M | Clear timeout messaging, async patterns |
| Missed approvals | M/M | Notification system, timeout alerts |
| Hash computation cost | L/L | SHA-256 is fast, cache hashes |

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Approval interfaces | `src/approval/types.ts` |
| `pending-task.ts` | Task awaiting approval | `src/approval/pending-task.ts` |
| `approval-queue.ts` | Queue management | `src/approval/approval-queue.ts` |
| `approval-request.ts` | Approval creation | `src/approval/approval-request.ts` |
| `validator.ts` | Approval validation | `src/approval/validator.ts` |
| `task-lifecycle.ts` | State machine | `src/approval/task-lifecycle.ts` |
| `hash.ts` | Canonical JSON + SHA-256 | `src/approval/hash.ts` |
| `cli.ts` | CLI commands | `src/approval/cli.ts` |
| `index.ts` | Public exports | `src/approval/index.ts` |

### Data Flow

```
Incoming Task
     │
     ▼
┌─────────────────┐
│ TaskLifecycle   │
│ → SUBMITTED     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ApprovalQueue   │
│ .add(task)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Notify Human    │
│ (CLI/Message)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│ Human Decision  │──────►│ ApprovalRequest │
│                 │       │ + payloadHash   │
│ approve/reject  │       │ + signature     │
└────────┬────────┘       └────────┬────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│ Validator       │◄──────│ Hash Verify     │
│ .validate()     │       │ canonical_json  │
└────────┬────────┘       └─────────────────┘
         │
         ▼
┌─────────────────┐
│ TaskLifecycle   │
│ → WORKING       │
│ (execute task)  │
└─────────────────┘
```

### State Machine

```
                    ┌───────────────┐
                    │   SUBMITTED   │◄─── Task received
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌───────────┐   ┌───────────┐   ┌───────────┐
    │ APPROVED  │   │ REJECTED  │   │ TIMEOUT   │
    │ (ha2ha/)  │   │ (ha2ha/)  │   │ (auto)    │
    └─────┬─────┘   └───────────┘   └───────────┘
          │              │               │
          ▼              │               │
    ┌───────────┐        │               │
    │  WORKING  │        │               │
    └─────┬─────┘        │               │
          │              │               │
    ┌─────┼─────┐        │               │
    ▼           ▼        ▼               ▼
┌───────┐ ┌───────┐ ┌───────────────────────┐
│COMPLET│ │FAILED │ │      CANCELED         │
└───────┘ └───────┘ └───────────────────────┘
```

### Storage Layout

```
~/.openclaw/ha2ha/pending/
├── {task-id}.json       # Pending task details
├── {task-id}.payload    # Original payload (for hash verification)
└── index.json           # Queue index
```

### Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hash algorithm | SHA-256 | Spec requirement, widely supported |
| Canonical JSON | `json-canonicalize` | RFC 8785 compliant |
| Timeout | 1 hour default | Spec recommendation |
| Notification | Console + optional message | Start simple |

---

## Phase 4: Dependency Analysis

```
types.ts ─────────────────────────────┐
                                      ▼
hash.ts ────────────────────────► pending-task.ts
                                      │
                                      ▼
                                approval-request.ts
                                      │
                                      ▼
validator.ts ◄─── (needs trust) ─► approval-queue.ts
    │                                 │
    └─────────────┬───────────────────┘
                  ▼
            task-lifecycle.ts
                  │
                  ▼
                cli.ts
                  │
                  ▼
               index.ts
```

**External Dependencies:**
- `src/trust/` (Gap 1) — Trust level checks
- `src/identity/` (Gap 2) — Signature verification

**Build Order:**
1. `types.ts` (no deps)
2. `hash.ts` (no deps)
3. `pending-task.ts` (needs types, hash)
4. `approval-request.ts` (needs types, hash)
5. `validator.ts` (needs trust, identity)
6. `approval-queue.ts` (needs pending-task, validator)
7. `task-lifecycle.ts` (needs queue)
8. `cli.ts` (needs all above)
9. `index.ts` (exports)

---

## Phase 5: File Ownership

| File | Owner | Permission |
|------|-------|------------|
| `src/approval/types.ts` | approval-workflow agent | CREATE |
| `src/approval/hash.ts` | approval-workflow agent | CREATE |
| `src/approval/pending-task.ts` | approval-workflow agent | CREATE |
| `src/approval/approval-request.ts` | approval-workflow agent | CREATE |
| `src/approval/validator.ts` | approval-workflow agent | CREATE |
| `src/approval/approval-queue.ts` | approval-workflow agent | CREATE |
| `src/approval/task-lifecycle.ts` | approval-workflow agent | CREATE |
| `src/approval/cli.ts` | approval-workflow agent | CREATE |
| `src/approval/index.ts` | approval-workflow agent | CREATE |
| `src/index.ts` | approval-workflow agent | MODIFY |

---

## Phase 6: Implementation Spec

### types.ts

```typescript
export enum TaskState {
  SUBMITTED = 'SUBMITTED',
  WORKING = 'WORKING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

export enum ApprovalScope {
  SINGLE = 'single',
  SIMILAR = 'similar',
  CATEGORY = 'category',
}

export interface PendingTaskData {
  taskId: string;
  sourceAgent: string;
  targetAgent: string;
  payload: unknown;
  payloadHash: string;
  state: TaskState;
  receivedAt: string;
  expiresAt: string;
  trustLevel: number;
}

export interface ApprovalRequestData {
  taskId: string;
  approvedBy: string;
  approvalScope: ApprovalScope;
  expiresAt?: string;
  payloadHash: string;
  approverSignature: string;
  conditions?: ApprovalConditions;
}

export interface ApprovalConditions {
  maxCost?: number;
  allowedActions?: string[];
  custom?: Record<string, unknown>;
}

export interface RejectionData {
  taskId: string;
  rejectedBy: string;
  reason: string;
  trustAction: 'none' | 'reduce' | 'block';
  trustLevelNew?: number;
}

export enum ApprovalError {
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  TASK_ALREADY_REJECTED = 'TASK_ALREADY_REJECTED',
  TASK_ALREADY_APPROVED = 'TASK_ALREADY_APPROVED',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  HASH_MISMATCH = 'HASH_MISMATCH',
  APPROVER_NOT_QUALIFIED = 'APPROVER_NOT_QUALIFIED',
}
```

### hash.ts

```typescript
import { createHash } from 'crypto';
import canonicalize from 'json-canonicalize';

export function computePayloadHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

export function verifyPayloadHash(payload: unknown, expectedHash: string): boolean {
  return computePayloadHash(payload) === expectedHash;
}
```

### approval-queue.ts

```typescript
export class ApprovalQueue {
  constructor(storePath: string, trustRegistry: TrustRegistry) { ... }
  
  async add(task: PendingTask): Promise<void> { ... }
  async get(taskId: string): Promise<PendingTask | null> { ... }
  async remove(taskId: string): Promise<void> { ... }
  
  async approve(request: ApprovalRequest): Promise<ApprovalResult> { ... }
  async reject(rejection: RejectionData): Promise<void> { ... }
  
  async checkTimeouts(): Promise<string[]> { ... }  // Returns expired taskIds
  
  listPending(): PendingTask[] { ... }
  
  onApprovalNeeded(callback: (task: PendingTask) => void): void { ... }
}
```

### cli.ts

```typescript
// ha2ha approve <taskId>
// ha2ha reject <taskId> --reason "..."
// ha2ha list
// ha2ha show <taskId>

export async function runCli(args: string[]): Promise<void> { ... }
```

---

## Phase 7: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `hash.test.ts` | Canonical JSON + SHA-256 consistency |
| `pending-task.test.ts` | State transitions, timeout calculation |
| `validator.test.ts` | Hash verification, error codes |
| `approval-queue.test.ts` | Add, approve, reject, timeout |

### Integration Tests

| Test | Description |
|------|-------------|
| `full-flow.test.ts` | Task → Queue → Approve → Execute |
| `timeout.test.ts` | Task timeout → CANCELED |
| `hash-mismatch.test.ts` | Tampered payload → Rejection |

### Acceptance Criteria

- [ ] Task enters SUBMITTED and waits for approval
- [ ] `ha2ha list` shows pending tasks
- [ ] `ha2ha approve <id>` approves with hash verification
- [ ] `ha2ha reject <id>` rejects with optional trust reduction
- [ ] Timeout (1 hour) auto-cancels task
- [ ] Hash mismatch returns `HASH_MISMATCH` error

---

## Delegation Brief

**Agent:** server (Luca-Server)
**Task:** Implement Gap 3: Human Approval Workflow

**WAIT FOR:** Gap 1 and Gap 2 to complete first!

**Inputs:**
- This plan document
- Spec §6, §7 from SPECIFICATION.md
- Completed trust module (`src/trust/`)
- Completed identity module (`src/identity/`)

**Outputs:**
- `src/approval/` directory with all files
- Unit tests in `src/approval/__tests__/`
- CLI commands working
- Updated `src/index.ts` with approval exports

**Dependencies:**
- `json-canonicalize` package (add to package.json)

**Success:** Full approval flow works end-to-end with hash verification.
