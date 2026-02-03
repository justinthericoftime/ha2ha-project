/**
 * Integration Tests: Full Approval Flow
 * 
 * Tests the complete approval workflow from task submission to completion,
 * verifying the key invariant that tasks cannot transition from SUBMITTED
 * to WORKING without a valid ha2ha/approve.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  TaskLifecycle,
  ApprovalRequest,
  ApprovalQueue,
  ApprovalValidator,
  TaskState,
  ApprovalScope,
  ApprovalError,
  computePayloadHash,
} from '../index';

describe('Full Approval Flow', () => {
  let tempDir: string;
  let lifecycle: TaskLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    tempDir = mkdtempSync(join(tmpdir(), 'full-flow-test-'));
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      autoPersist: true,
      validatorConfig: {
        requireSignature: false,
      },
    });
  });

  afterEach(() => {
    lifecycle.stopTimeoutChecker();
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should complete full happy path: submit -> approve -> execute -> complete', async () => {
    // 1. Submit task
    const submitResult = await lifecycle.submit({
      sourceAgent: 'agent-requester.example.ha2ha',
      targetAgent: 'agent-executor.example.ha2ha',
      payload: {
        action: 'read_file',
        params: { path: '/data/important.txt' },
      },
      trustLevel: 3,
      description: 'Read important data file',
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.task?.state).toBe(TaskState.SUBMITTED);

    // 2. Verify task is pending
    const pendingTasks = lifecycle.listPending();
    expect(pendingTasks).toHaveLength(1);
    expect(pendingTasks[0].taskId).toBe(submitResult.task!.taskId);

    // 3. Create approval with correct hash
    const approval = ApprovalRequest.createUnsigned(
      submitResult.task!.taskId,
      'human-operator@company.ha2ha',
      submitResult.task!.payloadHash,
      ApprovalScope.SINGLE
    );

    // 4. Approve task
    const approvalResult = await lifecycle.approveWithRequest(approval);
    expect(approvalResult.success).toBe(true);
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.WORKING);

    // 5. Execute task
    const executeResult = await lifecycle.execute(submitResult.task!.taskId, async (task) => {
      // Simulate reading the file
      return { content: 'file contents', bytes: 1024 };
    });

    expect(executeResult.success).toBe(true);
    expect(executeResult.result).toEqual({ content: 'file contents', bytes: 1024 });

    // 6. Verify final state
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.COMPLETED);
  });

  it('should handle rejection flow: submit -> reject -> canceled', async () => {
    // 1. Submit task
    const submitResult = await lifecycle.submit({
      sourceAgent: 'suspicious-agent.malware.ha2ha',
      targetAgent: 'secure-server.company.ha2ha',
      payload: {
        action: 'delete_all',
        params: { path: '/' },
      },
      trustLevel: 1,
    });

    expect(submitResult.success).toBe(true);

    // 2. Human reviews and rejects
    const rejectResult = await lifecycle.reject(
      submitResult.task!.taskId,
      'security-admin@company.ha2ha',
      'Dangerous operation from untrusted agent',
      'block'
    );

    expect(rejectResult.success).toBe(true);
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.CANCELED);

    // 3. Verify task cannot be executed
    const executeResult = await lifecycle.execute(submitResult.task!.taskId, async () => 'bad');
    expect(executeResult.success).toBe(false);
  });

  it('should handle timeout flow: submit -> wait -> auto-cancel', async () => {
    // 1. Submit task
    const submitResult = await lifecycle.submit({
      sourceAgent: 'agent-a.example.ha2ha',
      targetAgent: 'agent-b.example.ha2ha',
      payload: { action: 'test' },
      trustLevel: 2,
    });

    expect(submitResult.task?.state).toBe(TaskState.SUBMITTED);

    // 2. Wait for timeout (1 hour + buffer)
    vi.advanceTimersByTime(61 * 60 * 1000);

    // 3. Check timeouts
    const timedOut = await lifecycle.checkTimeouts();
    expect(timedOut).toContain(submitResult.task!.taskId);

    // 4. Verify canceled
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.CANCELED);
  });

  it('should detect and reject hash mismatch (tampering)', async () => {
    // 1. Submit original task
    const submitResult = await lifecycle.submit({
      sourceAgent: 'agent-a.example.ha2ha',
      targetAgent: 'agent-b.example.ha2ha',
      payload: { 
        action: 'transfer',
        amount: 100,
        recipient: 'alice@example.com',
      },
      trustLevel: 3,
    });

    // 2. Attacker tries to approve with different payload hash
    const tamperedPayloadHash = computePayloadHash({
      action: 'transfer',
      amount: 10000, // Attacker changed amount!
      recipient: 'attacker@evil.com', // And recipient!
    });

    const tamperedApproval = ApprovalRequest.createUnsigned(
      submitResult.task!.taskId,
      'compromised-approver@company.ha2ha',
      tamperedPayloadHash,
      ApprovalScope.SINGLE
    );

    // 3. Approval MUST be rejected
    const approvalResult = await lifecycle.approveWithRequest(tamperedApproval);
    expect(approvalResult.success).toBe(false);
    expect(approvalResult.error).toBe(ApprovalError.HASH_MISMATCH);

    // 4. Task should still be SUBMITTED (not executed!)
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.SUBMITTED);
  });

  it('should handle multiple concurrent tasks', async () => {
    // Submit multiple tasks
    const tasks = await Promise.all([
      lifecycle.submit({
        sourceAgent: 'agent-1',
        targetAgent: 'server',
        payload: { id: 1 },
        trustLevel: 3,
      }),
      lifecycle.submit({
        sourceAgent: 'agent-2',
        targetAgent: 'server',
        payload: { id: 2 },
        trustLevel: 3,
      }),
      lifecycle.submit({
        sourceAgent: 'agent-3',
        targetAgent: 'server',
        payload: { id: 3 },
        trustLevel: 3,
      }),
    ]);

    expect(lifecycle.listPending()).toHaveLength(3);

    // Approve task 1
    await lifecycle.approveWithRequest(
      ApprovalRequest.createUnsigned(
        tasks[0].task!.taskId,
        'admin',
        tasks[0].task!.payloadHash,
        ApprovalScope.SINGLE
      )
    );

    // Reject task 2
    await lifecycle.reject(tasks[1].task!.taskId, 'admin', 'Not needed');

    // Leave task 3 pending
    expect(lifecycle.listPending()).toHaveLength(1);
    expect(lifecycle.listByState(TaskState.WORKING)).toHaveLength(1);
    expect(lifecycle.listByState(TaskState.CANCELED)).toHaveLength(1);
  });

  it('should support failed execution flow', async () => {
    // Submit and approve task
    const submitResult = await lifecycle.submit({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: { action: 'risky_operation' },
      trustLevel: 3,
    });

    await lifecycle.approveWithRequest(
      ApprovalRequest.createUnsigned(
        submitResult.task!.taskId,
        'admin',
        submitResult.task!.payloadHash,
        ApprovalScope.SINGLE
      )
    );

    // Execute fails
    const result = await lifecycle.execute(submitResult.task!.taskId, async () => {
      throw new Error('Operation failed: network timeout');
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('network timeout');
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.FAILED);
  });

  it('should persist and reload state', async () => {
    // Submit tasks
    const task1 = await lifecycle.submit({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: { id: 1 },
      trustLevel: 3,
    });

    const task2 = await lifecycle.submit({
      sourceAgent: 'agent-c',
      targetAgent: 'agent-d',
      payload: { id: 2 },
      trustLevel: 2,
    });

    // Approve one
    await lifecycle.approveWithRequest(
      ApprovalRequest.createUnsigned(
        task1.task!.taskId,
        'admin',
        task1.task!.payloadHash,
        ApprovalScope.SINGLE
      )
    );

    // Create new lifecycle pointing to same store
    const newLifecycle = new TaskLifecycle({
      storePath: tempDir,
      validatorConfig: { requireSignature: false },
    });
    await newLifecycle.load();

    // Verify state was preserved
    expect(newLifecycle.getTask(task1.task!.taskId)?.state).toBe(TaskState.WORKING);
    expect(newLifecycle.getTask(task2.task!.taskId)?.state).toBe(TaskState.SUBMITTED);

    newLifecycle.stopTimeoutChecker();
  });

  it('should enforce approval requirement strictly', async () => {
    const submitResult = await lifecycle.submit({
      sourceAgent: 'malicious-agent',
      targetAgent: 'target',
      payload: { dangerous: true },
      trustLevel: 1,
    });

    // Try many ways to bypass approval - all should fail

    // Direct execute without approval
    const exec1 = await lifecycle.execute(submitResult.task!.taskId, async () => 'bypass');
    expect(exec1.success).toBe(false);

    // Wrong task ID
    const fakeApproval1 = ApprovalRequest.createUnsigned(
      'fake-task-id',
      'admin',
      submitResult.task!.payloadHash,
      ApprovalScope.SINGLE
    );
    const result1 = await lifecycle.approveWithRequest(fakeApproval1);
    expect(result1.success).toBe(false);

    // Wrong hash
    const fakeApproval2 = ApprovalRequest.createUnsigned(
      submitResult.task!.taskId,
      'admin',
      'completely-wrong-hash',
      ApprovalScope.SINGLE
    );
    const result2 = await lifecycle.approveWithRequest(fakeApproval2);
    expect(result2.success).toBe(false);

    // Task should still be safely in SUBMITTED
    expect(lifecycle.getTask(submitResult.task!.taskId)?.state).toBe(TaskState.SUBMITTED);
  });
});

describe('Hash Commitment Verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should compute consistent hashes', () => {
    const payload = {
      action: 'read',
      params: { path: '/tmp/file.txt', mode: 'r' },
    };

    const hash1 = computePayloadHash(payload);
    const hash2 = computePayloadHash(payload);

    expect(hash1).toBe(hash2);
  });

  it('should canonicalize key order', () => {
    const payload1 = { b: 2, a: 1 };
    const payload2 = { a: 1, b: 2 };

    expect(computePayloadHash(payload1)).toBe(computePayloadHash(payload2));
  });

  it('should detect any modification', () => {
    const original = { amount: 100 };
    const originalHash = computePayloadHash(original);

    // All of these should produce different hashes
    expect(computePayloadHash({ amount: 101 })).not.toBe(originalHash);
    expect(computePayloadHash({ amount: '100' })).not.toBe(originalHash);
    expect(computePayloadHash({ Amount: 100 })).not.toBe(originalHash);
    expect(computePayloadHash({ amount: 100, extra: true })).not.toBe(originalHash);
    expect(computePayloadHash({})).not.toBe(originalHash);
  });
});
