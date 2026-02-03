# Gap 7: A2A Protocol Integration — Full Plan

**Gap:** No A2A protocol support (internal protocol only)
**Target:** Implement §4 A2A Integration from HA2HA spec
**Wave:** 4 (Final, depends on all previous gaps)

---

## Phase 1: Context

**Current State:**
- OpenClaw uses internal RPC for agent communication
- No A2A Agent Cards
- No extension declaration
- No external federation capability

**Constraints:**
- Must be compatible with A2A specification
- Must declare HA2HA extension per spec
- Must work alongside existing internal protocol

**Dependencies:**
- All previous gaps (1-6)

**Trigger:** Enable federation with external A2A-compatible agents

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `AgentCard` generator | Create A2A-compliant Agent Cards |
| HA2HA extension declaration | Per §4.1-4.4 |
| Extension negotiation | Version/capability handshake |
| Task metadata extension | HA2HA fields in A2A tasks |
| Agent Card endpoint | `/.well-known/agent.json` |

### NOT Building

- Full A2A transport layer
- Discovery protocol
- Multi-transport support (HTTP only)

### Success Criteria

1. Agent Card includes HA2HA extension
2. Agent Card is signed (from Gap 2)
3. Extension negotiation works
4. Tasks include HA2HA metadata
5. Agent Card served at well-known URL

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | A2A types | `src/a2a/types.ts` |
| `agent-card.ts` | Card generation | `src/a2a/agent-card.ts` |
| `extension.ts` | HA2HA extension | `src/a2a/extension.ts` |
| `negotiation.ts` | Version negotiation | `src/a2a/negotiation.ts` |
| `task-metadata.ts` | Task metadata | `src/a2a/task-metadata.ts` |
| `server.ts` | HTTP endpoints | `src/a2a/server.ts` |
| `index.ts` | Exports | `src/a2a/index.ts` |

### Agent Card Structure

```json
{
  "name": "Luca",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "extensions": [
      {
        "uri": "https://ha2haproject.org/spec/v1",
        "description": "HA2HA human oversight protocol",
        "required": true,
        "params": {
          "version": "0.1.0",
          "humanOversight": true,
          "trustLevelRequired": 1,
          "auditEndpoint": "/.well-known/ha2ha/v1/audit",
          "escalationContact": "ricardo@example.com"
        }
      }
    ]
  },
  "ha2ha": {
    "publicKey": "base64...",
    "attestation": {
      "protected": "...",
      "signature": "..."
    }
  }
}
```

---

## Phase 4: Implementation Spec

### agent-card.ts

```typescript
export class AgentCardBuilder {
  constructor(identity: AgentIdentity) { ... }
  
  setName(name: string): this { ... }
  setVersion(version: string): this { ... }
  addCapability(cap: string, value: unknown): this { ... }
  
  addHa2haExtension(params: Ha2haExtensionParams): this { ... }
  
  async build(): Promise<SignedAgentCard> { ... }
}
```

### negotiation.ts

```typescript
export class ExtensionNegotiator {
  static negotiate(
    ourCard: SignedAgentCard,
    theirCard: SignedAgentCard
  ): NegotiationResult { ... }
  
  static checkVersionCompatibility(
    ourVersion: string,
    theirVersion: string
  ): boolean { ... }
}

export interface NegotiationResult {
  compatible: boolean;
  effectiveVersion: string;
  missingRequired: string[];
  warnings: string[];
}
```

### server.ts

```typescript
export function createHa2haServer(
  agentCard: SignedAgentCard,
  approvalQueue: ApprovalQueue,
  auditChain: AuditChain
): Express { ... }

// Endpoints:
// GET  /.well-known/agent.json
// POST /.well-known/ha2ha/v1/approve
// POST /.well-known/ha2ha/v1/reject
// POST /.well-known/ha2ha/v1/escalate
// POST /.well-known/ha2ha/v1/audit
// GET  /.well-known/ha2ha/v1/trust/:agentId
```

---

## Phase 5: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `agent-card.test.ts` | Card generation, signing |
| `extension.test.ts` | HA2HA params validation |
| `negotiation.test.ts` | Version compatibility |
| `task-metadata.test.ts` | Metadata injection |

### Integration Tests

| Test | Description |
|------|-------------|
| `server.test.ts` | HTTP endpoint tests |
| `federation-flow.test.ts` | Full federation handshake |

### Acceptance Criteria

- [ ] Agent Card served at `/.well-known/agent.json`
- [ ] Card includes valid HA2HA extension
- [ ] Card is signed and verifiable
- [ ] HTTP endpoints respond per Appendix B

---

## Delegation Brief

**Agent:** server (Luca-Server)
**Task:** Implement Gap 7: A2A Protocol Integration

**WAIT FOR:** All previous gaps (1-6) to complete!

**Inputs:**
- This plan
- Spec §4, Appendix B from SPECIFICATION.md
- All completed modules

**Outputs:**
- `src/a2a/` directory
- Unit tests
- HTTP server integration
- Updated exports

**Dependencies:**
- `express` for HTTP server

**Success:** Agent Card endpoint works, federation handshake succeeds.
