/**
 * Cross-Module Integration Tests
 * 
 * Tests interactions between HA2HA modules to ensure they work together
 * correctly. These tests verify the system behaves as expected when
 * multiple modules are combined.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Trust module
import { TrustRegistry, TrustLevel, ViolationSeverity } from '../trust';

// Identity module
import { AgentIdentity } from '../identity';

// Approval module
import { 
  TaskLifecycle, 
  ApprovalRequest, 
  ApprovalScope, 
  TaskState,
  computePayloadHash 
} from '../approval';

// Circuit breaker module
import { CircuitBreaker, CircuitBreakerRegistry, WorkflowDepthTracker } from '../circuit-breaker';

// Audit module
import { 
  AuditChain, 
  AuditEventType, 
  verifyChain,
  createAuditChain,
} from '../audit';

// Profile module
import { 
  FatigueTracker, 
  AvailabilityChecker, 
  PreTrustResolver,
  ProfileEnforcer,
  createFatigueTracker 
} from '../profile';

// A2A module
import { 
  AgentCardBuilder, 
  negotiate, 
  negotiateCapabilities,
  createTaskMetadata,
  createTrustContext,
} from '../a2a';

describe('Trust + Approval Integration', () => {
  let tempDir: string;
  let trustRegistry: TrustRegistry;
  let lifecycle: TaskLifecycle;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));
    
    tempDir = mkdtempSync(join(tmpdir(), 'integration-trust-approval-'));
    trustRegistry = new TrustRegistry();
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      validatorConfig: { requireSignature: false },
    });
  });

  afterEach(() => {
    lifecycle.stopTimeoutChecker();
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should require approval based on trust level', async () => {
    const agentId = 'unknown-agent.example.ha2ha';
    
    // Agent starts at UNKNOWN trust
    const entry = trustRegistry.getTrust(agentId);
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
    
    // Submit task from unknown agent
    const task = await lifecycle.submit({
      sourceAgent: agentId,
      targetAgent: 'our-agent.example.ha2ha',
      payload: { action: 'read', path: '/data' },
      trustLevel: entry.level,
    });
    
    expect(task.success).toBe(true);
    expect(task.task?.state).toBe(TaskState.SUBMITTED);
    
    // At UNKNOWN trust, every request requires full review
    // (This is a policy check - implementation validates trust level in metadata)
    expect(task.task?.toJSON().trustLevel).toBe(TrustLevel.UNKNOWN);
  });

  it('should reduce trust on rejected requests', async () => {
    const agentId = 'suspicious-agent.example.ha2ha';
    
    // Set agent to STANDARD trust
    const entry = trustRegistry.getTrust(agentId);
    entry.setLevel(TrustLevel.STANDARD, 'admin@company.ha2ha');
    expect(entry.level).toBe(TrustLevel.STANDARD);
    
    // Submit and reject a malicious request
    const task = await lifecycle.submit({
      sourceAgent: agentId,
      targetAgent: 'our-agent.example.ha2ha',
      payload: { action: 'delete_all', path: '/' },
      trustLevel: entry.level,
    });
    
    // Reject with trust reduction
    await lifecycle.reject(
      task.task!.taskId,
      'admin@company.ha2ha',
      'Malicious request detected',
      'reduce'
    );
    
    // Manually record violation in trust registry
    entry.recordViolation(ViolationSeverity.HIGH, 'Malicious delete attempt');
    
    // Trust should be reduced (HIGH = drop 2 levels: STANDARD -> UNKNOWN)
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
  });

  it('should track trust elevation through successful interactions', async () => {
    const agentId = 'new-partner.example.ha2ha';
    const entry = trustRegistry.getTrust(agentId);
    
    // Start at UNKNOWN
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
    
    // Complete several successful tasks
    for (let i = 0; i < 3; i++) {
      const task = await lifecycle.submit({
        sourceAgent: agentId,
        targetAgent: 'our-agent.example.ha2ha',
        payload: { action: 'read', id: i },
        trustLevel: entry.level,
      });
      
      // Approve and complete
      const approval = ApprovalRequest.createUnsigned(
        task.task!.taskId,
        'admin@company.ha2ha',
        task.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);
      lifecycle.complete(task.task!.taskId);
    }
    
    // After demonstrating good behavior, human elevates trust
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours (past cooldown)
    entry.clearCooldown(); // Simulate cooldown expiry
    
    const elevated = entry.elevate('admin@company.ha2ha');
    expect(elevated).toBe(true);
    expect(entry.level).toBe(TrustLevel.PROVISIONAL);
  });
});

describe('Trust + Circuit Breaker Integration', () => {
  let trustRegistry: TrustRegistry;
  let circuitRegistry: CircuitBreakerRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));
    
    trustRegistry = new TrustRegistry();
    circuitRegistry = new CircuitBreakerRegistry({ trustRegistry });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should trip circuit and reduce trust on critical violation', async () => {
    const agentId = 'failing-agent.example.ha2ha';
    
    // Set up trust entry at STANDARD
    const trustEntry = trustRegistry.getTrust(agentId);
    trustEntry.setLevel(TrustLevel.STANDARD, 'admin');
    
    // Get circuit breaker
    const breaker = circuitRegistry.getCircuit(agentId);
    
    // Record critical violation in circuit breaker
    breaker.recordFailure(ViolationSeverity.CRITICAL, 'Attempted privilege escalation');
    
    // Circuit should be open
    expect(breaker.isOpen).toBe(true);
    
    // Also record the violation in trust registry explicitly
    // (Circuit breaker records are fire-and-forget for trust)
    trustEntry.recordViolation(ViolationSeverity.CRITICAL, 'Attempted privilege escalation');
    
    // Trust should be reduced to BLOCKED (critical = immediate block)
    expect(trustEntry.level).toBe(TrustLevel.BLOCKED);
    
    // Request should be denied by circuit breaker
    const check = breaker.canProceed();
    expect(check.allowed).toBe(false);
  });

  it('should accumulate failures before tripping', async () => {
    const agentId = 'flaky-agent.example.ha2ha';
    const breaker = circuitRegistry.getCircuit(agentId);
    
    // Record 2 medium failures (threshold is 3)
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Timeout 1');
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Timeout 2');
    
    // Circuit should still be closed
    expect(breaker.isClosed).toBe(true);
    expect(breaker.canProceed().allowed).toBe(true);
    
    // 3rd failure trips the circuit
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Timeout 3');
    
    expect(breaker.isOpen).toBe(true);
    expect(breaker.canProceed().allowed).toBe(false);
  });

  it('should recover through half-open state', async () => {
    const agentId = 'recovering-agent.example.ha2ha';
    const breaker = circuitRegistry.getCircuit(agentId);
    
    // Trip the circuit
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Failure 1');
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Failure 2');
    breaker.recordFailure(ViolationSeverity.MEDIUM, 'Failure 3');
    expect(breaker.isOpen).toBe(true);
    
    // Wait for reset timeout (1 hour default)
    vi.advanceTimersByTime(61 * 60 * 1000);
    
    // Should transition to half-open on next check
    expect(breaker.state).toBe('half_open');
    expect(breaker.canProceed().allowed).toBe(true);
    
    // Record success - should close
    breaker.recordSuccess();
    expect(breaker.isClosed).toBe(true);
  });
});

describe('Approval + Audit Integration', () => {
  let tempDir: string;
  let lifecycle: TaskLifecycle;
  let auditChain: AuditChain;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));
    
    tempDir = mkdtempSync(join(tmpdir(), 'integration-approval-audit-'));
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      validatorConfig: { requireSignature: false },
    });
    
    auditChain = createAuditChain(
      join(tempDir, 'audit.ndjson'),
      'our-agent.example.ha2ha'
    );
    await auditChain.load();
  });

  afterEach(() => {
    lifecycle.stopTimeoutChecker();
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should log full approval flow to audit chain', async () => {
    const sourceAgent = 'requester.example.ha2ha';
    const targetAgent = 'our-agent.example.ha2ha';
    
    // Submit task
    const task = await lifecycle.submit({
      sourceAgent,
      targetAgent,
      payload: { action: 'read', path: '/data/report.txt' },
      trustLevel: 3,
    });
    
    // Log submission
    await auditChain.append({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: sourceAgent,
      targetAgentId: targetAgent,
      taskId: task.task!.taskId,
      trustLevel: 3,
      outcome: 'pending',
      details: { payloadHash: task.task!.payloadHash },
    });
    
    // Approve
    const approval = ApprovalRequest.createUnsigned(
      task.task!.taskId,
      'admin@company.ha2ha',
      task.task!.payloadHash,
      ApprovalScope.SINGLE
    );
    await lifecycle.approveWithRequest(approval);
    
    // Log approval
    await auditChain.append({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: sourceAgent,
      targetAgentId: targetAgent,
      taskId: task.task!.taskId,
      humanId: 'admin@company.ha2ha',
      trustLevel: 3,
      outcome: 'success',
      details: { approvalScope: 'single' },
    });
    
    // Execute and complete
    await lifecycle.execute(task.task!.taskId, async () => 'file content');
    
    // Log completion
    await auditChain.append({
      eventType: AuditEventType.TASK_COMPLETED,
      sourceAgentId: sourceAgent,
      targetAgentId: targetAgent,
      taskId: task.task!.taskId,
      trustLevel: 3,
      outcome: 'success',
    });
    
    // Verify audit chain integrity
    const entries = auditChain.entries;
    expect(entries.length).toBe(4); // genesis + 3 events
    
    const verifyResult = verifyChain(entries);
    expect(verifyResult.valid).toBe(true);
    
    // Verify task history
    const taskEvents = entries.filter(e => e.taskId === task.task!.taskId);
    expect(taskEvents.length).toBe(3);
    expect(taskEvents.map(e => e.eventType)).toEqual([
      AuditEventType.TASK_SUBMITTED,
      AuditEventType.TASK_APPROVED,
      AuditEventType.TASK_COMPLETED,
    ]);
  });

  it('should detect tampering in audit log', async () => {
    // Create entries
    await auditChain.append({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'a',
      targetAgentId: 'b',
      trustLevel: 2,
      outcome: 'pending',
    });
    
    await auditChain.append({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'a',
      targetAgentId: 'b',
      humanId: 'admin',
      trustLevel: 2,
      outcome: 'success',
    });
    
    // Tamper with an entry
    const entries = [...auditChain.entries];
    entries[1] = { ...entries[1], trustLevel: 5 }; // Changed trustLevel!
    
    // Verification should fail
    const result = verifyChain(entries);
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe('hash_mismatch');
    expect(result.brokenAt).toBe(1);
  });
});

describe('Identity + A2A Integration', () => {
  let tempDir: string;
  let identity: AgentIdentity;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'integration-identity-a2a-'));
    identity = await AgentIdentity.create('our-agent.example.ha2ha', 'Our Agent');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should build signed agent card and verify', async () => {
    const card = await new AgentCardBuilder(identity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .setUrl('https://our-agent.example.com')
      .addHa2haExtension({
        trustLevelRequired: 2,
        auditEndpoint: '/.well-known/ha2ha/v1/audit',
      })
      .build();
    
    // Card should have attestation
    expect(card.ha2ha.publicKey).toBeDefined();
    expect(card.ha2ha.attestation).toBeDefined();
    expect(card.ha2ha.attestation.signature).toBeDefined();
    
    // Public key should match identity (may differ in base64 vs base64url encoding and padding)
    // Normalize both: replace _ with / and - with +, remove padding
    const normalize = (s: string) => s.replace(/_/g, '/').replace(/-/g, '+').replace(/=+$/, '');
    expect(normalize(card.ha2ha.publicKey)).toBe(normalize(identity.publicKeyBase64));
  });

  it('should negotiate between two HA2HA agents', async () => {
    // Create two identities
    const identity1 = await AgentIdentity.create('agent-1.example.ha2ha', 'Agent 1');
    const identity2 = await AgentIdentity.create('agent-2.example.ha2ha', 'Agent 2');
    
    // Build cards
    const card1 = await new AgentCardBuilder(identity1)
      .setName('Agent 1')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();
    
    const card2 = await new AgentCardBuilder(identity2)
      .setName('Agent 2')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 3 })
      .build();
    
    // Negotiate
    const result = negotiate(card1, card2);
    
    expect(result.compatible).toBe(true);
    expect(result.effectiveVersion).toBe('0.1.0');
    expect(result.missingRequired).toHaveLength(0);
  });

  it('should reject non-HA2HA agent', async () => {
    const card1 = await new AgentCardBuilder(identity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();
    
    // Card without HA2HA extension
    const pureA2aCard = {
      name: 'Pure A2A Agent',
      version: '1.0.0',
      capabilities: {
        streaming: true,
        extensions: [], // No HA2HA!
      },
      ha2ha: { publicKey: '', attestation: { protected: '', signature: '' } },
    };
    
    const result = negotiate(card1, pureA2aCard as any);
    
    expect(result.compatible).toBe(false);
    expect(result.error).toContain('Trust Level 0');
    expect(result.missingRequired).toContain('https://ha2haproject.org/spec/v1');
  });

  it('should negotiate effective trust level', async () => {
    const identity1 = await AgentIdentity.create('agent-1.example.ha2ha', 'Agent 1');
    const identity2 = await AgentIdentity.create('agent-2.example.ha2ha', 'Agent 2');
    
    const card1 = await new AgentCardBuilder(identity1)
      .setName('Agent 1')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();
    
    const card2 = await new AgentCardBuilder(identity2)
      .setName('Agent 2')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 3 })
      .build();
    
    // Our trust level for agent 2 is 4
    const result = negotiateCapabilities(card1, card2, 4);
    
    expect(result.compatible).toBe(true);
    // Effective trust is min(our trust for them: 4, their requirement: 3) = 3
    expect(result.effectiveTrustLevel).toBe(3);
  });
});

describe('Profile + Approval Integration', () => {
  let tempDir: string;
  let lifecycle: TaskLifecycle;
  let fatigueTracker: FatigueTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));
    
    tempDir = mkdtempSync(join(tmpdir(), 'integration-profile-approval-'));
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      validatorConfig: { requireSignature: false },
    });
    
    fatigueTracker = createFatigueTracker(5); // 5 approvals per hour
  });

  afterEach(() => {
    lifecycle.stopTimeoutChecker();
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should track fatigue through approvals', async () => {
    // Approve 5 tasks
    for (let i = 0; i < 5; i++) {
      const task = await lifecycle.submit({
        sourceAgent: `agent-${i}.example.ha2ha`,
        targetAgent: 'our-agent.example.ha2ha',
        payload: { action: 'read', id: i },
        trustLevel: 3,
      });
      
      const approval = ApprovalRequest.createUnsigned(
        task.task!.taskId,
        'admin@company.ha2ha',
        task.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);
      
      // Track in fatigue tracker
      fatigueTracker.recordApproval(task.task!.taskId, `agent-${i}.example.ha2ha`);
    }
    
    // Fatigue limit should be reached
    const status = fatigueTracker.getStatus();
    expect(status.approvalsThisHour).toBe(5);
    expect(status.exceeded).toBe(true);
  });

  it('should reset fatigue after hour', async () => {
    // Make some approvals
    fatigueTracker.recordApproval('task-1', 'agent-a');
    fatigueTracker.recordApproval('task-2', 'agent-b');
    fatigueTracker.recordApproval('task-3', 'agent-c');
    
    expect(fatigueTracker.getStatus().approvalsThisHour).toBe(3);
    
    // Advance time by 1 hour
    vi.advanceTimersByTime(61 * 60 * 1000);
    
    // Fatigue should be reset
    expect(fatigueTracker.getStatus().approvalsThisHour).toBe(0);
    expect(fatigueTracker.getStatus().exceeded).toBe(false);
  });

  it('should resolve pre-trusted entities', () => {
    const resolver = new PreTrustResolver([
      {
        name: 'Trusted Partner',
        agent_id: 'partner.trusted.ha2ha',
        level: 'trusted',
        domains: ['data-sync', 'reporting'],
      },
      {
        name: 'Brother\'s Agent',
        agent_id: 'michelangelo.mic.ha2ha',
        level: 'provisional',
        domains: ['*'],
      },
    ]);
    
    // Known trusted agent
    const result1 = resolver.resolve({ agentId: 'partner.trusted.ha2ha' });
    expect(result1.matched).toBe(true);
    expect(result1.trustLevel).toBe(TrustLevel.TRUSTED);
    
    // Brother's agent
    const result2 = resolver.resolve({ agentId: 'michelangelo.mic.ha2ha' });
    expect(result2.matched).toBe(true);
    expect(result2.trustLevel).toBe(TrustLevel.PROVISIONAL);
    
    // Unknown agent
    const result3 = resolver.resolve({ agentId: 'unknown.random.ha2ha' });
    expect(result3.matched).toBe(false);
  });
});

describe('Circuit Breaker + Workflow Depth Integration', () => {
  it('should prevent deep workflow cascades', () => {
    // Start with initial metadata
    let metadata = WorkflowDepthTracker.createInitialMetadata('task-1');
    
    // Check depth 1 - should be allowed
    expect(WorkflowDepthTracker.getDepth(metadata)).toBe(1);
    expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);
    
    // Delegate to depth 2
    metadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-2');
    expect(WorkflowDepthTracker.getDepth(metadata)).toBe(2);
    expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);
    
    // Delegate to depth 3 (maximum)
    metadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-3');
    expect(WorkflowDepthTracker.getDepth(metadata)).toBe(3);
    expect(WorkflowDepthTracker.checkDepth(3)).toBe(true);
    
    // Cannot delegate further
    expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(false);
    
    // Check depth 4 - should fail
    const depth4Result = WorkflowDepthTracker.checkDepthDetailed({
      ...metadata,
      workflowDepth: 4,
    });
    expect(depth4Result.allowed).toBe(false);
    expect(depth4Result.error?.depth).toBe(4);
  });

  it('should track workflow chain in task metadata', () => {
    // Create initial workflow metadata
    const initialMeta = WorkflowDepthTracker.createInitialMetadata('task-1');
    
    expect(WorkflowDepthTracker.getDepth(initialMeta)).toBe(1);
    expect(WorkflowDepthTracker.getTaskChain(initialMeta)).toEqual(['task-1']);
    
    // Delegate to task-2
    const delegated1 = WorkflowDepthTracker.incrementDepth(initialMeta, 'task-2');
    expect(WorkflowDepthTracker.getDepth(delegated1)).toBe(2);
    expect(WorkflowDepthTracker.getTaskChain(delegated1)).toEqual(['task-1', 'task-2']);
    
    // Delegate to task-3
    const delegated2 = WorkflowDepthTracker.incrementDepth(delegated1, 'task-3');
    expect(WorkflowDepthTracker.getDepth(delegated2)).toBe(3);
    expect(WorkflowDepthTracker.getTaskChain(delegated2)).toEqual(['task-1', 'task-2', 'task-3']);
    
    // Origin task should be preserved
    expect(delegated2.originTaskId).toBe('task-1');
  });

  it('should integrate with task metadata creation', () => {
    // Create HA2HA task metadata
    const ha2haMetadata = createTaskMetadata({
      requestingAgent: 'agent-a.ha2ha',
      requestingHuman: 'human@example.com',
      trustLevel: 3,
    });
    
    // Create workflow metadata
    const workflowMeta = WorkflowDepthTracker.createInitialMetadata('task-origin');
    
    // Combine them
    const combined = {
      ...ha2haMetadata,
      workflowDepth: WorkflowDepthTracker.getDepth(workflowMeta),
      taskChain: WorkflowDepthTracker.getTaskChain(workflowMeta),
    };
    
    expect(combined.trustLevel).toBe(3);
    expect(combined.workflowDepth).toBe(1);
    expect(combined.taskChain).toEqual(['task-origin']);
  });
});

describe('Full End-to-End Flow', () => {
  let tempDir: string;
  let identity: AgentIdentity;
  let trustRegistry: TrustRegistry;
  let lifecycle: TaskLifecycle;
  let auditChain: AuditChain;
  let circuitRegistry: CircuitBreakerRegistry;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T12:00:00Z'));
    
    tempDir = mkdtempSync(join(tmpdir(), 'e2e-'));
    
    identity = await AgentIdentity.create('our-agent.example.ha2ha', 'Our Agent');
    trustRegistry = new TrustRegistry();
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      validatorConfig: { requireSignature: false },
    });
    auditChain = createAuditChain(
      join(tempDir, 'audit.ndjson'),
      identity.agentId
    );
    await auditChain.load();
    circuitRegistry = new CircuitBreakerRegistry(trustRegistry);
  });

  afterEach(() => {
    lifecycle.stopTimeoutChecker();
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle complete happy path', async () => {
    const peerAgent = 'partner.external.ha2ha';
    
    // 1. Establish trust (starts at UNKNOWN)
    const trustEntry = trustRegistry.getTrust(peerAgent);
    expect(trustEntry.level).toBe(TrustLevel.UNKNOWN);
    
    // 2. Log federation request
    await auditChain.append({
      eventType: AuditEventType.FEDERATION_REQUEST,
      sourceAgentId: peerAgent,
      targetAgentId: identity.agentId,
      trustLevel: trustEntry.level,
      outcome: 'pending',
    });
    
    // 3. Check circuit breaker (should be closed)
    const breaker = circuitRegistry.getCircuit(peerAgent);
    const circuitCheck = breaker.canProceed();
    expect(circuitCheck.allowed).toBe(true);
    
    // 4. Submit task
    const task = await lifecycle.submit({
      sourceAgent: peerAgent,
      targetAgent: identity.agentId,
      payload: { 
        action: 'fetch_weather', 
        location: 'New York',
      },
      trustLevel: trustEntry.level,
      description: 'Get weather data',
    });
    expect(task.success).toBe(true);
    
    // 5. Log task submission
    await auditChain.append({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: peerAgent,
      targetAgentId: identity.agentId,
      taskId: task.task!.taskId,
      trustLevel: trustEntry.level,
      outcome: 'pending',
    });
    
    // 6. Human approves
    const approval = ApprovalRequest.createUnsigned(
      task.task!.taskId,
      'admin@company.ha2ha',
      task.task!.payloadHash,
      ApprovalScope.SINGLE
    );
    const approvalResult = await lifecycle.approveWithRequest(approval);
    expect(approvalResult.success).toBe(true);
    
    // 7. Log approval
    await auditChain.append({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: peerAgent,
      targetAgentId: identity.agentId,
      taskId: task.task!.taskId,
      humanId: 'admin@company.ha2ha',
      trustLevel: trustEntry.level,
      outcome: 'success',
    });
    
    // 8. Execute task
    const execResult = await lifecycle.execute(task.task!.taskId, async () => {
      return { temperature: 72, conditions: 'sunny' };
    });
    expect(execResult.success).toBe(true);
    
    // 9. Record success with circuit breaker
    breaker.recordSuccess();
    
    // 10. Log completion
    await auditChain.append({
      eventType: AuditEventType.TASK_COMPLETED,
      sourceAgentId: peerAgent,
      targetAgentId: identity.agentId,
      taskId: task.task!.taskId,
      trustLevel: trustEntry.level,
      outcome: 'success',
    });
    
    // 11. Verify final states
    expect(lifecycle.getTask(task.task!.taskId)?.state).toBe(TaskState.COMPLETED);
    expect(breaker.totalSuccesses).toBe(1);
    expect(verifyChain(auditChain.entries).valid).toBe(true);
  });

  it('should handle security incident flow', async () => {
    const maliciousAgent = 'attacker.malicious.ha2ha';
    
    // 1. Unknown agent appears
    const trustEntry = trustRegistry.getTrust(maliciousAgent);
    const breaker = circuitRegistry.getCircuit(maliciousAgent);
    
    // 2. Submit suspicious task
    const task = await lifecycle.submit({
      sourceAgent: maliciousAgent,
      targetAgent: identity.agentId,
      payload: { 
        action: 'exec_command', 
        command: 'rm -rf /',  // Suspicious!
      },
      trustLevel: trustEntry.level,
    });
    
    // 3. Human detects and rejects
    await lifecycle.reject(
      task.task!.taskId,
      'security@company.ha2ha',
      'Malicious command execution attempt',
      'block'
    );
    
    // 4. Record critical violation
    breaker.recordFailure(ViolationSeverity.CRITICAL, 'Command injection attempt');
    trustEntry.recordViolation(ViolationSeverity.CRITICAL, 'Command injection attempt');
    
    // 5. Log security alert
    await auditChain.append({
      eventType: AuditEventType.SECURITY_ALERT,
      sourceAgentId: maliciousAgent,
      targetAgentId: identity.agentId,
      taskId: task.task!.taskId,
      trustLevel: 0,
      outcome: 'rejected',
      details: {
        alertType: 'command_injection',
        payload: task.task!.toJSON().payload,
      },
    });
    
    // 6. Verify security responses
    expect(trustEntry.level).toBe(TrustLevel.BLOCKED);
    expect(breaker.isOpen).toBe(true);
    expect(lifecycle.getTask(task.task!.taskId)?.state).toBe(TaskState.CANCELED);
    
    // 7. Future requests from this agent should be blocked
    const check = breaker.canProceed();
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Command injection');
  });
});
