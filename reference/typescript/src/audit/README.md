# Audit Module

**Implements §8.9 Audit Log Integrity from HA2HA Specification**

This module provides a tamper-evident, hash-chained audit log for all HA2HA events.

## Overview

Every significant event is logged to an append-only audit chain where each entry includes a hash of the previous entry. This creates a tamper-evident record that can be verified for integrity.

## Key Types

### AuditEventType (enum)

```typescript
enum AuditEventType {
  // Task lifecycle
  TASK_SUBMITTED = 'task.submitted',
  TASK_APPROVED = 'task.approved',
  TASK_REJECTED = 'task.rejected',
  TASK_EXECUTED = 'task.executed',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_TIMEOUT = 'task.timeout',
  TASK_CANCELLED = 'task.cancelled',
  
  // Trust events
  TRUST_ESTABLISHED = 'trust.established',
  TRUST_ELEVATED = 'trust.elevated',
  TRUST_REDUCED = 'trust.reduced',
  TRUST_REVOKED = 'trust.revoked',
  TRUST_VIOLATION = 'trust.violation',
  
  // Federation events
  FEDERATION_REQUEST = 'federation.request',
  FEDERATION_ACCEPTED = 'federation.accepted',
  FEDERATION_REJECTED = 'federation.rejected',
  
  // Security events
  SECURITY_ALERT = 'security.alert',
  SECURITY_CIRCUIT_OPEN = 'security.circuit_open',
  SECURITY_CIRCUIT_CLOSE = 'security.circuit_close',
  
  // Chain events
  CHAIN_GENESIS = 'chain.genesis',
  CHAIN_VERIFIED = 'chain.verified',
  CHAIN_TAMPER_DETECTED = 'chain.tamper_detected',
}
```

### AuditEntry

```typescript
interface AuditEntry {
  timestamp: string;           // ISO 8601
  eventType: AuditEventType;
  entryId: string;
  taskId?: string;
  sourceAgentId: string;
  targetAgentId: string;
  humanId?: string;
  trustLevel: number;
  outcome: 'success' | 'rejected' | 'error' | 'pending';
  details: Record<string, unknown>;
  prevHash: string | null;     // Hash of previous entry
  hash: string;                // Hash of this entry
}
```

## Usage

### Creating an Audit Chain

```typescript
import { AuditChain, AuditEventType, createAuditChain } from '@ha2ha/reference';

// Create or load audit chain
const chain = await AuditChain.create({
  storePath: './audit.ndjson',
  agentId: 'my-agent.example.ha2ha',
  verifyOnLoad: true,  // Verify integrity on load
});

// Or use factory function
const chain = await createAuditChain('./audit.ndjson', 'my-agent.ha2ha');
```

### Appending Entries

```typescript
await chain.append({
  eventType: AuditEventType.TASK_APPROVED,
  sourceAgentId: 'requester.example.ha2ha',
  targetAgentId: 'executor.example.ha2ha',
  taskId: 'task-123',
  humanId: 'admin@company.ha2ha',
  trustLevel: 3,
  outcome: 'success',
  details: {
    approvalScope: 'single',
    payloadHash: 'abc123...',
  },
});
```

### Verifying Chain Integrity

```typescript
import { verifyChain, detectTamperPoint } from '@ha2ha/reference';

const result = verifyChain(chain.entries);

if (!result.valid) {
  console.error(`Chain corrupted at entry ${result.brokenAt}`);
  console.error(`Error: ${result.errorType} - ${result.errorMessage}`);
  
  // Get evidence around the break point
  const tamperPoint = detectTamperPoint(chain.entries);
  console.log('Evidence:', tamperPoint.evidence);
}
```

### Querying the Audit Log

```typescript
import { 
  queryAuditLog, 
  getTaskHistory, 
  getSecurityEvents,
  createQueryBuilder 
} from '@ha2ha/reference';

// Simple query
const result = queryAuditLog(chain.entries, {
  eventTypes: [AuditEventType.TASK_APPROVED, AuditEventType.TASK_REJECTED],
  startTime: '2026-02-01T00:00:00Z',
  endTime: '2026-02-02T00:00:00Z',
  limit: 100,
});

// Get history for a specific task
const taskHistory = getTaskHistory(chain.entries, 'task-123');

// Get security-related events
const securityEvents = getSecurityEvents(chain.entries);

// Fluent query builder
const results = createQueryBuilder(chain.entries)
  .byEventType(AuditEventType.TRUST_VIOLATION)
  .byAgent('suspicious-agent.ha2ha')
  .inRange('2026-02-01', '2026-02-03')
  .limit(50)
  .execute();
```

### Statistics

```typescript
import { 
  countByEventType, 
  countByOutcome, 
  groupByDate,
  getChainStats 
} from '@ha2ha/reference';

// Counts by event type
const eventCounts = countByEventType(chain.entries);
// { 'task.approved': 150, 'task.rejected': 12, ... }

// Counts by outcome
const outcomeCounts = countByOutcome(chain.entries);
// { success: 200, rejected: 30, error: 5, pending: 0 }

// Group by date
const dailyCounts = groupByDate(chain.entries);
// { '2026-02-01': 100, '2026-02-02': 135 }

// Overall stats
const stats = getChainStats(chain);
// { entries: 1000, firstEntry: '...', lastEntry: '...' }
```

## Hash Chaining

Each entry's hash is computed as:

```typescript
entry[n].prevHash = entry[n-1].hash
entry[n].hash = SHA-256(canonicalJSON(entry[n] without hash field))
```

This creates a chain where any modification is detectable:

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Genesis │───►│ Entry 1 │───►│ Entry 2 │───►│ Entry 3 │
│ prevH:∅ │    │ prevH:0 │    │ prevH:1 │    │ prevH:2 │
│ hash:0  │    │ hash:1  │    │ hash:2  │    │ hash:3  │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
```

## Tamper Detection

The verifier catches:

- **hash_mismatch**: Entry's hash doesn't match computed hash
- **prev_hash_mismatch**: Entry's prevHash doesn't match previous entry's hash
- **missing_entry**: Gap in the chain
- **invalid_format**: Entry fails schema validation

```typescript
import { ChainCorruptedError } from '@ha2ha/reference';

try {
  await chain.append(entry);
} catch (e) {
  if (e instanceof ChainCorruptedError) {
    // Chain integrity compromised
    await notifySecurityTeam(e.verificationResult);
  }
}
```

## Spec References

- **§8.4** Audit Requirements - Minimum audit fields
- **§8.9** Audit Log Integrity - Overview
- **§8.9.1** Hash Chaining - Chain structure
- **§8.9.2** Integrity Verification - Verification process
- **§8.9.3** External Audit Collection - Distribution
