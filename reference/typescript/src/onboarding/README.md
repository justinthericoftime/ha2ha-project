# Onboarding Module

**Implements §10 Human Onboarding from HA2HA Specification**

This module provides types and utilities for loading and validating human approver profiles.

## Overview

Before a human can approve federation requests, they must be registered as a qualified approver through an onboarding process. This module handles:
- Profile type definitions
- Profile loading from YAML
- Profile validation

> **Note**: Runtime enforcement of profiles is handled by the [profile](../profile/README.md) module.

## Key Types

### ApproverProfile

The complete profile structure:

```typescript
interface ApproverProfile {
  approver: {
    name: string;       // Human name
    id: string;         // Unique identifier
    created: string;    // ISO 8601 creation date
  };
  
  identity: {
    model: 'channel-based' | 'multi-factor' | 'token';
    verification: 'simple' | 'moderate' | 'strict';
    channels?: Channel[];
  };
  
  authorization: {
    domains: string[];  // Authorized domains ('*' for all)
    availability: Availability;
    off_hours_behavior: 'queue' | 'deny' | 'escalate';
  };
  
  approval_preferences: {
    presentation: 'inline' | 'batched' | 'both';
    fatigue_limit: number | null;  // Max approvals/hour
    batching: boolean;
    batch_max_size?: number;
  };
  
  trust_baseline: {
    default_level: 'blocked' | 'unknown' | 'provisional';
    pre_trusted: PreTrustedEntity[];
  };
  
  recovery: {
    delegation: Delegate[] | null;
    timeout_hours: number;
    timeout_action: 'deny' | 'escalate' | 'hold';
  };
}
```

### PreTrustedEntity

```typescript
interface PreTrustedEntity {
  name: string;
  relationship?: string;
  level: 'provisional' | 'standard' | 'trusted';
  domains: string[];
  agent_id?: string;
}
```

### Availability

```typescript
interface Availability {
  mode: 'always' | 'waking-hours' | 'scheduled';
  enforcement: 'soft' | 'strict';
  schedule?: Schedule;
}

interface Schedule {
  timezone: string;
  windows: ScheduleWindow[];
}

interface ScheduleWindow {
  days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  start: string;  // HH:MM
  end: string;    // HH:MM
}
```

## Usage

### Loading Profiles

```typescript
import { loadApproverProfile } from '@ha2ha/reference/onboarding';

// Load from file
const profile = await loadApproverProfile('./approver-profile.yaml');

// With explicit path
const profile = await loadApproverProfile(
  '~/.openclaw/ha2ha/approvers/ricardo-caporale.yaml'
);
```

### Validating Profiles

```typescript
import { validateApproverProfile } from '@ha2ha/reference/onboarding';

const result = validateApproverProfile(profile);

if (!result.valid) {
  for (const error of result.errors) {
    console.error(`${error.path}: ${error.message}`);
  }
}
```

### Type Guards

```typescript
import type { ApproverProfile } from '@ha2ha/reference/onboarding';

function isApproverProfile(data: unknown): data is ApproverProfile {
  return validateApproverProfile(data as ApproverProfile).valid;
}
```

## Profile Format (YAML)

```yaml
# HA2HA Human Approver Profile
approver:
  name: "Ricardo Caporale"
  id: "ricardo-caporale"
  created: "2026-02-01T10:00:00Z"

identity:
  model: "channel-based"
  verification: "simple"
  channels:
    - type: telegram
      authenticated: true
      identifier: "@ricardo_caporale"

authorization:
  domains: ["*"]
  availability:
    mode: "waking-hours"
    enforcement: "soft"
  off_hours_behavior: "queue"

approval_preferences:
  presentation: "inline"
  fatigue_limit: null  # unlimited
  batching: false

trust_baseline:
  default_level: "unknown"
  pre_trusted:
    - name: "Mic's Agent"
      relationship: "brother's agent"
      level: "provisional"
      domains: ["*"]
      agent_id: "michelangelo.mic.ha2ha"

recovery:
  delegation: null
  timeout_hours: 5
  timeout_action: "deny"
```

## Storage Locations

Profiles are stored at well-known locations:

**Per-user:**
```
~/.openclaw/ha2ha/approvers/{approver-id}.yaml
```

**System-wide:**
```
/etc/ha2ha/approvers/{approver-id}.yaml
```

## Configuration Reference

The agent configuration references the active profile:

```json
{
  "ha2ha": {
    "enabled": true,
    "profile": "~/.openclaw/ha2ha/approvers/ricardo-caporale.yaml",
    "trustStore": "~/.openclaw/ha2ha/trust-store/"
  }
}
```

## Spec References

- **§10.1** Overview - Onboarding purpose
- **§10.2** Required Information - Field definitions
- **§10.3** Onboarding Flow Structure - Collection process
- **§10.4** Profile Format - YAML schema
- **§10.5** Storage Location - File paths
- **§10.6** Configuration Reference - Integration
