# Approval Module

**Implements §6 Message Flows and §7 Operations from HA2HA Specification**

This module provides the human approval workflow, ensuring tasks cannot execute without explicit human authorization.

## Overview

The core invariant of HA2HA:

> **A task MUST NOT transition from SUBMITTED to WORKING without a valid ha2ha/approve.**

This module enforces this invariant through a strict state machine.

## Key Types

### TaskState (enum)

```typescript
enum TaskState {
  SUBMITTED = 'SUBMITTED',   // Awaiting human approval
  WORKING = 'WORKING',       // Approved, executing
  COMPLETED = 'COMPLETED',   // Successfully completed
  FAILED = 'FAILED',         // Execution failed
  CANCELED = 'CANCELED',     // Rejected, timed out, or canceled
}
```

### ApprovalScope (enum)

```typescript
enum ApprovalScope {
  SINGLE = 'single',     // Only this task
  SIMILAR = 'similar',   // This and similar future tasks
  CATEGORY = 'category', // Entire category (future)
}
```

### ApprovalError (enum)

```typescript
enum ApprovalError {
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  TASK_ALREADY_REJECTED = 'TASK_ALREADY_REJECTED',
  TASK_ALREADY_APPROVED = 'TASK_ALREADY_APPROVED',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  HASH_MISMATCH = 'HASH_MISMATCH',
  APPROVER_NOT_QUALIFIED = 'APPROVER_NOT_QUALIFIED',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  TASK_TIMEOUT = 'TASK_TIMEOUT',
}
```

## Usage

### Task Lifecycle Management

```typescript
import { TaskLifecycle, ApprovalScope } from '@ha2ha/reference';

const lifecycle = new TaskLifecycle({
  storePath: './approval-queue',
  autoPersist: true,
  validatorConfig: {
    requireSignature: true,
  },
});

// Load persisted state
await lifecycle.load();
```

### Submitting Tasks

```typescript
const result = await lifecycle.submit({
  sourceAgent: 'requester.example.ha2ha',
  targetAgent: 'executor.example.ha2ha',
  payload: {
    action: 'read_file',
    params: { path: '/data/report.txt' },
  },
  trustLevel: 3,
  description: 'Read quarterly report',
});

if (result.success) {
  console.log(`Task ${result.task.taskId} awaiting approval`);
}
```

### Approving Tasks

```typescript
import { ApprovalRequest, AgentIdentity } from '@ha2ha/reference';

// Create approval request with signature
const approval = await ApprovalRequest.create({
  taskId: task.taskId,
  approverIdentity: identity,
  payloadHash: task.payloadHash,
  scope: ApprovalScope.SINGLE,
  conditions: {
    maxCost: 100,
    allowedActions: ['read'],
  },
});

// Submit approval
const result = await lifecycle.approveWithRequest(approval);
if (result.success) {
  console.log('Task approved, now in WORKING state');
}
```

### Rejecting Tasks

```typescript
const result = await lifecycle.reject(
  task.taskId,
  'admin@company.ha2ha',
  'Request exceeds authorized scope',
  'reduce' // 'none' | 'reduce' | 'block'
);
```

### Executing Tasks

```typescript
const result = await lifecycle.execute(task.taskId, async (t) => {
  // Your task execution logic
  const content = await fs.promises.readFile(t.payload.params.path, 'utf-8');
  return { content };
});

if (result.success) {
  console.log('Task completed:', result.result);
} else {
  console.error('Task failed:', result.error);
}
```

## Hash Commitment (§7.1.1)

To prevent tampering between approval and execution:

```typescript
import { computePayloadHash, verifyPayloadHash } from '@ha2ha/reference';

// Compute hash of task payload
const hash = computePayloadHash(payload);

// Verify approval hash matches task
if (!verifyPayloadHash(payload, approval.payloadHash)) {
  throw new Error('HASH_MISMATCH: Potential tampering detected');
}
```

The hash uses canonical JSON (sorted keys, no whitespace) + SHA-256.

## State Machine

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

## CLI Interface

Basic CLI for testing:

```typescript
import { runCli, formatTask } from '@ha2ha/reference';

// List pending tasks
const result = await runCli(['list']);

// Approve a task
const result = await runCli([
  'approve',
  '--task-id', taskId,
  '--approver', 'admin@company.ha2ha',
]);
```

## Timeouts

- Default task timeout: 1 hour
- SIMILAR scope approval timeout: 24 hours

```typescript
// Custom timeout per task
const task = await lifecycle.submit({
  // ...
  timeoutMs: 30 * 60 * 1000, // 30 minutes
});

// Check for timed-out tasks
const timedOut = await lifecycle.checkTimeouts();
```

## Spec References

- **§6.2** Task Request with Approval - Happy path
- **§6.3** Rejection Flow - Rejection handling
- **§6.4** Task Lifecycle Invariants - State machine rules
- **§7.1** ha2ha/approve - Approval operation
- **§7.1.1** Approval Hash Commitment - Tampering prevention
- **§7.2** ha2ha/reject - Rejection operation
