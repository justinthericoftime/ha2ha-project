# Gap 6: Hash-Chained Audit — Full Plan

**Gap:** Logs not tamper-evident (can be modified)
**Target:** Implement §8.9 Audit Log Integrity from HA2HA spec
**Wave:** 3 (Depends on Approval Workflow for logging approvals)

---

## Phase 1: Context

**Current State:**
- OpenClaw has basic file logs in `~/.openclaw/logs/`
- Logs can be modified without detection
- No cryptographic chaining

**Constraints:**
- Each entry includes hash of previous entry
- Must verify chain integrity on startup
- Must alert on chain break detection

**Dependencies:**
- Gap 3 (Approval Workflow): Logs approval events

**Trigger:** Tamper-evident audit trail required for compliance

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `AuditEntry` class | Single audit log entry with hash |
| `AuditChain` class | Hash-chained log management |
| `ChainVerifier` | Verify chain integrity |
| `AuditQuery` | Query audit logs |

### NOT Building

- External audit log collection
- Cross-signing between peers
- Distributed audit storage

### Success Criteria

1. Each entry includes SHA-256(previous entry)
2. Chain verifies on startup
3. Chain break → alert + preserve evidence
4. All HA2HA events are logged

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Audit types | `src/audit/types.ts` |
| `audit-entry.ts` | Single entry | `src/audit/audit-entry.ts` |
| `audit-chain.ts` | Chain management | `src/audit/audit-chain.ts` |
| `verifier.ts` | Integrity checking | `src/audit/verifier.ts` |
| `query.ts` | Log queries | `src/audit/query.ts` |
| `index.ts` | Exports | `src/audit/index.ts` |

### Hash Chain Structure

```
Entry 0 (Genesis)
┌─────────────────┐
│ prevHash: null  │
│ data: {...}     │
│ hash: SHA256(.) │──┐
└─────────────────┘  │
                     │
Entry 1              │
┌─────────────────┐  │
│ prevHash: ──────┼──┘
│ data: {...}     │
│ hash: SHA256(.) │──┐
└─────────────────┘  │
                     │
Entry 2              │
┌─────────────────┐  │
│ prevHash: ──────┼──┘
│ data: {...}     │
│ hash: SHA256(.) │
└─────────────────┘
```

---

## Phase 4: Implementation Spec

### audit-entry.ts

```typescript
export class AuditEntry {
  readonly timestamp: string;
  readonly eventType: AuditEventType;
  readonly taskId?: string;
  readonly sourceAgentId: string;
  readonly targetAgentId: string;
  readonly humanId?: string;
  readonly trustLevel: number;
  readonly outcome: 'success' | 'rejected' | 'error';
  readonly details: Record<string, unknown>;
  readonly prevHash: string | null;
  readonly hash: string;
  
  static create(data: Omit<AuditEntry, 'hash'>, prevHash: string | null): AuditEntry { ... }
  static computeHash(entry: Omit<AuditEntry, 'hash'>): string { ... }
}
```

### audit-chain.ts

```typescript
export class AuditChain {
  constructor(storePath: string) { ... }
  
  async load(): Promise<void> { ... }
  async append(entry: Omit<AuditEntry, 'hash' | 'prevHash'>): Promise<AuditEntry> { ... }
  
  getLastHash(): string | null { ... }
  verify(): ChainVerificationResult { ... }
  
  query(options: AuditQueryOptions): AuditEntry[] { ... }
}

export interface ChainVerificationResult {
  valid: boolean;
  brokenAt?: number;  // Index where chain breaks
  evidence?: AuditEntry[];  // Entries around break point
}
```

---

## Phase 5: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `audit-entry.test.ts` | Hash computation |
| `audit-chain.test.ts` | Append, verify chain |
| `tamper-detection.test.ts` | Modified entry → detected |
| `query.test.ts` | Filter, pagination |

### Acceptance Criteria

- [ ] Each entry hash includes previous hash
- [ ] Chain verifies correctly when unmodified
- [ ] Modifying any entry breaks verification
- [ ] Chain break preserves evidence

---

## Delegation Brief

**Agent:** synth (Luca-SynthMatch)
**Task:** Implement Gap 6: Hash-Chained Audit

**WAIT FOR:** Gap 3 to complete first!

**Inputs:**
- This plan
- Spec §8.9 from SPECIFICATION.md
- Approval module (`src/approval/`)

**Outputs:**
- `src/audit/` directory
- Unit tests
- Updated exports

**Success:** Tamper-evident audit log with hash chaining.
