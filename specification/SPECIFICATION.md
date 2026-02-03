# HA2HA Protocol Specification

**Version:** 0.1.0-draft  
**Status:** Draft  
**Last Updated:** 2026-02-02  
**License:** Apache 2.0  

## Abstract

HA2HA (Human/Agent to Human/Agent) is an extension to the A2A (Agent-to-Agent) protocol that adds a mandatory human oversight layer for AI agent federation. While A2A enables agents to communicate and collaborate, HA2HA ensures that humans remain in control at both ends of every federation relationship.

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Principles](#2-design-principles)
3. [Protocol Stack](#3-protocol-stack)
4. [A2A Integration](#4-a2a-integration)
5. [Trust Model](#5-trust-model)
6. [Message Flows](#6-message-flows)
7. [Operations](#7-operations)
8. [Security Considerations](#8-security-considerations)
9. [Implementation Requirements](#9-implementation-requirements)
10. [Appendix: Protobuf Definitions](#appendix-protobuf-definitions)

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

---

## 7. Operations

HA2HA defines additional operations beyond standard A2A.

### 7.1 ha2ha/approve

Approve a pending task for execution.

**Request:**
```json
{
  "taskId": "task-uuid",
  "approvedBy": "human-identifier",
  "approvalScope": "single",
  "expiresAt": "2026-02-02T20:00:00Z",
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
  "auditId": "audit-uuid"
}
```

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

### 9.3 Reference Implementation

A reference implementation is available at:
- **GitHub**: https://github.com/ha2haproject/ha2ha
- **Documentation**: https://ha2haproject.org/docs

---

## Appendix: Protobuf Definitions

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

## Document History

| Version | Date | Changes |
|---------|------|---------|
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
