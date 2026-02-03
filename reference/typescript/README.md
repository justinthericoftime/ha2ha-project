# @ha2ha/reference

**TypeScript Reference Implementation of the HA2HA Protocol**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org)

HA2HA (Human/Agent to Human/Agent) is an extension to the A2A protocol that adds a mandatory human oversight layer for AI agent federation. This package provides a complete reference implementation for building HA2HA-compliant systems.

## Why HA2HA?

When AI agents communicate across organizational boundaries, human oversight is essential:

- **Compromised Agents**: Systems may be compromised by malicious actors
- **Misconfigured Agents**: Bugs or misconfigurations can cause harmful behavior  
- **Malicious Operators**: The human operating an agent may have malicious intent
- **Scope Creep**: Agents may take actions beyond their intended scope
- **Irreversible Actions**: Some actions cannot be undone

HA2HA ensures that **every cross-boundary action requires human approval** at both endpoints.

## Installation

```bash
npm install @ha2ha/reference
```

## Quick Start

```typescript
import {
  AgentIdentity,
  TrustRegistry,
  TaskLifecycle,
  ApprovalRequest,
  ApprovalScope,
  AgentCardBuilder,
  negotiate,
} from '@ha2ha/reference';

// 1. Create agent identity (Ed25519 keypair)
const identity = await AgentIdentity.loadOrCreate(
  './keys',
  'my-agent.example.ha2ha',
  'My Agent'
);

// 2. Initialize trust registry
const trustRegistry = await TrustRegistry.load('./trust-store');

// 3. Build signed Agent Card
const card = await new AgentCardBuilder(identity)
  .setName('My Agent')
  .setVersion('1.0.0')
  .setUrl('https://my-agent.example.com')
  .addHa2haExtension({
    trustLevelRequired: 2,
    auditEndpoint: '/.well-known/ha2ha/v1/audit',
  })
  .build();

// 4. Negotiate with peer
const peerCard = await fetchPeerAgentCard();
const result = negotiate(card, peerCard);

if (!result.compatible) {
  throw new Error(`Incompatible: ${result.error}`);
}

// 5. Process incoming task with human approval
const lifecycle = new TaskLifecycle({
  storePath: './approval-queue',
  validatorConfig: { requireSignature: true },
});

// Submit task (enters SUBMITTED state)
const task = await lifecycle.submit({
  sourceAgent: 'peer-agent.example.ha2ha',
  targetAgent: identity.agentId,
  payload: { action: 'read_file', path: '/data/report.txt' },
  trustLevel: 3,
});

// Human reviews and approves
const approval = await ApprovalRequest.create({
  taskId: task.task!.taskId,
  approverIdentity: identity,
  payloadHash: task.task!.payloadHash,
  scope: ApprovalScope.SINGLE,
});

await lifecycle.approveWithRequest(approval);

// Now task is in WORKING state - execute it
await lifecycle.execute(task.task!.taskId, async (t) => {
  return fs.readFileSync(t.payload.path, 'utf-8');
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HA2HA OVERSIGHT LAYER                     │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Trust    │ │ Approval │ │ Audit    │ │ Circuit        │  │
│  │ Registry │ │ Workflow │ │ Chain    │ │ Breaker        │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│       ↓            ↓            ↓               ↓           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Profile  │ │ Identity │ │ A2A      │ │ Onboarding     │  │
│  │ Enforcer │ │ (Ed25519)│ │ Protocol │ │ Profiles       │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    A2A APPLICATION LAYER                     │
│                                                              │
│  • Agent Cards with HA2HA extensions                         │
│  • Task lifecycle (SendMessage, GetTask, etc.)               │
│  • Extension negotiation                                     │
└─────────────────────────────────────────────────────────────┘
```

## Modules

| Module | Description | Spec Section |
|--------|-------------|--------------|
| [trust](./src/trust/README.md) | Trust levels and transitions | §5 |
| [identity](./src/identity/README.md) | Ed25519 cryptographic identity | §8.6 |
| [approval](./src/approval/README.md) | Human approval workflow | §6-7 |
| [profile](./src/profile/README.md) | Approver profile enforcement | §10 |
| [circuit-breaker](./src/circuit-breaker/README.md) | Cascading failure prevention | §8.8 |
| [audit](./src/audit/README.md) | Tamper-evident audit logging | §8.9 |
| [a2a](./src/a2a/README.md) | A2A protocol integration | §4 |
| [onboarding](./src/onboarding/README.md) | Profile types and loading | §10 |

## Core Concepts

### Trust Levels

HA2HA defines 6 trust levels (0-5):

| Level | Name | Cooldown | Approval Requirements |
|-------|------|----------|----------------------|
| 0 | BLOCKED | Permanent | No communication allowed |
| 1 | UNKNOWN | 24 hours | Every request requires full review |
| 2 | PROVISIONAL | 4 hours | Every request requires approval |
| 3 | STANDARD | 1 hour | Pre-approval rules possible |
| 4 | TRUSTED | 15 minutes | Expedited approval |
| 5 | VERIFIED | 5 minutes | Maximum pre-approval scope |

### Approval Workflow

The core invariant: **A task MUST NOT transition from SUBMITTED to WORKING without a valid ha2ha/approve.**

```
SUBMITTED → (human approval) → WORKING → COMPLETED
         ↘ (rejection/timeout) → CANCELED
                        WORKING → FAILED
```

### Hash Commitment

Every approval includes a SHA-256 hash of the task payload. This prevents tampering between when a human reviews a request and when it executes:

```typescript
const hash = computePayloadHash(task.payload);
// Hash must match in approval request
```

### Circuit Breaker

Cascading failures are prevented with per-agent circuit breakers:

- **CLOSED**: Normal operation
- **OPEN**: All requests blocked (after 3 failures or critical violation)
- **HALF_OPEN**: Testing recovery (single request allowed)

### Audit Chain

All events are logged to a hash-chained audit log for tamper detection:

```typescript
const chain = await AuditChain.create({
  storePath: './audit.log',
  agentId: 'my-agent.ha2ha',
});

await chain.append({
  eventType: AuditEventType.TASK_APPROVED,
  sourceAgentId: 'requester.ha2ha',
  targetAgentId: 'executor.ha2ha',
  taskId: 'task-123',
  trustLevel: 3,
  outcome: 'success',
});
```

## HTTP Transport

HA2HA defines a standard HTTP binding (Appendix B):

```typescript
import express from 'express';
import { createHa2haRouter } from '@ha2ha/reference/a2a';

const app = express();
const router = createHa2haRouter({
  agentCard: card,
  trustRegistry,
  approvalQueue,
  auditChain,
  callbacks: {
    onApprove: async (req) => { /* handle approval */ },
    onReject: async (req) => { /* handle rejection */ },
  },
});

app.use('/.well-known/ha2ha/v1', router);
```

## Testing

```bash
npm test          # Run all tests
npm run build     # Build TypeScript
```

## Specification

This implementation follows the [HA2HA Protocol Specification v0.1.0](https://ha2haproject.org/spec).

Key spec sections implemented:
- §4 A2A Integration
- §5 Trust Model
- §6 Message Flows
- §7 Operations
- §8.6 Cryptographic Attestation
- §8.8 Cascading Failure Prevention
- §8.9 Audit Log Integrity
- §10 Human Onboarding
- Appendix B HTTP Transport Binding

## License

Apache 2.0 - See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

**Copyright 2026 The HA2HA Project Authors.**
