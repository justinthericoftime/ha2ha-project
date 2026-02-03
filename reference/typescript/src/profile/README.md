# Profile Module

**Implements §10 Human Onboarding runtime enforcement from HA2HA Specification**

This module enforces approver profile constraints at runtime, including availability, fatigue limits, and pre-trusted entity resolution.

## Overview

Approver profiles define:
- **Availability**: When can the approver review requests?
- **Fatigue limits**: How many approvals per hour?
- **Pre-trusted entities**: Which agents get elevated starting trust?
- **Recovery**: Delegation and timeout handling

## Key Types

### EnforcementResult

```typescript
interface EnforcementResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
  suggestedAction?: 'queue' | 'deny' | 'escalate';
}
```

### FatigueStatus

```typescript
interface FatigueStatus {
  approvalsThisHour: number;
  limit: number | null;
  exceeded: boolean;
  minutesUntilReset: number;
}
```

### AvailabilityStatus

```typescript
interface AvailabilityStatus {
  available: boolean;
  mode: 'always' | 'waking-hours' | 'scheduled';
  enforcement: 'soft' | 'strict';
  nextAvailableAt?: Date;
  reason?: string;
}
```

## Usage

### Profile Enforcer

The main orchestrator for all profile checks:

```typescript
import { ProfileEnforcer } from '@ha2ha/reference';

const enforcer = ProfileEnforcer.fromFile('./approver-profile.yaml');
// Or with explicit profile:
const enforcer = new ProfileEnforcer({ profile: loadedProfile });
```

### Checking Full Enforcement

```typescript
const result = enforcer.check({
  agentId: 'peer-agent.example.ha2ha',
  taskId: 'task-123',
  domain: 'data-access',
});

if (!result.allowed) {
  if (result.suggestedAction === 'queue') {
    // Queue for later
  } else if (result.suggestedAction === 'escalate') {
    // Find backup approver
  } else {
    // Deny
  }
}
```

### Availability Checking

```typescript
import { AvailabilityChecker, DEFAULT_WAKING_HOURS } from '@ha2ha/reference';

const checker = new AvailabilityChecker(profile.authorization.availability);

const status = checker.check();
if (!status.available) {
  console.log(`Unavailable: ${status.reason}`);
  console.log(`Next available: ${status.nextAvailableAt}`);
}

// Check for specific time
const status = checker.check({ at: new Date('2026-02-03T03:00:00Z') });
```

### Fatigue Tracking

```typescript
import { FatigueTracker, createFatigueTracker } from '@ha2ha/reference';

const tracker = createFatigueTracker({
  limit: profile.approval_preferences.fatigue_limit,
});

// Record an approval
tracker.recordApproval('task-123', 'agent-a.ha2ha');

// Check fatigue status
const status = tracker.getStatus();
if (status.exceeded) {
  console.log(`Fatigue limit exceeded (${status.approvalsThisHour}/${status.limit})`);
}
```

### Pre-Trust Resolution

```typescript
import { PreTrustResolver } from '@ha2ha/reference';

const resolver = new PreTrustResolver(profile.trust_baseline.pre_trusted);

const result = resolver.resolve({
  agentId: 'trusted-partner.example.ha2ha',
  domain: 'data-sync',
});

if (result.matched) {
  console.log(`Pre-trusted at level: ${result.trustLevel}`);
  console.log(`Trusted for domains: ${result.domains?.join(', ')}`);
}
```

## Availability Modes

### Always

```yaml
availability:
  mode: always
  enforcement: soft  # or strict
```

### Waking Hours

```yaml
availability:
  mode: waking-hours
  enforcement: soft
```

Default waking hours: 08:00 - 23:00 in local timezone.

### Scheduled

```yaml
availability:
  mode: scheduled
  enforcement: strict
  schedule:
    timezone: America/New_York
    windows:
      - days: [mon, tue, wed, thu, fri]
        start: "09:00"
        end: "17:00"
```

## Off-Hours Behavior

When approver is unavailable:

- **queue**: Hold requests until available
- **deny**: Reject immediately
- **escalate**: Forward to backup approver

```yaml
authorization:
  off_hours_behavior: queue
```

## Spec References

- **§10.2** Required Information - Profile fields
- **§10.3** Onboarding Flow Structure - Collection process
- **§10.4** Profile Format - YAML schema
- **§9.4** Qualified Approver Requirements - Competency
- **§8.7** Automation Bias Mitigation - Fatigue limits
