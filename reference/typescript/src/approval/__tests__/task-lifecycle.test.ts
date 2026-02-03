/**
 * Tests for TaskLifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TaskLifecycle, createTaskLifecycle, assertApprovalRequired } from '../task-lifecycle';
import { ApprovalRequest } from '../approval-request';
import { PendingTask } from '../pending-task';
import { TaskState, ApprovalError, ApprovalScope } from '../types';

describe('TaskLifecycle', () => {
  let tempDir: string;
  let lifecycle: TaskLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    tempDir = mkdtempSync(join(tmpdir(), 'task-lifecycle-test-'));
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      autoPersist: false,
      autoCheckTimeouts: false,
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

  const defaultTaskOptions = {
    sourceAgent: 'agent-a.example.ha2ha',
    targetAgent: 'agent-b.example.ha2ha',
    payload: { action: 'read', path: '/tmp/file.txt' },
    trustLevel: 3,
  };

  describe('submit', () => {
    it('should submit task in SUBMITTED state', async () => {
      const result = await lifecycle.submit(defaultTaskOptions);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task?.state).toBe(TaskState.SUBMITTED);
    });

    it('should store task in queue', async () => {
      const result = await lifecycle.submit(defaultTaskOptions);

      const task = lifecycle.getTask(result.task!.taskId);
      expect(task).toBeDefined();
    });
  });

  describe('approveWithRequest', () => {
    it('should approve task and transition to WORKING', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );

      const result = await lifecycle.approveWithRequest(approval);

      expect(result.success).toBe(true);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.WORKING);
    });

    it('should reject with TASK_NOT_FOUND for missing task', async () => {
      const approval = ApprovalRequest.createUnsigned(
        'non-existent-id',
        'approver@example.ha2ha',
        'fake-hash',
        ApprovalScope.SINGLE
      );

      const result = await lifecycle.approveWithRequest(approval);

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_NOT_FOUND);
    });

    it('should reject with HASH_MISMATCH for wrong hash', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        'wrong-hash-value',
        ApprovalScope.SINGLE
      );

      const result = await lifecycle.approveWithRequest(approval);

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.HASH_MISMATCH);
    });
  });

  describe('reject', () => {
    it('should reject task and transition to CANCELED', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const result = await lifecycle.reject(
        task.taskId,
        'rejector@example.ha2ha',
        'Not authorized'
      );

      expect(result.success).toBe(true);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.CANCELED);
    });
  });

  describe('complete', () => {
    it('should mark WORKING task as COMPLETED', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      const result = lifecycle.complete(task.taskId);

      expect(result).toBe(true);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.COMPLETED);
    });

    it('should return false for non-WORKING task', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const result = lifecycle.complete(task.taskId);

      expect(result).toBe(false);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.SUBMITTED);
    });
  });

  describe('fail', () => {
    it('should mark WORKING task as FAILED', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      const result = lifecycle.fail(task.taskId);

      expect(result).toBe(true);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.FAILED);
    });
  });

  describe('execute', () => {
    it('should execute task and mark as COMPLETED on success', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      const result = await lifecycle.execute(task.taskId, async (t) => {
        return 'success result';
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success result');
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.COMPLETED);
    });

    it('should mark as FAILED on error', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      const result = await lifecycle.execute(task.taskId, async () => {
        throw new Error('Execution failed');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.FAILED);
    });

    it('should fail for non-WORKING task', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      const result = await lifecycle.execute(task.taskId, async () => 'result');

      expect(result.success).toBe(false);
      expect(result.error).toContain('SUBMITTED');
    });
  });

  describe('checkTimeouts', () => {
    it('should timeout expired tasks', async () => {
      const submitResult = await lifecycle.submit(defaultTaskOptions);
      const task = submitResult.task!;

      // Advance past expiry
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const timedOut = await lifecycle.checkTimeouts();

      expect(timedOut).toContain(task.taskId);
      expect(lifecycle.getTask(task.taskId)?.state).toBe(TaskState.CANCELED);
    });
  });

  describe('listPending', () => {
    it('should list only pending tasks', async () => {
      const result1 = await lifecycle.submit(defaultTaskOptions);
      const result2 = await lifecycle.submit(defaultTaskOptions);

      const approval = ApprovalRequest.createUnsigned(
        result1.task!.taskId,
        'approver@example.ha2ha',
        result1.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      const pending = lifecycle.listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].taskId).toBe(result2.task!.taskId);
    });
  });

  describe('listByState', () => {
    it('should filter by state', async () => {
      const result1 = await lifecycle.submit(defaultTaskOptions);
      await lifecycle.submit(defaultTaskOptions);

      const approval = ApprovalRequest.createUnsigned(
        result1.task!.taskId,
        'approver@example.ha2ha',
        result1.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      expect(lifecycle.listByState(TaskState.WORKING)).toHaveLength(1);
      expect(lifecycle.listByState(TaskState.SUBMITTED)).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      const result1 = await lifecycle.submit(defaultTaskOptions);
      const result2 = await lifecycle.submit(defaultTaskOptions);
      await lifecycle.submit(defaultTaskOptions);

      const approval = ApprovalRequest.createUnsigned(
        result1.task!.taskId,
        'approver@example.ha2ha',
        result1.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      await lifecycle.reject(
        result2.task!.taskId,
        'rejector@example.ha2ha',
        'Rejected'
      );

      const stats = lifecycle.getStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.working).toBe(1);
      expect(stats.canceled).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed/failed/canceled tasks', async () => {
      const result1 = await lifecycle.submit(defaultTaskOptions);
      const result2 = await lifecycle.submit(defaultTaskOptions);

      // Approve and complete task1
      const approval = ApprovalRequest.createUnsigned(
        result1.task!.taskId,
        'approver@example.ha2ha',
        result1.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);
      lifecycle.complete(result1.task!.taskId);

      // Reject task2
      await lifecycle.reject(
        result2.task!.taskId,
        'rejector@example.ha2ha',
        'Rejected'
      );

      // Advance time past cleanup threshold
      vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours

      const removed = lifecycle.cleanup();

      expect(removed).toBe(2);
      expect(lifecycle.listAll()).toHaveLength(0);
    });

    it('should not remove tasks newer than threshold', async () => {
      const result1 = await lifecycle.submit(defaultTaskOptions);

      const approval = ApprovalRequest.createUnsigned(
        result1.task!.taskId,
        'approver@example.ha2ha',
        result1.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);
      lifecycle.complete(result1.task!.taskId);

      // Only advance 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000);

      const removed = lifecycle.cleanup();

      expect(removed).toBe(0);
      expect(lifecycle.listAll()).toHaveLength(1);
    });
  });

  describe('callbacks', () => {
    it('should notify on approval needed', async () => {
      const callback = vi.fn();
      lifecycle.onApprovalNeeded(callback);

      await lifecycle.submit(defaultTaskOptions);

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should notify on state change', async () => {
      const callback = vi.fn();
      lifecycle.onStateChange(callback);

      const result = await lifecycle.submit(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        result.task!.taskId,
        'approver@example.ha2ha',
        result.task!.payloadHash,
        ApprovalScope.SINGLE
      );
      await lifecycle.approveWithRequest(approval);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ state: TaskState.WORKING }),
        TaskState.SUBMITTED
      );
    });
  });
});

describe('createTaskLifecycle', () => {
  it('should create lifecycle with default config', () => {
    const lifecycle = createTaskLifecycle();
    lifecycle.stopTimeoutChecker();

    expect(lifecycle).toBeInstanceOf(TaskLifecycle);
  });
});

describe('assertApprovalRequired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not throw for SUBMITTED task', () => {
    const task = PendingTask.create({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: {},
      trustLevel: 1,
    });

    expect(() => assertApprovalRequired(task)).not.toThrow();
  });

  it('should not throw for WORKING task', () => {
    const task = PendingTask.create({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: {},
      trustLevel: 1,
    });
    task.approve();

    expect(() => assertApprovalRequired(task)).not.toThrow();
  });

  it('should throw for terminal states', () => {
    const task = PendingTask.create({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: {},
      trustLevel: 1,
    });
    task.reject();

    expect(() => assertApprovalRequired(task)).toThrow('CANCELED');
  });
});

describe('Key Invariant: SUBMITTED -> WORKING requires approval', () => {
  let tempDir: string;
  let lifecycle: TaskLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    tempDir = mkdtempSync(join(tmpdir(), 'invariant-test-'));
    lifecycle = new TaskLifecycle({
      storePath: tempDir,
      autoPersist: false,
      autoCheckTimeouts: false,
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

  it('task MUST NOT transition to WORKING without approval', async () => {
    const result = await lifecycle.submit({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: { dangerous: true },
      trustLevel: 1,
    });

    // Verify task is SUBMITTED
    expect(lifecycle.getTask(result.task!.taskId)?.state).toBe(TaskState.SUBMITTED);

    // Try to execute without approval - should fail
    const execResult = await lifecycle.execute(result.task!.taskId, async () => 'bad');
    expect(execResult.success).toBe(false);

    // Task should still be SUBMITTED
    expect(lifecycle.getTask(result.task!.taskId)?.state).toBe(TaskState.SUBMITTED);
  });

  it('task CAN transition to WORKING with valid approval', async () => {
    const result = await lifecycle.submit({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: { safe: true },
      trustLevel: 3,
    });

    // Create valid approval with correct hash
    const approval = ApprovalRequest.createUnsigned(
      result.task!.taskId,
      'human@example.ha2ha',
      result.task!.payloadHash,
      ApprovalScope.SINGLE
    );

    // Approve
    const approvalResult = await lifecycle.approveWithRequest(approval);
    expect(approvalResult.success).toBe(true);

    // Task should be WORKING
    expect(lifecycle.getTask(result.task!.taskId)?.state).toBe(TaskState.WORKING);

    // Now execute should work
    const execResult = await lifecycle.execute(result.task!.taskId, async () => 'done');
    expect(execResult.success).toBe(true);
    expect(lifecycle.getTask(result.task!.taskId)?.state).toBe(TaskState.COMPLETED);
  });

  it('approval with wrong hash MUST be rejected', async () => {
    const result = await lifecycle.submit({
      sourceAgent: 'agent-a',
      targetAgent: 'agent-b',
      payload: { original: true },
      trustLevel: 3,
    });

    // Create approval with WRONG hash (simulating tampering)
    const approval = ApprovalRequest.createUnsigned(
      result.task!.taskId,
      'human@example.ha2ha',
      'tampered-hash-value-that-does-not-match',
      ApprovalScope.SINGLE
    );

    // Approval MUST be rejected
    const approvalResult = await lifecycle.approveWithRequest(approval);
    expect(approvalResult.success).toBe(false);
    expect(approvalResult.error).toBe(ApprovalError.HASH_MISMATCH);

    // Task should still be SUBMITTED
    expect(lifecycle.getTask(result.task!.taskId)?.state).toBe(TaskState.SUBMITTED);
  });
});
