/**
 * Tests for ApprovalQueue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ApprovalQueue } from '../approval-queue';
import { ApprovalRequest } from '../approval-request';
import { PendingTask } from '../pending-task';
import { TaskState, ApprovalError, ApprovalScope } from '../types';

describe('ApprovalQueue', () => {
  let tempDir: string;
  let queue: ApprovalQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    tempDir = mkdtempSync(join(tmpdir(), 'approval-queue-test-'));
    queue = new ApprovalQueue({
      storePath: tempDir,
      autoPersist: false, // Disable for faster tests
      autoCheckTimeouts: false,
      validatorConfig: {
        requireSignature: false,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const defaultTaskOptions = {
    sourceAgent: 'agent-a.example.ha2ha',
    targetAgent: 'agent-b.example.ha2ha',
    payload: { action: 'read', path: '/tmp/file.txt' },
    trustLevel: 3,
  };

  describe('add', () => {
    it('should add a task to the queue', async () => {
      const task = await queue.add(defaultTaskOptions);

      expect(task).toBeInstanceOf(PendingTask);
      expect(task.state).toBe(TaskState.SUBMITTED);
    });

    it('should generate unique task IDs', async () => {
      const task1 = await queue.add(defaultTaskOptions);
      const task2 = await queue.add(defaultTaskOptions);

      expect(task1.taskId).not.toBe(task2.taskId);
    });

    it('should notify approval callbacks', async () => {
      const callback = vi.fn();
      queue.onApprovalNeeded(callback);

      await queue.add(defaultTaskOptions);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAgent: 'agent-a.example.ha2ha',
          state: TaskState.SUBMITTED,
        })
      );
    });
  });

  describe('get', () => {
    it('should retrieve a task by ID', async () => {
      const task = await queue.add(defaultTaskOptions);
      const retrieved = queue.get(task.taskId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.taskId).toBe(task.taskId);
    });

    it('should return null for non-existent task', () => {
      const retrieved = queue.get('non-existent-id');

      expect(retrieved).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a task from the queue', async () => {
      const task = await queue.add(defaultTaskOptions);
      const removed = queue.remove(task.taskId);

      expect(removed).toBe(true);
      expect(queue.get(task.taskId)).toBeNull();
    });

    it('should return false for non-existent task', () => {
      const removed = queue.remove('non-existent-id');

      expect(removed).toBe(false);
    });
  });

  describe('approve', () => {
    it('should approve a pending task', async () => {
      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );

      const result = await queue.approve(approval);

      expect(result.success).toBe(true);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.WORKING);
    });

    it('should return error for non-existent task', async () => {
      const approval = ApprovalRequest.createUnsigned(
        'non-existent-id',
        'approver@example.ha2ha',
        'fake-hash',
        ApprovalScope.SINGLE
      );

      const result = await queue.approve(approval);

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_NOT_FOUND);
    });

    it('should return error for hash mismatch', async () => {
      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        'wrong-hash',
        ApprovalScope.SINGLE
      );

      const result = await queue.approve(approval);

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.HASH_MISMATCH);
    });

    it('should notify state change callbacks', async () => {
      const callback = vi.fn();
      queue.onStateChange(callback);

      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );

      await queue.approve(approval);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ state: TaskState.WORKING }),
        TaskState.SUBMITTED
      );
    });
  });

  describe('reject', () => {
    it('should reject a pending task', async () => {
      const task = await queue.add(defaultTaskOptions);

      const result = await queue.reject({
        taskId: task.taskId,
        rejectedBy: 'rejector@example.ha2ha',
        reason: 'Not authorized',
        trustAction: 'none',
        createdAt: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.CANCELED);
    });

    it('should return error for non-existent task', async () => {
      const result = await queue.reject({
        taskId: 'non-existent-id',
        rejectedBy: 'rejector@example.ha2ha',
        reason: 'Not authorized',
        trustAction: 'none',
        createdAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_NOT_FOUND);
    });

    it('should return error for non-pending task', async () => {
      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      const result = await queue.reject({
        taskId: task.taskId,
        rejectedBy: 'rejector@example.ha2ha',
        reason: 'Changed my mind',
        trustAction: 'none',
        createdAt: new Date().toISOString(),
      });

      expect(result.success).toBe(false);
    });
  });

  describe('checkTimeouts', () => {
    it('should timeout expired tasks', async () => {
      const task = await queue.add(defaultTaskOptions);

      // Advance past expiry
      vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

      const timedOut = await queue.checkTimeouts();

      expect(timedOut).toContain(task.taskId);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.CANCELED);
    });

    it('should not timeout non-expired tasks', async () => {
      const task = await queue.add(defaultTaskOptions);

      // Advance only 30 minutes
      vi.advanceTimersByTime(30 * 60 * 1000);

      const timedOut = await queue.checkTimeouts();

      expect(timedOut).toHaveLength(0);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.SUBMITTED);
    });

    it('should notify state change on timeout', async () => {
      const callback = vi.fn();
      queue.onStateChange(callback);

      await queue.add(defaultTaskOptions);
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      await queue.checkTimeouts();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ state: TaskState.CANCELED }),
        TaskState.SUBMITTED
      );
    });
  });

  describe('listPending', () => {
    it('should list only pending tasks', async () => {
      const task1 = await queue.add(defaultTaskOptions);
      const task2 = await queue.add(defaultTaskOptions);
      
      // Approve task1
      const approval = ApprovalRequest.createUnsigned(
        task1.taskId,
        'approver@example.ha2ha',
        task1.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      const pending = queue.listPending();

      expect(pending).toHaveLength(1);
      expect(pending[0].taskId).toBe(task2.taskId);
    });
  });

  describe('listAll', () => {
    it('should list all tasks', async () => {
      const task1 = await queue.add(defaultTaskOptions);
      const task2 = await queue.add(defaultTaskOptions);
      
      const all = queue.listAll();

      expect(all).toHaveLength(2);
    });
  });

  describe('listByState', () => {
    it('should list tasks by state', async () => {
      const task1 = await queue.add(defaultTaskOptions);
      await queue.add(defaultTaskOptions);
      
      const approval = ApprovalRequest.createUnsigned(
        task1.taskId,
        'approver@example.ha2ha',
        task1.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      const working = queue.listByState(TaskState.WORKING);
      const submitted = queue.listByState(TaskState.SUBMITTED);

      expect(working).toHaveLength(1);
      expect(submitted).toHaveLength(1);
    });
  });

  describe('markCompleted', () => {
    it('should mark working task as completed', async () => {
      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      const result = queue.markCompleted(task.taskId);

      expect(result).toBe(true);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.COMPLETED);
    });

    it('should return false for non-working task', async () => {
      const task = await queue.add(defaultTaskOptions);

      const result = queue.markCompleted(task.taskId);

      expect(result).toBe(false);
    });
  });

  describe('markFailed', () => {
    it('should mark working task as failed', async () => {
      const task = await queue.add(defaultTaskOptions);
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      const result = queue.markFailed(task.taskId);

      expect(result).toBe(true);
      expect(queue.get(task.taskId)?.state).toBe(TaskState.FAILED);
    });
  });

  describe('persistence', () => {
    it('should save and load tasks', async () => {
      const persistQueue = new ApprovalQueue({
        storePath: tempDir,
        autoPersist: true,
        validatorConfig: { requireSignature: false },
      });

      const task = await persistQueue.add(defaultTaskOptions);
      await persistQueue.save();

      // Create new queue and load
      const loadedQueue = new ApprovalQueue({
        storePath: tempDir,
        autoPersist: true,
        validatorConfig: { requireSignature: false },
      });
      await loadedQueue.load();

      const loadedTask = loadedQueue.get(task.taskId);
      expect(loadedTask).toBeDefined();
      expect(loadedTask?.payloadHash).toBe(task.payloadHash);
    });
  });

  describe('counts', () => {
    it('should track pending count', async () => {
      await queue.add(defaultTaskOptions);
      await queue.add(defaultTaskOptions);

      expect(queue.pendingCount).toBe(2);
    });

    it('should track total count', async () => {
      const task = await queue.add(defaultTaskOptions);
      await queue.add(defaultTaskOptions);
      
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );
      await queue.approve(approval);

      expect(queue.totalCount).toBe(2);
      expect(queue.pendingCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all tasks', async () => {
      await queue.add(defaultTaskOptions);
      await queue.add(defaultTaskOptions);

      queue.clear();

      expect(queue.totalCount).toBe(0);
    });
  });
});
