/**
 * Tests for PendingTask
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PendingTask, CreateTaskOptions } from '../pending-task';
import { TaskState, DEFAULT_TASK_TIMEOUT_MS } from '../types';

describe('PendingTask', () => {
  const defaultOptions: CreateTaskOptions = {
    sourceAgent: 'agent-a.example.ha2ha',
    targetAgent: 'agent-b.example.ha2ha',
    payload: { action: 'read', path: '/tmp/file.txt' },
    trustLevel: 3,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('create', () => {
    it('should create task with SUBMITTED state', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.state).toBe(TaskState.SUBMITTED);
    });

    it('should generate a task ID if not provided', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.taskId).toBeDefined();
      expect(task.taskId.length).toBeGreaterThan(0);
    });

    it('should use provided task ID', () => {
      const task = PendingTask.create({
        ...defaultOptions,
        taskId: 'custom-task-id',
      });

      expect(task.taskId).toBe('custom-task-id');
    });

    it('should set source and target agents', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.sourceAgent).toBe('agent-a.example.ha2ha');
      expect(task.targetAgent).toBe('agent-b.example.ha2ha');
    });

    it('should compute payload hash', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.payloadHash).toHaveLength(64);
    });

    it('should set expiry time based on default timeout', () => {
      const task = PendingTask.create(defaultOptions);

      const expectedExpiry = new Date(Date.now() + DEFAULT_TASK_TIMEOUT_MS);
      expect(task.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should set custom expiry time', () => {
      const customTimeout = 30 * 60 * 1000; // 30 minutes
      const task = PendingTask.create({
        ...defaultOptions,
        timeoutMs: customTimeout,
      });

      const expectedExpiry = new Date(Date.now() + customTimeout);
      expect(task.expiresAt.getTime()).toBe(expectedExpiry.getTime());
    });

    it('should store trust level', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.trustLevel).toBe(3);
    });

    it('should store optional description', () => {
      const task = PendingTask.create({
        ...defaultOptions,
        description: 'Test task description',
      });

      expect(task.description).toBe('Test task description');
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON', () => {
      const task = PendingTask.create(defaultOptions);
      const json = task.toJSON();

      expect(json.taskId).toBe(task.taskId);
      expect(json.sourceAgent).toBe(task.sourceAgent);
      expect(json.payload).toEqual(defaultOptions.payload);
      expect(json.state).toBe(TaskState.SUBMITTED);
    });

    it('should deserialize from JSON', () => {
      const original = PendingTask.create(defaultOptions);
      const json = original.toJSON();
      const restored = PendingTask.fromJSON(json);

      expect(restored.taskId).toBe(original.taskId);
      expect(restored.payloadHash).toBe(original.payloadHash);
      expect(restored.state).toBe(original.state);
    });
  });

  describe('expiration', () => {
    it('should not be expired initially', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.isExpired).toBe(false);
    });

    it('should be expired after timeout', () => {
      const task = PendingTask.create(defaultOptions);

      // Advance time past expiry
      vi.advanceTimersByTime(DEFAULT_TASK_TIMEOUT_MS + 1000);

      expect(task.isExpired).toBe(true);
    });

    it('should calculate time remaining correctly', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.timeRemaining).toBe(DEFAULT_TASK_TIMEOUT_MS);

      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes

      expect(task.timeRemaining).toBe(DEFAULT_TASK_TIMEOUT_MS - 10 * 60 * 1000);
    });

    it('should return 0 for time remaining when expired', () => {
      const task = PendingTask.create(defaultOptions);

      vi.advanceTimersByTime(DEFAULT_TASK_TIMEOUT_MS + 1000);

      expect(task.timeRemaining).toBe(0);
    });
  });

  describe('state predicates', () => {
    it('should be pending when in SUBMITTED state', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.isPending).toBe(true);
    });

    it('should be approvable when pending and not expired', () => {
      const task = PendingTask.create(defaultOptions);

      expect(task.canBeApproved).toBe(true);
    });

    it('should not be approvable when expired', () => {
      const task = PendingTask.create(defaultOptions);

      vi.advanceTimersByTime(DEFAULT_TASK_TIMEOUT_MS + 1000);

      expect(task.canBeApproved).toBe(false);
    });
  });

  describe('state transitions', () => {
    describe('canTransitionTo', () => {
      it('should allow SUBMITTED -> WORKING', () => {
        const task = PendingTask.create(defaultOptions);

        expect(task.canTransitionTo(TaskState.WORKING)).toBe(true);
      });

      it('should allow SUBMITTED -> CANCELED', () => {
        const task = PendingTask.create(defaultOptions);

        expect(task.canTransitionTo(TaskState.CANCELED)).toBe(true);
      });

      it('should not allow SUBMITTED -> COMPLETED', () => {
        const task = PendingTask.create(defaultOptions);

        expect(task.canTransitionTo(TaskState.COMPLETED)).toBe(false);
      });

      it('should not allow SUBMITTED -> FAILED', () => {
        const task = PendingTask.create(defaultOptions);

        expect(task.canTransitionTo(TaskState.FAILED)).toBe(false);
      });

      it('should allow WORKING -> COMPLETED', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(task.canTransitionTo(TaskState.COMPLETED)).toBe(true);
      });

      it('should allow WORKING -> FAILED', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(task.canTransitionTo(TaskState.FAILED)).toBe(true);
      });

      it('should allow WORKING -> CANCELED', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(task.canTransitionTo(TaskState.CANCELED)).toBe(true);
      });

      it('should not allow transitions from terminal states', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();
        task.complete();

        expect(task.canTransitionTo(TaskState.WORKING)).toBe(false);
        expect(task.canTransitionTo(TaskState.FAILED)).toBe(false);
        expect(task.canTransitionTo(TaskState.CANCELED)).toBe(false);
      });

      it('should not allow self-transitions', () => {
        const task = PendingTask.create(defaultOptions);

        expect(task.canTransitionTo(TaskState.SUBMITTED)).toBe(false);
      });
    });

    describe('approve', () => {
      it('should transition to WORKING', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(task.state).toBe(TaskState.WORKING);
        expect(task.isPending).toBe(false);
      });

      it('should throw if expired', () => {
        const task = PendingTask.create(defaultOptions);
        vi.advanceTimersByTime(DEFAULT_TASK_TIMEOUT_MS + 1000);

        expect(() => task.approve()).toThrow('expired');
      });

      it('should throw if not in SUBMITTED state', () => {
        const task = PendingTask.create(defaultOptions);
        task.reject();

        expect(() => task.approve()).toThrow('CANCELED');
      });
    });

    describe('reject', () => {
      it('should transition to CANCELED', () => {
        const task = PendingTask.create(defaultOptions);
        task.reject();

        expect(task.state).toBe(TaskState.CANCELED);
      });

      it('should throw if not pending', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(() => task.reject()).toThrow('WORKING');
      });
    });

    describe('timeout', () => {
      it('should transition to CANCELED if pending', () => {
        const task = PendingTask.create(defaultOptions);
        task.timeout();

        expect(task.state).toBe(TaskState.CANCELED);
      });

      it('should not throw if not pending', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();

        expect(() => task.timeout()).not.toThrow();
        expect(task.state).toBe(TaskState.WORKING);
      });
    });

    describe('complete', () => {
      it('should transition to COMPLETED', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();
        task.complete();

        expect(task.state).toBe(TaskState.COMPLETED);
      });

      it('should throw if not WORKING', () => {
        const task = PendingTask.create(defaultOptions);

        expect(() => task.complete()).toThrow('SUBMITTED');
      });
    });

    describe('fail', () => {
      it('should transition to FAILED', () => {
        const task = PendingTask.create(defaultOptions);
        task.approve();
        task.fail();

        expect(task.state).toBe(TaskState.FAILED);
      });

      it('should throw if not WORKING', () => {
        const task = PendingTask.create(defaultOptions);

        expect(() => task.fail()).toThrow('SUBMITTED');
      });
    });
  });

  describe('getSummary', () => {
    it('should return a readable summary', () => {
      const task = PendingTask.create({
        ...defaultOptions,
        description: 'Test description',
      });

      const summary = task.getSummary();

      expect(summary).toContain(task.taskId);
      expect(summary).toContain('agent-a.example.ha2ha');
      expect(summary).toContain('agent-b.example.ha2ha');
      expect(summary).toContain('SUBMITTED');
      expect(summary).toContain('Test description');
    });
  });
});
