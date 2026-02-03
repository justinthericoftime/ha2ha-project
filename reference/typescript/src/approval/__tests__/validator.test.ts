/**
 * Tests for ApprovalValidator
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ApprovalValidator, createValidator } from '../validator';
import { PendingTask } from '../pending-task';
import { ApprovalRequest } from '../approval-request';
import { TaskState, ApprovalError, ApprovalScope } from '../types';
import { computePayloadHash } from '../hash';

describe('ApprovalValidator', () => {
  let validator: ApprovalValidator;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    validator = new ApprovalValidator({
      requireSignature: false, // Disable signature for unit tests
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createTask = () =>
    PendingTask.create({
      sourceAgent: 'agent-a.example.ha2ha',
      targetAgent: 'agent-b.example.ha2ha',
      payload: { action: 'read', path: '/tmp/file.txt' },
      trustLevel: 3,
    });

  const createApproval = (task: PendingTask) =>
    ApprovalRequest.createUnsigned(
      task.taskId,
      'approver@example.ha2ha',
      task.payloadHash,
      ApprovalScope.SINGLE
    );

  describe('validate', () => {
    it('should approve valid approval request', async () => {
      const task = createTask();
      const approval = createApproval(task);

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
    });

    it('should reject if task is not in SUBMITTED state', async () => {
      const task = createTask();
      task.approve(); // Move to WORKING state
      const approval = createApproval(task);

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_ALREADY_APPROVED);
    });

    it('should reject if task is already canceled', async () => {
      const task = createTask();
      task.reject(); // Move to CANCELED state
      const approval = createApproval(task);

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_ALREADY_REJECTED);
    });

    it('should reject if task has expired', async () => {
      const task = createTask();
      const approval = createApproval(task);

      // Advance time past expiry
      vi.advanceTimersByTime(2 * 60 * 60 * 1000); // 2 hours

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_TIMEOUT);
    });

    it('should reject if task IDs do not match', async () => {
      const task = createTask();
      const approval = ApprovalRequest.createUnsigned(
        'different-task-id',
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SINGLE
      );

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.TASK_NOT_FOUND);
    });

    it('should reject if payload hash does not match', async () => {
      const task = createTask();
      const wrongHash = computePayloadHash({ tampered: true });
      const approval = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        wrongHash,
        ApprovalScope.SINGLE
      );

      const result = await validator.validate(task.toJSON(), approval.toJSON());

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.HASH_MISMATCH);
    });

    it('should reject if approval has expired (SIMILAR scope)', async () => {
      const task = createTask();
      
      // Create approval with past expiry
      const approvalData = ApprovalRequest.createUnsigned(
        task.taskId,
        'approver@example.ha2ha',
        task.payloadHash,
        ApprovalScope.SIMILAR
      ).toJSON();
      
      // Manually set expiry to past
      approvalData.expiresAt = new Date(Date.now() - 1000).toISOString();

      const result = await validator.validate(task.toJSON(), approvalData);

      expect(result.success).toBe(false);
      expect(result.error).toBe(ApprovalError.APPROVAL_EXPIRED);
    });
  });

  describe('canApprove', () => {
    it('should return true for pending task', () => {
      const task = createTask();

      const result = validator.canApprove(task.toJSON());

      expect(result.canApprove).toBe(true);
    });

    it('should return false for non-pending task', () => {
      const task = createTask();
      task.approve();

      const result = validator.canApprove(task.toJSON());

      expect(result.canApprove).toBe(false);
      expect(result.reason).toContain('WORKING');
    });

    it('should return false for expired task', () => {
      const task = createTask();
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const result = validator.canApprove(task.toJSON());

      expect(result.canApprove).toBe(false);
      expect(result.reason).toContain('expired');
    });
  });

  describe('validateHash', () => {
    it('should return true for matching hash', () => {
      const task = createTask();

      const result = validator.validateHash(task.toJSON(), task.payloadHash);

      expect(result).toBe(true);
    });

    it('should return false for non-matching hash', () => {
      const task = createTask();
      const wrongHash = computePayloadHash({ different: true });

      const result = validator.validateHash(task.toJSON(), wrongHash);

      expect(result).toBe(false);
    });
  });
});

describe('createValidator', () => {
  it('should create validator with default config', () => {
    const validator = createValidator();

    expect(validator).toBeInstanceOf(ApprovalValidator);
  });

  it('should create validator with custom config', () => {
    const validator = createValidator({
      requireSignature: false,
    });

    expect(validator).toBeInstanceOf(ApprovalValidator);
  });
});
