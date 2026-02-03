/**
 * Tests for FatigueTracker
 */

import { describe, it, expect } from 'vitest';
import { FatigueTracker, createFatigueTracker } from '../fatigue';

describe('FatigueTracker', () => {
  describe('with limit', () => {
    it('should track approvals correctly', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-2');
      
      expect(tracker.getApprovalCount()).toBe(2);
    });

    it('should detect when limit is exceeded', () => {
      const tracker = new FatigueTracker({ limit: 3 });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      tracker.recordApproval('task-3', 'agent-1');
      
      expect(tracker.isExceeded()).toBe(true);
      expect(tracker.canApprove()).toBe(false);
    });

    it('should not be exceeded when under limit', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      
      expect(tracker.isExceeded()).toBe(false);
      expect(tracker.canApprove()).toBe(true);
    });

    it('should return correct status', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      
      const status = tracker.getStatus();
      expect(status.approvalsThisHour).toBe(2);
      expect(status.limit).toBe(5);
      expect(status.exceeded).toBe(false);
      expect(status.minutesUntilReset).toBeGreaterThan(0);
      expect(status.minutesUntilReset).toBeLessThanOrEqual(60);
    });
  });

  describe('with no limit (null)', () => {
    it('should never be exceeded', () => {
      const tracker = new FatigueTracker({ limit: null });
      
      // Record many approvals
      for (let i = 0; i < 100; i++) {
        tracker.recordApproval(`task-${i}`, 'agent-1');
      }
      
      expect(tracker.isExceeded()).toBe(false);
      expect(tracker.canApprove()).toBe(true);
    });

    it('should still track count', () => {
      const tracker = new FatigueTracker({ limit: null });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      
      expect(tracker.getApprovalCount()).toBe(2);
    });

    it('should return null limit in status', () => {
      const tracker = new FatigueTracker({ limit: null });
      
      const status = tracker.getStatus();
      expect(status.limit).toBeNull();
    });
  });

  describe('time window behavior', () => {
    it('should expire approvals after window', () => {
      let currentTime = new Date('2026-02-02T12:00:00Z');
      
      const tracker = new FatigueTracker({
        limit: 5,
        windowMs: 60 * 60 * 1000, // 1 hour
        now: () => currentTime,
      });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      
      expect(tracker.getApprovalCount()).toBe(2);
      
      // Move time forward 2 hours
      currentTime = new Date('2026-02-02T14:00:00Z');
      
      expect(tracker.getApprovalCount()).toBe(0);
    });

    it('should calculate minutes until reset correctly', () => {
      const currentTime = new Date('2026-02-02T12:30:00Z');
      
      const tracker = new FatigueTracker({
        limit: 5,
        windowMs: 60 * 60 * 1000, // 1 hour
        now: () => currentTime,
      });
      
      tracker.recordApproval('task-1', 'agent-1');
      
      const status = tracker.getStatus();
      // Should be about 60 minutes until the approval expires
      expect(status.minutesUntilReset).toBeLessThanOrEqual(60);
      expect(status.minutesUntilReset).toBeGreaterThan(55);
    });
  });

  describe('clear and recent approvals', () => {
    it('should clear all approvals', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      tracker.recordApproval('task-1', 'agent-1');
      tracker.recordApproval('task-2', 'agent-1');
      
      expect(tracker.getApprovalCount()).toBe(2);
      
      tracker.clear();
      
      expect(tracker.getApprovalCount()).toBe(0);
    });

    it('should return recent approvals', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      tracker.recordApproval('task-1', 'agent-a');
      tracker.recordApproval('task-2', 'agent-b');
      
      const recent = tracker.getRecentApprovals();
      expect(recent.length).toBe(2);
      expect(recent[0].taskId).toBe('task-1');
      expect(recent[0].agentId).toBe('agent-a');
      expect(recent[1].taskId).toBe('task-2');
      expect(recent[1].agentId).toBe('agent-b');
    });
  });

  describe('limit updates', () => {
    it('should allow updating the limit', () => {
      const tracker = new FatigueTracker({ limit: 5 });
      
      expect(tracker.getLimit()).toBe(5);
      
      tracker.setLimit(10);
      
      expect(tracker.getLimit()).toBe(10);
    });
  });

  describe('createFatigueTracker factory', () => {
    it('should create tracker with limit', () => {
      const tracker = createFatigueTracker(5);
      expect(tracker.getLimit()).toBe(5);
    });

    it('should create tracker with null limit', () => {
      const tracker = createFatigueTracker(null);
      expect(tracker.getLimit()).toBeNull();
    });
  });
});
