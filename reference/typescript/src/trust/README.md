# Trust Module

**Implements §5 Trust Model from HA2HA Specification**

This module manages trust levels, transitions, and violation handling for agent relationships.

## Overview

HA2HA uses a 6-level trust model where trust is earned through demonstrated good behavior and can be instantly revoked through violations.

## Key Types

### TrustLevel (enum)

```typescript
enum TrustLevel {
  BLOCKED = 0,     // Permanently blocked until human intervention
  UNKNOWN = 1,     // New/suspicious agent, maximum scrutiny
  PROVISIONAL = 2, // Some trust established, elevated monitoring
  STANDARD = 3,    // Normal operation, standard monitoring
  TRUSTED = 4,     // High trust, streamlined approval
  VERIFIED = 5,    // Maximum trust, expedited processing
}
```

### ViolationSeverity (enum)

```typescript
enum ViolationSeverity {
  LOW = 'low',         // Warning only, no trust reduction
  MEDIUM = 'medium',   // Drop 1 level
  HIGH = 'high',       // Drop 2 levels
  CRITICAL = 'critical', // Immediate block (Level 0)
}
```

### TrustContext

Returned for authorization decisions:

```typescript
interface TrustContext {
  level: TrustLevel;
  levelName: string;
  lastTransition: string;      // ISO 8601
  transitionReason: TransitionReason;
  violationCount: number;
  cooldownExpires: string | null;
  preApprovalScope: string[];
}
```

## Usage

### Creating a Trust Registry

```typescript
import { TrustRegistry } from '@ha2ha/reference';

// Create with file-based persistence
const registry = await TrustRegistry.load('./trust-store');

// Or create in-memory only
const registry = new TrustRegistry();
```

### Managing Trust Entries

```typescript
// Get or create entry for an agent
const entry = await registry.getOrCreate('peer-agent.example.ha2ha');

// Check trust level
console.log(entry.level);        // TrustLevel.UNKNOWN
console.log(entry.context);      // Full TrustContext

// Elevate trust (requires human approval)
if (entry.canElevate()) {
  entry.elevate('admin@company.ha2ha');
}

// Record a violation
entry.recordViolation(ViolationSeverity.MEDIUM, 'Exceeded rate limit');

// Block an agent
entry.block('Attempted unauthorized access');
```

### Cooldown Management

Trust elevation has cooldown periods to prevent gaming:

```typescript
// Check if agent is in cooldown
if (entry.isInCooldown) {
  console.log(`Cooldown remaining: ${entry.cooldownRemaining}ms`);
}

// Cooldown periods by level:
// BLOCKED: Permanent (requires human unblock)
// UNKNOWN: 24 hours
// PROVISIONAL: 4 hours
// STANDARD: 1 hour
// TRUSTED: 15 minutes
// VERIFIED: 5 minutes
```

### Pre-Approval Scopes

Higher trust levels can have pre-approved action categories:

```typescript
// Add a pre-approval scope
entry.addPreApprovalScope('read');
entry.addPreApprovalScope('list');

// Check if action is pre-approved
if (entry.hasPreApprovalScope('read')) {
  // Skip approval queue
}

// Remove pre-approval
entry.removePreApprovalScope('read');
```

## Trust Transitions

```
           BLOCKED ◄──────────────────────────────────────┐
              │ (human unblock)                           │
              ▼                                           │
           UNKNOWN ◄────────────────────────────────────┐ │
              │ (24h + approval)                        │ │
              ▼                                         │ │
         PROVISIONAL ◄───────────────────────────────┐  │ │
              │ (4h + approval)                      │  │ │
              ▼                                      │  │ │
          STANDARD ◄──────────────────────────────┐  │  │ │
              │ (approval)                        │  │  │ │
              ▼                                   │  │  │ │
          TRUSTED ◄────────────────────────────┐  │  │  │ │
              │ (approval)                     │  │  │  │ │
              ▼                                │  │  │  │ │
          VERIFIED ────────────────────────────┴──┴──┴──┴─┘
                    (violations cause immediate drop)
```

## Spec References

- **§5.1** Trust Levels - Level definitions
- **§5.2** Trust Level Implications - Authorization rules
- **§5.3** Trust Transitions - State machine
- **§5.4** Violation Severity - Reduction rules
- **§5.5** Trust State Wire Format - Serialization
