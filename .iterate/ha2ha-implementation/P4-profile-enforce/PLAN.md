# Gap 4: Profile Enforcement — Full Plan

**Gap:** Profile exists but nothing reads/enforces it
**Target:** Implement §10 runtime enforcement from HA2HA spec
**Wave:** 3 (Depends on Approval Workflow)

---

## Phase 1: Context

**Current State:**
- Approver profile exists at `onboarding/ricardo-caporale.yaml`
- Profile loader exists in `src/onboarding/loader.ts`
- Nothing loads the profile at runtime
- No preference enforcement (availability, fatigue limits, etc.)

**Constraints:**
- Must integrate with Approval Queue (Gap 3)
- Must respect all profile settings from §10
- Must work with OpenClaw's existing config system

**Dependencies:**
- Gap 3 (Approval Workflow): Provides approval queue to enforce against

**Trigger:** Profile is useless without runtime enforcement

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `ProfileEnforcer` class | Applies profile rules to approval decisions |
| `AvailabilityChecker` | Checks waking hours, schedules |
| `FatigueTracker` | Tracks approvals per hour |
| `PreTrustResolver` | Applies pre-trusted entity rules |
| `TimeoutEnforcer` | Applies profile timeout settings |
| Config integration | Load profile path from openclaw.json |

### NOT Building

- Multiple approver profiles (single profile for now)
- Dynamic profile switching
- Profile editing UI

### Success Criteria

1. Profile loads from path specified in config
2. Availability (waking hours) is checked before notification
3. Pre-trusted entities start at Provisional trust
4. Timeout uses profile's `timeout_hours` setting
5. Fatigue limit warns when exceeded (if configured)

### Risks

| Risk | L/I | Mitigation |
|------|-----|------------|
| Profile not found | M/M | Clear error, fallback to defaults |
| Time zone issues | L/M | Use system timezone, document |

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Enforcer interfaces | `src/profile/types.ts` |
| `profile-enforcer.ts` | Main enforcement logic | `src/profile/profile-enforcer.ts` |
| `availability.ts` | Time-based availability | `src/profile/availability.ts` |
| `fatigue.ts` | Rate limiting tracker | `src/profile/fatigue.ts` |
| `pre-trust.ts` | Pre-trusted resolution | `src/profile/pre-trust.ts` |
| `index.ts` | Public exports | `src/profile/index.ts` |

### Integration Points

```
┌─────────────────────────────────────────────────────┐
│                   ApprovalQueue                      │
│                        │                             │
│                        ▼                             │
│  ┌─────────────────────────────────────────────┐    │
│  │            ProfileEnforcer                   │    │
│  │  ┌──────────────┬──────────────┬──────────┐ │    │
│  │  │ Availability │   Fatigue    │ PreTrust │ │    │
│  │  │   Checker    │   Tracker    │ Resolver │ │    │
│  │  └──────────────┴──────────────┴──────────┘ │    │
│  └─────────────────────────────────────────────┘    │
│                        │                             │
│                        ▼                             │
│                  TrustRegistry                       │
└─────────────────────────────────────────────────────┘
```

---

## Phase 4: File Ownership

| File | Owner | Permission |
|------|-------|------------|
| `src/profile/types.ts` | profile-enforce agent | CREATE |
| `src/profile/profile-enforcer.ts` | profile-enforce agent | CREATE |
| `src/profile/availability.ts` | profile-enforce agent | CREATE |
| `src/profile/fatigue.ts` | profile-enforce agent | CREATE |
| `src/profile/pre-trust.ts` | profile-enforce agent | CREATE |
| `src/profile/index.ts` | profile-enforce agent | CREATE |

---

## Phase 5: Implementation Spec

### profile-enforcer.ts

```typescript
export class ProfileEnforcer {
  constructor(
    profile: ApproverProfile,
    trustRegistry: TrustRegistry,
    approvalQueue: ApprovalQueue
  ) { ... }
  
  // Check if approval can proceed
  canApprove(): EnforcementResult { ... }
  
  // Check availability
  isAvailable(): boolean { ... }
  
  // Check fatigue
  checkFatigue(): FatigueStatus { ... }
  
  // Get timeout for new tasks
  getTimeout(): number { ... }
  
  // Resolve pre-trusted entities on first contact
  resolvePreTrust(agentId: string, name: string): TrustLevel | null { ... }
  
  // Record an approval for fatigue tracking
  recordApproval(): void { ... }
}

export interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

export interface FatigueStatus {
  approvalsThisHour: number;
  limit: number | null;
  exceeded: boolean;
}
```

### availability.ts

```typescript
export class AvailabilityChecker {
  constructor(availability: ProfileAvailability) { ... }
  
  isAvailable(now?: Date): boolean { ... }
  getNextAvailableTime(): Date | null { ... }
  
  // Check if within waking hours (judgment-based)
  isWakingHours(now?: Date): boolean { ... }
}
```

---

## Phase 6: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `availability.test.ts` | Waking hours detection |
| `fatigue.test.ts` | Rate tracking, limit enforcement |
| `pre-trust.test.ts` | Pre-trusted entity resolution |
| `enforcer.test.ts` | Integration of all checks |

### Acceptance Criteria

- [ ] Profile loads from openclaw.json `ha2ha.profile` path
- [ ] Pre-trusted names (Mic, JD) → Provisional trust on first contact
- [ ] Timeout uses profile's 5-hour setting
- [ ] Off-hours requests are queued (not denied)

---

## Delegation Brief

**Agent:** synth (Luca-SynthMatch) — available for Wave 3
**Task:** Implement Gap 4: Profile Enforcement

**WAIT FOR:** Gap 3 to complete first!

**Inputs:**
- This plan document
- Spec §10 from SPECIFICATION.md
- Ricardo's profile at `onboarding/ricardo-caporale.yaml`
- Completed approval module (`src/approval/`)

**Outputs:**
- `src/profile/` directory with all files
- Unit tests in `src/profile/__tests__/`
- Updated `src/index.ts` with profile exports

**Success:** Profile preferences are enforced at runtime.
