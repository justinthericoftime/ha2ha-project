# Getting Started with HA2HA

This guide walks you through adding HA2HA support to your A2A-compatible agent.

## Prerequisites

- An existing A2A-compatible agent
- Understanding of [A2A Agent Cards](https://github.com/a2aproject/A2A)
- Human approval workflow capability (UI, CLI, or API)

---

## Step 0: Human Onboarding

Before implementing HA2HA technically, the human(s) who will approve federation requests must be onboarded. This creates an approver profile that defines identity, preferences, and recovery settings.

### What Onboarding Covers

The onboarding process has **5 steps and 10 questions** (~10 minutes):

| Step | Questions | Purpose |
|------|-----------|---------|
| **1. Identity** | 2 | How are you identified and verified? |
| **2. Registration** | 2 | What can you approve, and when? |
| **3. Preferences** | 2 | How should requests be presented? |
| **4. Trust Baseline** | 2 | Default stance on unknown agents? |
| **5. Recovery** | 2 | What happens when you're unavailable? |

### Running Onboarding

**OpenClaw users:**
```
/ha2ha onboard
```

**CLI users:**
```bash
npx @ha2ha/reference onboard
```

**Programmatic:**
```typescript
import { runOnboarding } from '@ha2ha/reference';
await runOnboarding();
```

### Output

Onboarding creates an approver profile at:
```
~/.openclaw/ha2ha/approvers/{your-id}.yaml
```

Example minimal profile:
```yaml
approver:
  name: "Your Name"
  id: "your-name"
  created: "2026-02-02T12:00:00Z"

identity:
  model: "channel-based"
  verification: "simple"

authorization:
  domains: ["*"]
  availability:
    mode: "waking-hours"

approval_preferences:
  presentation: "inline"
  fatigue_limit: null

trust_baseline:
  default_level: "unknown"

recovery:
  timeout_hours: 5
  timeout_action: "deny"
```

### Configure Your Agent

After onboarding, add the HA2HA section to your agent config:

```json
{
  "ha2ha": {
    "enabled": true,
    "profile": "~/.openclaw/ha2ha/approvers/your-name.yaml",
    "trustStore": "~/.openclaw/ha2ha/trust-store/"
  }
}
```

Now proceed to technical implementation.

---

## Step 1: Declare HA2HA Support

Add the HA2HA extension to your Agent Card's capabilities:

```json
{
  "name": "My Agent",
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
          "escalationContact": "security@yourdomain.com"
        }
      }
    ]
  }
}
```

### Extension Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `version` | Yes | HA2HA spec version (currently `0.1.0`) |
| `humanOversight` | Yes | Must be `true` |
| `trustLevelRequired` | Yes | Minimum trust level to communicate (1-5) |
| `auditEndpoint` | No | URL for audit log submission |
| `escalationContact` | No | Human contact for escalation |
| `behavioralMonitoring` | No | Whether monitoring is enabled |

## Step 2: Implement Trust Registry

Create a registry to track trust levels for known agents:

```typescript
interface TrustEntry {
  agentId: string;
  agentCard: AgentCard;
  trustLevel: 0 | 1 | 2 | 3 | 4 | 5;
  lastInteraction: Date;
  violations: ViolationRecord[];
  approvedBy?: string;
  notes?: string;
}

class TrustRegistry {
  private entries: Map<string, TrustEntry> = new Map();
  
  getTrustLevel(agentId: string): number {
    const entry = this.entries.get(agentId);
    if (!entry) return 1; // Unknown = Level 1
    return entry.trustLevel;
  }
  
  setTrustLevel(agentId: string, level: number, approvedBy: string): void {
    // Validate: trust can only be raised by human approval
    // Trust can be lowered automatically by system
  }
  
  recordViolation(agentId: string, violation: ViolationRecord): void {
    // Reduce trust based on severity
  }
}
```

## Step 3: Implement Approval Workflow

Every incoming task from a federated agent MUST be queued for human approval:

```typescript
interface PendingApproval {
  taskId: string;
  sourceAgent: string;
  task: Task;
  trustLevel: number;
  receivedAt: Date;
  expiresAt: Date;
}

class ApprovalQueue {
  private pending: Map<string, PendingApproval> = new Map();
  
  async queueForApproval(task: Task, sourceAgent: string): Promise<void> {
    const approval: PendingApproval = {
      taskId: task.id,
      sourceAgent,
      task,
      trustLevel: this.trustRegistry.getTrustLevel(sourceAgent),
      receivedAt: new Date(),
      expiresAt: this.calculateExpiry(trustLevel)
    };
    
    this.pending.set(task.id, approval);
    await this.notifyHuman(approval);
  }
  
  async approve(taskId: string, approvedBy: string): Promise<void> {
    const approval = this.pending.get(taskId);
    if (!approval) throw new Error('Approval not found');
    
    await this.auditLog.record({
      eventType: 'task.approved',
      taskId,
      approvedBy,
      sourceAgent: approval.sourceAgent,
      trustLevel: approval.trustLevel
    });
    
    this.pending.delete(taskId);
    await this.executeTask(approval.task);
  }
  
  async reject(taskId: string, rejectedBy: string, reason: string): Promise<void> {
    // Log rejection, optionally reduce trust, notify source agent
  }
}
```

## Step 4: Verify Incoming Agents

Before processing any message from a new agent, verify HA2HA compliance:

```typescript
async function verifyAgent(agentCard: AgentCard): Promise<VerificationResult> {
  // 1. Check for HA2HA extension
  const ha2haExt = agentCard.capabilities.extensions?.find(
    ext => ext.uri === 'https://ha2haproject.org/spec/v1'
  );
  
  if (!ha2haExt) {
    return { 
      compliant: false, 
      reason: 'No HA2HA extension declared',
      recommendedTrustLevel: 0 // Block non-HA2HA agents
    };
  }
  
  // 2. Verify humanOversight is true
  if (!ha2haExt.params?.humanOversight) {
    return {
      compliant: false,
      reason: 'humanOversight not enabled',
      recommendedTrustLevel: 0
    };
  }
  
  // 3. Check version compatibility
  const version = ha2haExt.params?.version;
  if (!isCompatibleVersion(version)) {
    return {
      compliant: false,
      reason: `Incompatible version: ${version}`,
      recommendedTrustLevel: 1
    };
  }
  
  return { 
    compliant: true,
    recommendedTrustLevel: 1 // Start at Unknown
  };
}
```

## Step 5: Implement Audit Logging

Every action must be logged:

```typescript
interface AuditEntry {
  timestamp: Date;
  eventType: string;
  taskId?: string;
  sourceAgentId: string;
  targetAgentId: string;
  humanId?: string;
  trustLevel: number;
  outcome: 'success' | 'rejected' | 'error';
  details: Record<string, unknown>;
  hash?: string; // For tamper detection
}

class AuditLog {
  async record(entry: Omit<AuditEntry, 'timestamp' | 'hash'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      timestamp: new Date(),
      hash: this.computeHash(entry)
    };
    
    await this.storage.append(fullEntry);
    
    // If configured, send to remote audit endpoint
    if (this.remoteEndpoint) {
      await this.sendToRemote(fullEntry);
    }
  }
  
  private computeHash(entry: unknown): string {
    // SHA-256 of entry + previous hash for chain integrity
  }
}
```

## Step 6: Add HA2HA Metadata to Outgoing Tasks

When your agent sends tasks to other HA2HA agents:

```typescript
function createTask(content: string, targetAgent: string): Task {
  return {
    id: generateUUID(),
    context_id: generateUUID(),
    status: { state: 'SUBMITTED' },
    metadata: {
      ha2ha: {
        requestingAgent: myAgentId,
        requestingHuman: currentUser.id,
        trustLevel: trustRegistry.getMyTrustLevelWith(targetAgent),
        approvalRequired: true,
        auditId: generateUUID()
      }
    }
  };
}
```

## Testing Your Implementation

### Checklist

- [ ] Agent Card includes HA2HA extension with `humanOversight: true`
- [ ] Unknown agents are added at trust level 1
- [ ] Non-HA2HA agents are blocked (trust level 0)
- [ ] All incoming tasks queue for human approval
- [ ] Humans can approve, reject, or escalate tasks
- [ ] Rejections reduce trust level appropriately
- [ ] All actions are audit logged
- [ ] Outgoing tasks include HA2HA metadata

### Test Scenarios

1. **New agent connection**: Verify new agent starts at level 1
2. **Non-HA2HA agent**: Verify rejection with level 0
3. **Task approval flow**: Submit task → queue → approve → execute
4. **Task rejection**: Submit task → queue → reject → log → reduce trust
5. **Trust elevation**: Human approves trust increase after good behavior
6. **Violation response**: Bad behavior → automatic trust reduction

## Next Steps

- Read the full [Specification](../specification/SPECIFICATION.md)
- Review the [Threat Model](./threat-model.md)
- Check [FAQ](./faq.md) for common questions
- Join the community for support

---

**Questions?** Open an issue or email hello@ha2haproject.org
