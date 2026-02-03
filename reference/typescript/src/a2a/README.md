# A2A Module

**Implements §4 A2A Integration and Appendix B HTTP Transport from HA2HA Specification**

This module provides A2A protocol integration, including Agent Cards, extensions, negotiation, and HTTP transport.

## Overview

HA2HA extends the A2A (Agent-to-Agent) protocol with:
- **Agent Card extensions**: HA2HA capabilities and metadata
- **Extension negotiation**: Version and capability compatibility
- **Task metadata**: Human approval context
- **HTTP transport**: Standard endpoints and headers

## Key Types

### Ha2haExtensionParams

```typescript
interface Ha2haExtensionParams {
  version: string;              // HA2HA spec version (required)
  humanOversight: boolean;      // Must be true (required)
  trustLevelRequired: number;   // Minimum trust 1-5 (required)
  auditEndpoint?: string;       // Audit log URL
  escalationContact?: string;   // Human escalation contact
  behavioralMonitoring?: boolean;
  supportedVersions?: string;   // Comma-separated versions
}
```

### Ha2haTaskMetadata

```typescript
interface Ha2haTaskMetadata {
  requestingAgent: string;
  requestingHuman: string;
  trustLevel: number;
  approvalRequired: boolean;
  approvalTimeout: string;    // ISO 8601 duration
  auditId: string;
}
```

## Usage

### Building Agent Cards

```typescript
import { AgentCardBuilder, AgentIdentity } from '@ha2ha/reference';

const identity = await AgentIdentity.loadOrCreate('./keys', 'my-agent.ha2ha', 'My Agent');

const card = await new AgentCardBuilder(identity)
  .setName('My Agent')
  .setVersion('1.0.0')
  .setUrl('https://my-agent.example.com')
  .setDescription('A helpful agent')
  .addCapability('streaming', true)
  .addHa2haExtension({
    trustLevelRequired: 2,
    auditEndpoint: '/.well-known/ha2ha/v1/audit',
    escalationContact: 'ops@example.com',
  })
  .build();

// Card is automatically signed
console.log(card.ha2ha.attestation);
```

### Verifying Agent Cards

```typescript
import { verifyAgentCard, parseAgentCard } from '@ha2ha/reference/a2a';

// Parse from JSON
const card = parseAgentCard(jsonString);

// Verify signature
const verified = await verifyAgentCard(card);
if (!verified) {
  throw new Error('Agent Card signature invalid');
}
```

### Extension Negotiation

```typescript
import { negotiate, negotiateCapabilities } from '@ha2ha/reference/a2a';

// Basic negotiation
const result = negotiate(ourCard, theirCard);

if (!result.compatible) {
  console.error(`Incompatible: ${result.error}`);
  console.log(`Missing: ${result.missingRequired.join(', ')}`);
  console.log(`Warnings: ${result.warnings.join(', ')}`);
} else {
  console.log(`Using version: ${result.effectiveVersion}`);
}

// Full capability negotiation with trust
const fullResult = negotiateCapabilities(ourCard, theirCard, ourTrustLevel);

if (fullResult.compatible) {
  console.log(`Effective trust: ${fullResult.effectiveTrustLevel}`);
  console.log(`Streaming: ${fullResult.streamingSupported}`);
}
```

### Task Metadata

```typescript
import { 
  createTaskMetadata, 
  createTrustContext,
  injectMetadataWithTrust,
  extractHa2haMetadata 
} from '@ha2ha/reference/a2a';

// Create metadata for outgoing task
const metadata = createTaskMetadata({
  requestingAgent: 'my-agent.ha2ha',
  requestingHuman: 'user@example.com',
  trustLevel: 3,
});

// Create trust context
const trustContext = createTrustContext({
  level: 3,
  levelName: 'STANDARD',
  transitionReason: 'human_approval',
  violationCount: 0,
});

// Inject into A2A task
const task = injectMetadataWithTrust(originalTask, metadata, trustContext);

// Extract from incoming task
const extracted = extractHa2haMetadata(incomingTask);
if (extracted) {
  console.log(`From: ${extracted.requestingAgent}`);
  console.log(`Trust: ${extracted.trustLevel}`);
}
```

### HTTP Server

```typescript
import express from 'express';
import { createHa2haRouter, serveAgentCard } from '@ha2ha/reference/a2a';

const app = express();

// Serve Agent Card at well-known location
app.get('/.well-known/agent.json', serveAgentCard(card));

// Mount HA2HA endpoints
const router = createHa2haRouter({
  agentCard: card,
  trustRegistry,
  approvalQueue,
  auditChain,
  callbacks: {
    onApprove: async (req, headers) => {
      // Handle approval request
      return { taskId: req.taskId, status: 'approved', auditId: '...' };
    },
    onReject: async (req, headers) => {
      // Handle rejection
    },
    onEscalate: async (req, headers) => {
      // Handle escalation
    },
  },
});

app.use('/.well-known/ha2ha/v1', router);
```

### HTTP Client

```typescript
import { createHa2haClient, generateRequestHeaders } from '@ha2ha/reference/a2a';

const client = createHa2haClient({
  baseUrl: 'https://peer-agent.example.com',
  agentId: 'my-agent.ha2ha',
  identity, // For signing requests
});

// Approve a task
const result = await client.approve({
  taskId: 'task-123',
  approvedBy: 'admin@example.com',
  approvalScope: 'single',
  payloadHash: hash,
  approverSignature: signature,
});

// Generate headers manually
const headers = generateRequestHeaders('my-agent.ha2ha', identity);
```

## HTTP Endpoints (Appendix B)

| Operation | Method | Path |
|-----------|--------|------|
| Agent Card | GET | `/.well-known/agent.json` |
| Approve | POST | `/.well-known/ha2ha/v1/approve` |
| Reject | POST | `/.well-known/ha2ha/v1/reject` |
| Escalate | POST | `/.well-known/ha2ha/v1/escalate` |
| Trust | POST | `/.well-known/ha2ha/v1/trust` |
| Trust Status | GET | `/.well-known/ha2ha/v1/trust/:agentId` |
| Audit Submit | POST | `/.well-known/ha2ha/v1/audit` |
| Audit Query | GET | `/.well-known/ha2ha/v1/audit` |

## Required Headers

| Header | Description |
|--------|-------------|
| `X-HA2HA-Version` | HA2HA version (e.g., `0.1.0`) |
| `X-HA2HA-Agent-Id` | Requesting agent identifier |
| `X-HA2HA-Request-Id` | Unique request ID |
| `X-HA2HA-Timestamp` | ISO 8601 timestamp |
| `X-HA2HA-Signature` | Request signature (recommended) |

## Error Codes

| Code | Name | HTTP Status |
|------|------|-------------|
| -32001 | APPROVAL_EXPIRED | 410 |
| -32002 | TASK_ALREADY_REJECTED | 409 |
| -32003 | TASK_ALREADY_APPROVED | 409 |
| -32004 | TASK_NOT_FOUND | 404 |
| -32005 | HASH_MISMATCH | 400 |
| -32006 | APPROVER_NOT_QUALIFIED | 403 |
| -32007 | TRUST_LEVEL_INSUFFICIENT | 403 |
| -32008 | WORKFLOW_DEPTH_EXCEEDED | 400 |
| -32009 | RATE_LIMIT_EXCEEDED | 429 |
| -32010 | ATTESTATION_FAILED | 401 |

## Spec References

- **§4.1** HA2HA Extension Declaration
- **§4.2** Extension Parameters
- **§4.3** Agent Card Extensions
- **§4.4** Task Metadata Extensions
- **§4.5** Extension Negotiation Rules
- **§4.6** Version Negotiation
- **Appendix B** HTTP Transport Binding
