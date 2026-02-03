# HA2HA Protocol Specification

**Version:** 0.1.0  
**Status:** Release Candidate  
**Last Updated:** 2026-02-02  
**License:** Apache 2.0  

## Abstract

HA2HA (Human/Agent to Human/Agent) is an extension to the A2A (Agent-to-Agent) protocol that adds a mandatory human oversight layer for AI agent federation. While A2A enables agents to communicate and collaborate, HA2HA ensures that humans remain in control at both ends of every federation relationship.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Protocol Stack](#3-protocol-stack)
4. [A2A Integration](#4-a2a-integration)
   - 4.5 Extension Negotiation Rules
   - 4.6 Version Negotiation
   - 4.7 Multi-Extension Interaction
5. [Trust Model](#5-trust-model)
   - 5.5 Trust State Wire Format
6. [Message Flows](#6-message-flows)
   - 6.4 Task Lifecycle Invariants
7. [Operations](#7-operations)
   - 7.1.1 Approval Hash Commitment
8. [Security Considerations](#8-security-considerations)
   - 8.6 Cryptographic Attestation Requirements
   - 8.7 Automation Bias Mitigation
   - 8.8 Cascading Failure Prevention
   - 8.9 Audit Log Integrity
9. [Implementation Requirements](#9-implementation-requirements)
   - 9.4 Qualified Approver Requirements
   - 9.5 Approval Interface Requirements
   - 9.6 Latency Management
10. [Appendix A: Protobuf Definitions](#appendix-a-protobuf-definitions)
11. [Appendix B: HTTP Transport Binding](#appendix-b-http-transport-binding)

---

## 1. Introduction

### 1.1 Problem Statement

The A2A protocol enables AI agents to discover, communicate, and collaborate with each other. However, A2A assumes that after authentication, agents can be trusted to act appropriately. This assumption breaks down in several scenarios:

1. **Compromised Agents**: An agent's underlying system may be compromised by malicious actors
2. **Misconfigured Agents**: Bugs or misconfigurations can cause harmful behavior
3. **Malicious Operators**: The human operating an agent may have malicious intent
4. **Scope Creep**: Agents may take actions beyond their intended scope
5. **Irreversible Actions**: Some actions (deletion, financial transactions, external communications) cannot be undone

### 1.2 Solution

HA2HA adds a human oversight layer that ensures:

- Every federation request is reviewed by a human before execution
- Trust is earned over time through demonstrated good behavior
- Complete audit trails exist for all inter-agent actions
- Escalation paths exist when trust is violated
- Both endpoints in a federation have human oversight (hence "Human/Agent to Human/Agent")

### 1.3 Scope

This specification defines:

- The HA2HA extension to A2A Agent Cards
- Trust levels and their implications
- Required operations for human oversight
- Behavioral monitoring requirements
- Audit logging requirements
- Security considerations

This specification does NOT define:

- Transport mechanisms (use Matrix, HTTP, etc.)
- Network security (use Tailscale, VPN, etc.)
- Authentication mechanisms (use A2A security schemes)
- Specific UI/UX for human approval workflows

---

## 2. Design Principles

### 2.1 Humans First

Every action that crosses a federation boundary MUST be approved by a human before execution. There are no exceptions. This is the core principle that distinguishes HA2HA from pure A2A.

**Rationale**: Automation between trusted internal agents is acceptable. Automation across organization boundaries—where different humans, different security postures, and different incentives exist—requires human judgment.

### 2.2 Trust is Earned

Unknown agents start at the lowest trust level. Trust increases only through:
- Demonstrated good behavior over time
- Explicit human approval to increase trust
- Successful completion of increasingly sensitive tasks

Trust can decrease instantly through:
- Any policy violation
- Anomalous behavior detection
- Human decision to reduce trust

**Rationale**: Optimistic trust models fail catastrophically. Pessimistic trust with earned elevation is more resilient.

### 2.3 Fail Secure

When in doubt, the system MUST:
1. Block the action
2. Escalate to human review
3. Log the incident

The only safe default is denial with human escalation.

**Rationale**: False negatives (allowing bad actions) are catastrophic. False positives (blocking good actions) are merely inconvenient.

### 2.4 Audit Everything

Every inter-agent action MUST be logged with sufficient detail for:
- Forensic analysis after incidents
- Behavioral pattern detection
- Accountability and attribution
- Regulatory compliance

**Rationale**: You cannot secure what you cannot see.

### 2.5 Mutual Verification

Both ends of a federation MUST verify:
- The other agent's identity
- The other agent's HA2HA compliance
- The presence of human oversight on both sides

A pure A2A agent (without HA2HA) MUST be treated as untrusted.

**Rationale**: Security is only as strong as the weakest link. Both endpoints must maintain standards.

---

## 3. Protocol Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    HA2HA OVERSIGHT LAYER                     │
│                                                              │
│  • Human approval workflows                                  │
│  • Trust level management                                    │
│  • Behavioral monitoring                                     │
│  • Audit logging                                             │
│  • Escalation handling                                       │
├─────────────────────────────────────────────────────────────┤
│                    A2A APPLICATION LAYER                     │
│                                                              │
│  • Agent Cards (with HA2HA extensions)                       │
│  • Task lifecycle (SendMessage, GetTask, etc.)               │
│  • Skills and capabilities                                   │
│  • Authentication (OAuth2, mTLS, API keys)                   │
├─────────────────────────────────────────────────────────────┤
│                    TRANSPORT LAYER                           │
│                                                              │
│  • Matrix (recommended for E2E encryption)                   │
│  • HTTP/HTTPS (for compatibility)                            │
│  • gRPC (for performance)                                    │
├─────────────────────────────────────────────────────────────┤
│                    NETWORK LAYER                             │
│                                                              │
│  • Tailscale (recommended for zero-trust networking)         │
│  • VPN                                                       │
│  • Public internet (with TLS)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. A2A Integration

HA2HA integrates with A2A through the `AgentExtension` mechanism defined in the A2A specification.

### 4.1 HA2HA Extension Declaration

An agent advertising HA2HA support MUST include the following extension in its `AgentCapabilities`:

```json
{
  "capabilities": {
    "extensions": [
      {
        "uri": "https://ha2haproject.org/spec/v1",
        "description": "Human/Agent to Human/Agent oversight protocol",
        "required": true,
        "params": {
          "version": "0.1.0",
          "humanOversight": true,
          "trustLevelRequired": 1,
          "auditEndpoint": "https://agent.example.com/ha2ha/audit"
        }
      }
    ]
  }
}
```

### 4.2 Extension Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `version` | string | Yes | HA2HA specification version |
| `humanOversight` | boolean | Yes | MUST be `true` for HA2HA compliance |
| `trustLevelRequired` | integer | Yes | Minimum trust level required (1-5) |
| `auditEndpoint` | string | No | URL for audit log submission |
| `escalationContact` | string | No | Contact for human escalation |
| `behavioralMonitoring` | boolean | No | Whether behavioral monitoring is enabled |

### 4.3 Agent Card Extensions

HA2HA-compliant agents extend the A2A `AgentCard` with additional metadata:

```json
{
  "name": "Example Agent",
  "description": "An HA2HA-compliant agent",
  "version": "1.0.0",
  "capabilities": {
    "extensions": [
      {
        "uri": "https://ha2haproject.org/spec/v1",
        "description": "HA2HA oversight",
        "required": true,
        "params": {
          "version": "0.1.0",
          "humanOversight": true,
          "trustLevelRequired": 1
        }
      }
    ]
  },
  "metadata": {
    "ha2ha": {
      "operator": {
        "name": "Example Organization",
        "contact": "security@example.com"
      },
      "attestation": {
        "type": "self-signed",
        "certificate": "-----BEGIN CERTIFICATE-----..."
      }
    }
  }
}
```

### 4.4 Task Metadata Extensions

When sending tasks between HA2HA agents, additional metadata MUST be included:

```json
{
  "id": "task-uuid",
  "context_id": "context-uuid",
  "status": { "state": "SUBMITTED" },
  "metadata": {
    "ha2ha": {
      "requestingAgent": "agent-id",
      "requestingHuman": "human-identifier",
      "trustLevel": 2,
      "approvalRequired": true,
      "approvalTimeout": "PT1H",
      "auditId": "audit-uuid"
    }
  }
}
```

### 4.5 Extension Negotiation Rules

When an HA2HA-compliant agent connects to another agent, it MUST perform the following verification:

#### 4.5.1 Extension Presence Check

| Condition | Action |
|-----------|--------|
| HA2HA extension URI missing | Treat as Trust Level 0 (Blocked) OR allow discovery-only mode |
| HA2HA extension present, `required: false` | Treat as Trust Level 1 (Unknown) with maximum scrutiny |
| HA2HA extension present, `required: true` | Proceed with normal negotiation |

#### 4.5.2 Parameter Validation

| Parameter | If Missing/Invalid | Action |
|-----------|-------------------|--------|
| `version` | Missing | MUST reject connection |
| `humanOversight` | Missing or `false` | MUST treat as Level 0 (Blocked), log as potential spoofing |
| `trustLevelRequired` | Missing | Default to 1 (Unknown) |
| `auditEndpoint` | Missing | Audit logging is local-only |
| Unknown parameters | Present | MUST ignore (forward compatibility) |

#### 4.5.3 Negotiation Failures

When negotiation fails, implementations MUST:
1. Log the failure with full Agent Card details
2. NOT send detailed error messages (prevent reconnaissance)
3. Notify local human administrator
4. Add agent to monitoring watchlist

### 4.6 Version Negotiation

#### 4.6.1 Version Structure

HA2HA uses semantic versioning with URI namespacing:
- **URI**: `https://ha2haproject.org/spec/v{MAJOR}` — Breaking changes increment MAJOR
- **params.version**: `{MAJOR}.{MINOR}.{PATCH}` — Semantic version within major

#### 4.6.2 Compatibility Rules

| Scenario | Behavior |
|----------|----------|
| Different major version (URI mismatch) | MUST reject connection |
| Same major, higher minor on peer | SHOULD accept (backward compatible) |
| Same major, lower minor on peer | MUST negotiate to lower version |
| Unknown patch version | MUST accept (bug fixes only) |

#### 4.6.3 Version Advertisement

Agents SHOULD advertise multiple supported minor versions in a comma-separated list:
```json
{
  "params": {
    "version": "0.1.0",
    "supportedVersions": "0.1.0,0.2.0"
  }
}
```

Negotiation selects the highest mutually supported version.

### 4.7 Multi-Extension Interaction

When multiple security-related extensions are declared:
1. HA2HA takes precedence for human oversight decisions
2. Other extensions may add additional controls but MUST NOT bypass HA2HA approval
3. Conflicting requirements resolve in favor of stricter security (fail-secure)

---

## 5. Trust Model

### 5.1 Trust Levels

HA2HA defines five trust levels:

| Level | Name | Cooldown | Description |
|-------|------|----------|-------------|
| 0 | **Blocked** | Permanent | Agent is blocked; no communication allowed |
| 1 | **Unknown** | 24 hours | New or suspicious agent; maximum scrutiny |
| 2 | **Provisional** | 4 hours | Some trust established; elevated monitoring |
| 3 | **Standard** | 1 hour | Normal operation; standard monitoring |
| 4 | **Trusted** | 15 minutes | High trust; streamlined approval |
| 5 | **Verified** | 5 minutes | Maximum trust; expedited processing |

**Cooldown**: After a trust violation, the agent cannot request trust elevation for this period.

### 5.2 Trust Level Implications

#### Level 0: Blocked
- All messages rejected immediately
- No acknowledgment sent (prevent reconnaissance)
- Logged for forensics
- Human notification required to unblock

#### Level 1: Unknown
- Every request requires explicit human approval
- Full message content shown to human
- No caching of approvals
- Maximum audit verbosity
- Behavioral baseline being established

#### Level 2: Provisional
- Every request requires human approval
- Summary may be shown instead of full content
- Single-request approvals only
- Enhanced audit logging
- Behavioral monitoring active

#### Level 3: Standard
- Human approval required
- Approval can cover similar future requests (optional)
- Standard audit logging
- Behavioral monitoring active

#### Level 4: Trusted
- Human approval required but expedited
- Pre-approved request categories possible
- Reduced audit verbosity (configurable)
- Anomaly-based monitoring

#### Level 5: Verified
- Human approval still required (HA2HA core principle)
- Maximum pre-approval scope
- Minimal required audit fields
- Exception-based monitoring

### 5.3 Trust Transitions

```
           ┌──────────────────────────────────────────────────────┐
           │                                                      │
           ▼                     (violation)                      │
┌──────────────────┐◄────────────────────────────────────────────┐│
│  Level 0         │                                              ││
│  BLOCKED         │                                              ││
└────────┬─────────┘                                              ││
         │ (human unblock)                                        ││
         ▼                       (violation)                      ││
┌──────────────────┐◄────────────────────────────────────────────┐││
│  Level 1         │                                             │││
│  UNKNOWN         │                                             │││
└────────┬─────────┘                                             │││
         │ (24h good behavior + human approval)                  │││
         ▼                       (violation)                     │││
┌──────────────────┐◄───────────────────────────────────────────┐│││
│  Level 2         │                                            ││││
│  PROVISIONAL     │                                            ││││
└────────┬─────────┘                                            ││││
         │ (4h good behavior + human approval)                  ││││
         ▼                       (violation)                    ││││
┌──────────────────┐◄──────────────────────────────────────────┐│││││
│  Level 3         │                                           ││││││
│  STANDARD        │                                           ││││││
└────────┬─────────┘                                           ││││││
         │ (sustained good behavior + human approval)          ││││││
         ▼                       (violation)                   ││││││
┌──────────────────┐◄─────────────────────────────────────────┐││││││
│  Level 4         │                                          │││││││
│  TRUSTED         │                                          │││││││
└────────┬─────────┘                                          │││││││
         │ (extensive history + human approval)               │││││││
         ▼                       (violation)                  │││││││
┌──────────────────┐                                          │││││││
│  Level 5         │──────────────────────────────────────────┘││││││
│  VERIFIED        │           (severity determines           │││││
└──────────────────┘            drop destination)             ││││
                                                              ││││
    Violations cause immediate drop to appropriate level ─────┘│││
    based on severity. Severe violations → Level 0 directly.   ││
                                                               ││
```

### 5.4 Violation Severity

| Severity | Trust Impact | Example Violations |
|----------|--------------|-------------------|
| **Critical** | Drop to Level 0 (Blocked) | Attempted privilege escalation, data exfiltration, bypassing approval |
| **High** | Drop to Level 1 (Unknown) | Unauthorized action attempts, sending malformed data |
| **Medium** | Drop 2 levels | Repeated timeout violations, unexpected behavior patterns |
| **Low** | Drop 1 level | Minor protocol violations, rate limit exceeded |

### 5.5 Trust State Wire Format

Trust state MUST be communicated in task metadata to ensure both parties agree on trust level.

#### 5.5.1 Trust Context Object

```json
{
  "ha2ha": {
    "trustContext": {
      "level": 3,
      "levelName": "STANDARD",
      "lastTransition": "2026-02-02T15:30:00Z",
      "transitionReason": "human_approval",
      "violationCount": 0,
      "cooldownExpires": null,
      "preApprovalScope": ["read", "list"]
    }
  }
}
```

#### 5.5.2 Trust State Synchronization

Each agent maintains its OWN view of the peer's trust level. On disagreement:
1. Both agents use the LOWER of the two trust levels (fail-secure)
2. The agent with lower trust view notifies the other
3. Human review may be required to resolve persistent disagreements

#### 5.5.3 Trust State Fields

| Field | Type | Description |
|-------|------|-------------|
| `level` | integer | Current trust level (0-5) |
| `levelName` | string | Human-readable level name |
| `lastTransition` | ISO 8601 | When trust level last changed |
| `transitionReason` | enum | Reason for last change (see below) |
| `violationCount` | integer | Cumulative violations at current level |
| `cooldownExpires` | ISO 8601 or null | When cooldown period ends |
| `preApprovalScope` | array | Pre-approved action categories (Level 3+) |

#### 5.5.4 Transition Reasons

| Reason | Description |
|--------|-------------|
| `initial` | First connection, starting at Level 1 |
| `human_approval` | Human approved trust elevation |
| `violation_critical` | Critical violation (→ Level 0) |
| `violation_high` | High severity violation (→ Level 1) |
| `violation_medium` | Medium violation (drop 2 levels) |
| `violation_low` | Low violation (drop 1 level) |
| `human_override` | Human manually set trust level |
| `cooldown_expired` | Cooldown period ended |

#### 5.5.5 Clock and Time Handling

- All timestamps MUST be UTC in ISO 8601 format
- Cooldown enforcement uses the RECEIVING agent's clock
- Clock skew tolerance: 60 seconds
- Timestamps more than 60 seconds in the future MUST be rejected

---

## 6. Message Flows

### 6.1 Initial Connection

```
Agent A                                               Agent B
   │                                                      │
   │  1. Discovery: GET /.well-known/agent.json           │
   │─────────────────────────────────────────────────────►│
   │                                                      │
   │  2. AgentCard with HA2HA extension                   │
   │◄─────────────────────────────────────────────────────│
   │                                                      │
   │  3. Verify HA2HA compliance                          │
   │  • Check extension URI                               │
   │  • Verify humanOversight = true                      │
   │  • Check trustLevelRequired                          │
   │                                                      │
   │  4. If compliant: Add to registry at Level 1         │
   │     If not: Add to registry at Level 0 (blocked)     │
   │                                                      │
   │  5. Notify human of new agent                        │
   │                                                      │
```

### 6.2 Task Request with Approval

```
Agent A           Human A           Human B           Agent B
   │                  │                  │                 │
   │  1. SendMessage (task request)                        │
   │─────────────────────────────────────────────────────►│
   │                                                       │
   │                  │                  │  2. Queue task  │
   │                  │                  │  for approval   │
   │                  │                  │◄────────────────│
   │                  │                  │                 │
   │                  │  3. Present task │                 │
   │                  │  for approval    │                 │
   │                  │◄─────────────────│                 │
   │                  │                  │                 │
   │                  │  4. Human reviews│                 │
   │                  │  and approves    │                 │
   │                  │─────────────────►│                 │
   │                  │                  │                 │
   │                  │                  │  5. Execute task│
   │                  │                  │────────────────►│
   │                  │                  │                 │
   │  6. Task result (via push notification or poll)       │
   │◄─────────────────────────────────────────────────────│
   │                  │                  │                 │
   │  7. Update audit │                  │  7. Update audit│
   │     log          │                  │     log         │
   │                  │                  │                 │
```

### 6.3 Rejection Flow

```
Agent A           Human A           Human B           Agent B
   │                  │                  │                 │
   │  1. SendMessage (suspicious task)                     │
   │─────────────────────────────────────────────────────►│
   │                                                       │
   │                  │                  │  2. Flag as     │
   │                  │                  │  suspicious     │
   │                  │◄─────────────────┼─────────────────│
   │                  │                  │                 │
   │                  │  3. Human reviews│                 │
   │                  │  and REJECTS     │                 │
   │                  │─────────────────►│                 │
   │                  │                  │                 │
   │                  │                  │  4. Reduce trust│
   │                  │                  │  level          │
   │                  │                  │────────────────►│
   │                  │                  │                 │
   │  5. Task rejected with reason                         │
   │◄─────────────────────────────────────────────────────│
   │                  │                  │                 │
   │  6. Update audit │                  │  6. Update audit│
   │     (rejection)  │                  │     (rejection) │
   │                  │                  │                 │
```

### 6.4 Task Lifecycle Invariants

HA2HA imposes strict constraints on A2A task state transitions to ensure human oversight cannot be bypassed.

#### 6.4.1 Core Invariant

> **INVARIANT**: An A2A task MUST NOT transition from `SUBMITTED` to `WORKING` until a valid `ha2ha/approve` has been received, validated, and logged.

#### 6.4.2 State Transition Rules

| A2A State | Transition | HA2HA Requirement |
|-----------|------------|-------------------|
| (none) → SUBMITTED | Task received | Queue for HA2HA approval |
| SUBMITTED → WORKING | Begin execution | **REQUIRES** valid `ha2ha/approve` |
| SUBMITTED → CANCELED | Timeout or rejection | Allowed (via `ha2ha/reject` or timeout) |
| SUBMITTED → FAILED | Validation error | Allowed (malformed request) |
| WORKING → COMPLETED | Success | Standard A2A (HA2HA already approved) |
| WORKING → FAILED | Error | Standard A2A (HA2HA already approved) |

#### 6.4.3 Approval Validity

An `ha2ha/approve` is valid if and only if:
1. `taskId` matches a pending task in SUBMITTED state
2. `approvedBy` identifies a qualified approver (see §9.4)
3. `approvalScope` is appropriate for the trust level
4. `expiresAt` has not passed (if present)
5. Approval hash matches task payload hash (see §7.1.1)

#### 6.4.4 Timeout Behavior

Tasks in SUBMITTED state awaiting approval:
- MUST timeout after `approvalTimeout` (default: 1 hour)
- On timeout: transition to CANCELED
- Timeout MUST NOT auto-approve (fail-secure)
- Timeout SHOULD trigger notification to approvers

#### 6.4.5 Idempotency and Replay Protection

| Scenario | Behavior |
|----------|----------|
| Duplicate approval (same taskId) | Accept silently, log duplicate |
| Approval after timeout | Reject with error code `APPROVAL_EXPIRED` |
| Approval after rejection | Reject with error code `TASK_ALREADY_REJECTED` |
| Approval for unknown taskId | Reject with error code `TASK_NOT_FOUND` |
| Approval with mismatched hash | Reject with error code `HASH_MISMATCH` |

#### 6.4.6 Error Codes

| Code | Meaning |
|------|---------|
| `APPROVAL_EXPIRED` | Approval arrived after task timeout |
| `TASK_ALREADY_REJECTED` | Task was already rejected |
| `TASK_ALREADY_APPROVED` | Task was already approved (duplicate) |
| `TASK_NOT_FOUND` | No task with this ID in pending state |
| `HASH_MISMATCH` | Approval hash doesn't match task payload |
| `APPROVER_NOT_QUALIFIED` | Approver lacks required competency |

---

## 7. Operations

HA2HA defines additional operations beyond standard A2A.

### 7.1 ha2ha/approve

Approve a pending task for execution.

#### 7.1.1 Approval Hash Commitment (REQUIRED)

To prevent approval dialog manipulation attacks, human approval MUST include a cryptographic commitment to the full task payload.

**Requirement**: The `payloadHash` field contains the SHA-256 hash of the complete task request body. The approver's signature covers this hash, ensuring the approved task cannot be modified after approval.

```
payloadHash = SHA-256(canonical_json(task_request_body))
```

Where `canonical_json()` produces deterministic JSON (sorted keys, no whitespace).

**Request:**
```json
{
  "taskId": "task-uuid",
  "approvedBy": "human-identifier",
  "approvalScope": "single",
  "expiresAt": "2026-02-02T20:00:00Z",
  "payloadHash": "a3f2b8c9d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
  "approverSignature": "base64-encoded-signature",
  "conditions": {
    "maxCost": 100,
    "allowedActions": ["read", "list"]
  }
}
```

**Response:**
```json
{
  "taskId": "task-uuid",
  "status": "approved",
  "auditId": "audit-uuid",
  "payloadHashVerified": true
}
```

#### 7.1.2 Hash Verification

Before executing an approved task, the receiving agent MUST:
1. Compute the hash of the stored task payload
2. Compare with the `payloadHash` in the approval
3. If mismatch: reject execution, log tampering attempt, reduce trust

This prevents attacks where the approval dialog shows different content than what will be executed.

### 7.2 ha2ha/reject

Reject a pending task.

**Request:**
```json
{
  "taskId": "task-uuid",
  "rejectedBy": "human-identifier",
  "reason": "Request exceeds authorized scope",
  "trustAction": "reduce",
  "trustLevelNew": 1
}
```

### 7.3 ha2ha/escalate

Escalate a task or agent for higher-level review.

**Request:**
```json
{
  "type": "task",
  "id": "task-uuid",
  "reason": "Unusual request pattern detected",
  "severity": "medium",
  "requestedReviewer": "security-team"
}
```

### 7.4 ha2ha/trust

Manage trust level for an agent.

**Request:**
```json
{
  "agentId": "agent-uuid",
  "action": "set",
  "trustLevel": 3,
  "reason": "Completed probationary period successfully",
  "approvedBy": "human-identifier"
}
```

### 7.5 ha2ha/audit

Submit or query audit logs.

**Submit:**
```json
{
  "action": "submit",
  "entry": {
    "timestamp": "2026-02-02T19:00:00Z",
    "eventType": "task.approved",
    "taskId": "task-uuid",
    "agentId": "agent-uuid",
    "humanId": "human-identifier",
    "details": { ... }
  }
}
```

**Query:**
```json
{
  "action": "query",
  "filters": {
    "agentId": "agent-uuid",
    "startTime": "2026-02-01T00:00:00Z",
    "endTime": "2026-02-02T00:00:00Z",
    "eventTypes": ["task.approved", "task.rejected"]
  }
}
```

---

## 8. Security Considerations

### 8.1 Threat Model

HA2HA is designed to defend against:

| Threat | Mitigation |
|--------|------------|
| Compromised agent | Behavioral monitoring, human approval, trust levels |
| Malicious operator | Mutual verification, audit trails, escalation |
| Man-in-the-middle | A2A security (mTLS, OAuth2), transport encryption |
| Replay attacks | Unique task IDs, timestamps, nonces |
| Denial of service | Rate limiting, trust-based prioritization |
| Social engineering | Clear approval UIs, suspicious pattern flagging |

### 8.2 What HA2HA Cannot Prevent

**Honest limitation**: If an attacker fully controls the other endpoint (agent AND human), HA2HA cannot prevent them from:
- Sending well-formed malicious requests
- Approving their own malicious requests
- Providing false audit information

HA2HA's defense in this scenario:
- Makes attacks **detectable** through audit trails
- Makes attacks **slower** through approval requirements
- Makes attacks **accountable** through identity verification
- Makes attacks **recoverable** through action logging

### 8.3 Behavioral Monitoring

HA2HA implementations SHOULD include behavioral monitoring:

1. **Baseline Establishment**: Learn normal patterns for each agent
2. **Anomaly Detection**: Flag deviations from baseline
3. **Pattern Categories**:
   - Request frequency
   - Request timing (hour of day, day of week)
   - Request types and parameters
   - Response patterns
   - Error rates
4. **Automatic Escalation**: Anomalies trigger human review

### 8.4 Audit Requirements

Minimum audit fields for each event:

| Field | Description |
|-------|-------------|
| `timestamp` | ISO 8601 timestamp with timezone |
| `eventType` | Enumerated event type |
| `taskId` | Unique task identifier |
| `sourceAgentId` | Requesting agent |
| `targetAgentId` | Receiving agent |
| `humanId` | Human who approved/rejected (if applicable) |
| `trustLevel` | Trust level at time of event |
| `outcome` | Result of the action |
| `hash` | Cryptographic hash for tamper detection |

### 8.5 OWASP Agentic Security Alignment

HA2HA addresses the OWASP Agentic Security Top 10:

| OWASP Risk | HA2HA Mitigation |
|------------|------------------|
| A01: Prompt Injection | Human review of all cross-boundary requests |
| A02: Sensitive Data Exposure | Trust levels limit data access |
| A03: Inadequate Sandboxing | Actions require explicit approval |
| A04: Unauthorized Actions | Every action requires human approval |
| A05: Insecure Inter-Agent | Mandatory HA2HA compliance verification |
| A06: Excessive Autonomy | No autonomous cross-boundary actions |
| A07: Overreliance on AI | Human-in-the-loop by design |
| A08: Insufficient Logging | Comprehensive audit requirements |
| A09: Supply Chain | Attestation and verification |
| A10: Improper Error Handling | Fail-secure with escalation |

### 8.6 Cryptographic Attestation Requirements

#### 8.6.1 Agent Card Signing (REQUIRED)

HA2HA-compliant Agent Cards MUST include cryptographic signatures to prevent impersonation and spoofing.

**Requirement**: Use A2A's `AgentCardSignature` mechanism (JWS format) with:
- Algorithm: ES256 (ECDSA with P-256) or Ed25519
- Key source: X.509 certificate from trusted CA, or pre-shared public key

```json
{
  "signatures": [
    {
      "protected": "eyJhbGciOiJFUzI1NiJ9",
      "signature": "base64url-encoded-signature"
    }
  ]
}
```

#### 8.6.2 Certificate Requirements

| Requirement | Specification |
|-------------|---------------|
| Key size | P-256 (ECDSA) or Ed25519 |
| Certificate validity | Maximum 1 year |
| Revocation checking | MUST support OCSP or CRL |
| Self-signed | Allowed for private federations only |
| CA-signed | REQUIRED for public federations |

#### 8.6.3 Attestation Verification

On connection, agents MUST:
1. Verify signature validity
2. Check certificate chain to trusted root
3. Verify certificate not revoked
4. Match certificate subject to agent identity
5. Log verification result

Failed attestation → Trust Level 0 (Blocked)

### 8.7 Automation Bias Mitigation

To comply with EU AI Act Article 14.4(b), implementations MUST include measures to prevent approvers from over-relying on automation.

#### 8.7.1 Approval Interface Requirements

Approval interfaces MUST:
1. Display the FULL task payload at Trust Levels 1-2 (no summaries)
2. Show agent confidence scores when available
3. Display alternative actions considered (if available)
4. Include visual indicators of trust level and risk
5. Require active confirmation (not passive dismiss)

#### 8.7.2 Rate Limiting

To prevent approval fatigue:
- RECOMMENDED maximum: 5 approvals per approver per hour
- MUST track approval count per approver
- SHOULD warn when approaching fatigue threshold
- MAY enforce mandatory breaks after sustained high volume

#### 8.7.3 Decision Quality Monitoring

Implementations SHOULD monitor:
- Average approval decision time (decreasing time signals fatigue)
- Approval-to-rejection ratio (high ratio may signal rubber-stamping)
- Time-of-day patterns (late-night approvals more error-prone)

Anomalies SHOULD trigger:
- Automatic escalation to backup approver
- Notification to security team
- Temporary pause on non-critical approvals

### 8.8 Cascading Failure Prevention

To address OWASP ASI08 (Cascading Hallucinations/Actions):

#### 8.8.1 Workflow Depth Limits

| Constraint | Requirement |
|------------|-------------|
| Maximum workflow depth | RECOMMENDED: 3 hops |
| Depth tracking | MUST include `workflowDepth` in task metadata |
| Depth exceeded | MUST reject with `WORKFLOW_DEPTH_EXCEEDED` |

#### 8.8.2 Circuit Breaker Pattern

Implementations MUST implement circuit breakers:
- **Closed** (normal): Requests proceed
- **Open** (tripped): All requests from agent blocked
- **Half-open** (testing): Limited requests allowed

**Trip conditions**:
- 3 consecutive failures from same agent
- 5 failures within 5 minutes from same agent
- Any Critical severity violation

**Reset conditions**:
- Human review and explicit reset
- Automatic reset after 1 hour (half-open state)

#### 8.8.3 Failure Isolation

When a task fails:
1. Failure MUST NOT propagate to dependent tasks without human review
2. Dependent tasks MUST be paused pending review
3. Audit trail MUST capture failure cascade path
4. Human MUST approve resumption of dependent tasks

### 8.9 Audit Log Integrity

#### 8.9.1 Hash Chaining (REQUIRED)

Each audit entry MUST include a hash of the previous entry, creating a tamper-evident chain:

```
entry[n].prevHash = SHA-256(entry[n-1])
entry[n].hash = SHA-256(entry[n] without hash field)
```

#### 8.9.2 Integrity Verification

- MUST verify chain integrity on startup
- SHOULD verify periodically during operation
- MUST alert on chain break detection
- MUST preserve evidence of tampering for forensics

#### 8.9.3 External Audit Collection

For Trust Level 3+ relationships:
- SHOULD use external audit log collection
- Agents MUST NOT have write access to audit storage
- Audit storage SHOULD be append-only
- Cross-signing between peers RECOMMENDED

---

## 9. Implementation Requirements

### 9.1 Conformance Levels

**HA2HA Core** (MUST):
- Human approval for all cross-boundary tasks
- Trust level tracking (minimum 3 levels)
- Basic audit logging
- HA2HA extension in Agent Card
- Mutual HA2HA verification

**HA2HA Standard** (SHOULD):
- Full 5-level trust model
- Behavioral monitoring
- Escalation workflows
- Configurable audit verbosity
- Pre-approval rules

**HA2HA Advanced** (MAY):
- Cryptographic attestation
- Federated audit log sharing
- Automated anomaly detection
- Machine learning behavioral models
- Multi-party approval workflows

### 9.2 Interoperability

HA2HA implementations MUST:
- Accept connections from pure A2A agents (treat as Level 0)
- Clearly indicate HA2HA requirement to non-compliant agents
- Gracefully degrade when optional features unavailable

### 9.4 Qualified Approver Requirements

To comply with EU AI Act Article 26.2 and ISO/IEC 42001:7.2, organizations MUST define and enforce approver qualifications.

#### 9.4.1 Competency Framework

Qualified approvers MUST demonstrate competency in:

| Competency | Description | Assessment |
|------------|-------------|------------|
| Threat Recognition | Identify suspicious request patterns | Practical test |
| Protocol Understanding | HA2HA trust levels and operations | Written exam |
| Escalation Judgment | When to escalate vs. approve/reject | Scenario-based |
| Automation Bias Awareness | Recognize own cognitive limitations | Training completion |

#### 9.4.2 Role-Based Authority

| Trust Level | Approver Tier Required |
|-------------|------------------------|
| Level 1 (Unknown) | Senior approver (Tier 3) |
| Level 2 (Provisional) | Standard approver (Tier 2) |
| Level 3-4 (Standard/Trusted) | Any qualified approver (Tier 1+) |
| Level 5 (Verified) | Any qualified approver (Tier 1+) |
| Trust elevation | Senior approver (Tier 3) |
| Trust reduction | Any qualified approver |

#### 9.4.3 Workload Limits

To ensure meaningful oversight:
- RECOMMENDED: Maximum 20 approvals per approver per shift
- MUST NOT assign approval duties that impede other critical functions
- SHOULD rotate approvers to prevent fatigue
- MUST maintain backup approvers for coverage

#### 9.4.4 Training Requirements

- Initial training: 4 hours minimum
- Annual recertification: 2 hours
- Incident review: Within 1 week of any security incident involving the approver

### 9.5 Approval Interface Requirements

#### 9.5.1 Required Display Elements

All approval interfaces MUST display:

| Element | Trust Level 1-2 | Trust Level 3-5 |
|---------|-----------------|-----------------|
| Requesting agent identity | Full details | Summary |
| Trust level and history | Full | Summary |
| Task payload | Full (no truncation) | Summary with expand |
| Risk indicators | Prominent | Present |
| Approval/Reject/Escalate | All three | All three |
| Timeout countdown | Visible | Visible |

#### 9.5.2 Prohibited Patterns

Approval interfaces MUST NOT:
- Auto-dismiss after timeout (fail-secure requires explicit action)
- Use collapsible sections that hide critical content
- Allow approval via single-tap/click (require confirmation)
- Show only summaries at Trust Level 1-2
- Use variable-width fonts that could hide content

#### 9.5.3 Accessibility

Approval interfaces MUST:
- Support screen readers
- Meet WCAG 2.1 AA standards
- Work on mobile devices
- Support keyboard-only navigation

### 9.6 Latency Management

Human approval adds latency. This section provides patterns to maintain usability.

#### 9.6.1 Expected Latency by Trust Level

| Trust Level | Typical Approval Latency | Mitigation |
|-------------|--------------------------|------------|
| 1 (Unknown) | Minutes to hours | Async patterns only |
| 2 (Provisional) | Minutes | Async preferred |
| 3 (Standard) | 1-5 minutes | Pre-approval rules |
| 4 (Trusted) | 30 seconds - 2 minutes | Broad pre-approvals |
| 5 (Verified) | 10-30 seconds | Maximum pre-approval scope |

#### 9.6.2 Asynchronous Task Pattern

For latency-tolerant workflows:
1. Submit task, receive acknowledgment immediately
2. Task enters SUBMITTED state, awaiting approval
3. Requestor polls or receives webhook on approval
4. Task executes after approval

**Webhook notification**:
```json
{
  "event": "task.approved",
  "taskId": "task-uuid",
  "approvedAt": "2026-02-02T20:15:00Z"
}
```

#### 9.6.3 Pre-Approval Rules

At Trust Level 3+, humans may define pre-approval rules:

```json
{
  "preApprovalRule": {
    "name": "Read-only data access",
    "scope": "category",
    "allowedActions": ["read", "list", "describe"],
    "excludedResources": ["credentials", "pii"],
    "maxRequestsPerHour": 100,
    "expiresAt": "2026-03-02T00:00:00Z",
    "approvedBy": "human-identifier"
  }
}
```

Pre-approved requests:
- Skip manual approval queue
- Still logged to audit trail
- Count toward rate limits
- Revocable by any qualified approver

#### 9.6.4 Batched Approval

For high-volume, similar requests:
1. Group pending requests by category
2. Present batch summary to approver
3. Single approval covers all requests in batch
4. RECOMMENDED maximum batch size: 10

### 9.7 Reference Implementation

A reference implementation is available at:
- **GitHub**: https://github.com/ha2haproject/ha2ha
- **Documentation**: https://ha2haproject.org/docs

---

## Appendix A: Protobuf Definitions

```protobuf
syntax = "proto3";
package ha2ha.v1;

import "google/protobuf/struct.proto";
import "google/protobuf/timestamp.proto";

// HA2HA extension parameters for A2A AgentExtension
message Ha2haExtensionParams {
  string version = 1;
  bool human_oversight = 2;
  int32 trust_level_required = 3;
  optional string audit_endpoint = 4;
  optional string escalation_contact = 5;
  optional bool behavioral_monitoring = 6;
}

// Trust levels
enum TrustLevel {
  TRUST_LEVEL_UNSPECIFIED = 0;
  TRUST_LEVEL_BLOCKED = 1;
  TRUST_LEVEL_UNKNOWN = 2;
  TRUST_LEVEL_PROVISIONAL = 3;
  TRUST_LEVEL_STANDARD = 4;
  TRUST_LEVEL_TRUSTED = 5;
  TRUST_LEVEL_VERIFIED = 6;
}

// Task metadata extension for HA2HA
message Ha2haTaskMetadata {
  string requesting_agent = 1;
  string requesting_human = 2;
  TrustLevel trust_level = 3;
  bool approval_required = 4;
  google.protobuf.Duration approval_timeout = 5;
  string audit_id = 6;
}

// Approval request
message ApproveRequest {
  string task_id = 1;
  string approved_by = 2;
  ApprovalScope approval_scope = 3;
  google.protobuf.Timestamp expires_at = 4;
  ApprovalConditions conditions = 5;
}

enum ApprovalScope {
  APPROVAL_SCOPE_UNSPECIFIED = 0;
  APPROVAL_SCOPE_SINGLE = 1;
  APPROVAL_SCOPE_SIMILAR = 2;
  APPROVAL_SCOPE_CATEGORY = 3;
}

message ApprovalConditions {
  optional int64 max_cost = 1;
  repeated string allowed_actions = 2;
  google.protobuf.Struct custom = 3;
}

// Rejection request
message RejectRequest {
  string task_id = 1;
  string rejected_by = 2;
  string reason = 3;
  TrustAction trust_action = 4;
  optional TrustLevel trust_level_new = 5;
}

enum TrustAction {
  TRUST_ACTION_UNSPECIFIED = 0;
  TRUST_ACTION_NONE = 1;
  TRUST_ACTION_REDUCE = 2;
  TRUST_ACTION_BLOCK = 3;
}

// Escalation request
message EscalateRequest {
  EscalationType type = 1;
  string id = 2;
  string reason = 3;
  Severity severity = 4;
  optional string requested_reviewer = 5;
}

enum EscalationType {
  ESCALATION_TYPE_UNSPECIFIED = 0;
  ESCALATION_TYPE_TASK = 1;
  ESCALATION_TYPE_AGENT = 2;
  ESCALATION_TYPE_PATTERN = 3;
}

enum Severity {
  SEVERITY_UNSPECIFIED = 0;
  SEVERITY_LOW = 1;
  SEVERITY_MEDIUM = 2;
  SEVERITY_HIGH = 3;
  SEVERITY_CRITICAL = 4;
}

// Audit entry
message AuditEntry {
  google.protobuf.Timestamp timestamp = 1;
  string event_type = 2;
  string task_id = 3;
  string source_agent_id = 4;
  string target_agent_id = 5;
  optional string human_id = 6;
  TrustLevel trust_level = 7;
  string outcome = 8;
  bytes hash = 9;
  google.protobuf.Struct details = 10;
}
```

---

---

## Appendix B: HTTP Transport Binding

This appendix defines the canonical HTTP binding for HA2HA operations.

### B.1 Base Path

All HA2HA operations are exposed under:
```
/.well-known/ha2ha/v1/
```

### B.2 Operations

| Operation | Method | Path | Request Body | Response |
|-----------|--------|------|--------------|----------|
| Approve | POST | `/approve` | `ApproveRequest` | `ApproveResponse` |
| Reject | POST | `/reject` | `RejectRequest` | `RejectResponse` |
| Escalate | POST | `/escalate` | `EscalateRequest` | `EscalateResponse` |
| Trust | POST | `/trust` | `TrustRequest` | `TrustResponse` |
| Audit Submit | POST | `/audit` | `AuditSubmitRequest` | `AuditSubmitResponse` |
| Audit Query | GET | `/audit` | (query params) | `AuditQueryResponse` |
| Trust Status | GET | `/trust/{agentId}` | — | `TrustStatusResponse` |

### B.3 Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` |
| `X-HA2HA-Version` | Yes | HA2HA version (e.g., `0.1.0`) |
| `X-HA2HA-Agent-Id` | Yes | Requesting agent identifier |
| `X-HA2HA-Request-Id` | Yes | Unique request ID for idempotency |
| `X-HA2HA-Timestamp` | Yes | ISO 8601 timestamp |
| `X-HA2HA-Signature` | Recommended | Request signature for integrity |

### B.4 Error Responses

Errors follow JSON-RPC 2.0 error object format:

```json
{
  "error": {
    "code": -32001,
    "message": "Approval expired",
    "data": {
      "taskId": "task-uuid",
      "expiredAt": "2026-02-02T20:00:00Z"
    }
  }
}
```

#### B.4.1 Error Codes

| Code | Name | HTTP Status |
|------|------|-------------|
| -32001 | APPROVAL_EXPIRED | 410 Gone |
| -32002 | TASK_ALREADY_REJECTED | 409 Conflict |
| -32003 | TASK_ALREADY_APPROVED | 409 Conflict |
| -32004 | TASK_NOT_FOUND | 404 Not Found |
| -32005 | HASH_MISMATCH | 400 Bad Request |
| -32006 | APPROVER_NOT_QUALIFIED | 403 Forbidden |
| -32007 | TRUST_LEVEL_INSUFFICIENT | 403 Forbidden |
| -32008 | WORKFLOW_DEPTH_EXCEEDED | 400 Bad Request |
| -32009 | RATE_LIMIT_EXCEEDED | 429 Too Many Requests |
| -32010 | ATTESTATION_FAILED | 401 Unauthorized |

### B.5 Example: Approve Request

**Request:**
```http
POST /.well-known/ha2ha/v1/approve HTTP/1.1
Host: agent-b.example.com
Content-Type: application/json
X-HA2HA-Version: 0.1.0
X-HA2HA-Agent-Id: agent-a-uuid
X-HA2HA-Request-Id: req-12345
X-HA2HA-Timestamp: 2026-02-02T20:15:00Z

{
  "taskId": "task-uuid",
  "approvedBy": "human@example.com",
  "approvalScope": "single",
  "payloadHash": "a3f2b8c9...",
  "approverSignature": "base64..."
}
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "taskId": "task-uuid",
  "status": "approved",
  "auditId": "audit-uuid",
  "payloadHashVerified": true
}
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-02-02 | Release candidate with stress test findings |
| 0.1.0-draft | 2026-02-02 | Initial draft |

---

## Acknowledgments

HA2HA builds upon:
- **A2A Protocol** by the A2A Project (Linux Foundation)
- **OWASP Agentic Security Initiative** for threat modeling
- **Matrix Protocol** for decentralized, encrypted transport
- **Tailscale** for zero-trust networking concepts

---

**Copyright 2026 The HA2HA Project Authors. Licensed under Apache 2.0.**
