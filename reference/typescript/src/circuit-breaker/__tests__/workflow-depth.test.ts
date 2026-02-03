/**
 * Workflow Depth Tracker Tests
 * 
 * Tests for task chain depth limiting.
 */

import { describe, it, expect } from 'vitest';
import {
  WorkflowDepthTracker,
  WorkflowDepthExceededError,
  Ha2haTaskMetadata,
} from '../workflow-depth';

describe('WorkflowDepthTracker', () => {
  describe('MAX_DEPTH', () => {
    it('should have MAX_DEPTH of 3', () => {
      expect(WorkflowDepthTracker.MAX_DEPTH).toBe(3);
    });
  });

  describe('getDepth', () => {
    it('should return 1 for undefined depth', () => {
      const metadata: Ha2haTaskMetadata = {};
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(1);
    });

    it('should return explicit depth', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 2 };
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(2);
    });
  });

  describe('getTaskChain', () => {
    it('should return empty array for undefined chain', () => {
      const metadata: Ha2haTaskMetadata = {};
      expect(WorkflowDepthTracker.getTaskChain(metadata)).toEqual([]);
    });

    it('should return explicit chain', () => {
      const metadata: Ha2haTaskMetadata = {
        taskChain: ['task-1', 'task-2'],
      };
      expect(WorkflowDepthTracker.getTaskChain(metadata)).toEqual(['task-1', 'task-2']);
    });
  });

  describe('checkDepth', () => {
    it('should allow depth 1', () => {
      expect(WorkflowDepthTracker.checkDepth(1)).toBe(true);
    });

    it('should allow depth 2', () => {
      expect(WorkflowDepthTracker.checkDepth(2)).toBe(true);
    });

    it('should allow depth 3 (MAX_DEPTH)', () => {
      expect(WorkflowDepthTracker.checkDepth(3)).toBe(true);
    });

    it('should reject depth 4', () => {
      expect(WorkflowDepthTracker.checkDepth(4)).toBe(false);
    });

    it('should reject depth > MAX_DEPTH', () => {
      expect(WorkflowDepthTracker.checkDepth(10)).toBe(false);
    });
  });

  describe('checkDepthDetailed', () => {
    it('should return allowed=true for valid depth', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 2 };
      const result = WorkflowDepthTracker.checkDepthDetailed(metadata);
      
      expect(result.allowed).toBe(true);
      expect(result.depth).toBe(2);
      expect(result.maxDepth).toBe(3);
      expect(result.error).toBeUndefined();
    });

    it('should return allowed=false for exceeded depth', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 4,
        taskChain: ['task-1', 'task-2', 'task-3'],
      };
      const result = WorkflowDepthTracker.checkDepthDetailed(metadata);
      
      expect(result.allowed).toBe(false);
      expect(result.depth).toBe(4);
      expect(result.error).toBeDefined();
      expect(result.error?.depth).toBe(4);
      expect(result.error?.maxDepth).toBe(3);
      expect(result.error?.taskChain).toEqual(['task-1', 'task-2', 'task-3']);
    });
  });

  describe('canDelegate', () => {
    it('should allow delegation at depth 1', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 1 };
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);
    });

    it('should allow delegation at depth 2', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 2 };
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);
    });

    it('should NOT allow delegation at MAX_DEPTH', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 3 };
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(false);
    });

    it('should NOT allow delegation beyond MAX_DEPTH', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 4 };
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(false);
    });
  });

  describe('incrementDepth', () => {
    it('should increment depth by 1', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 1 };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata);
      
      expect(newMetadata.workflowDepth).toBe(2);
    });

    it('should add task to chain', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 1,
        taskChain: ['task-1'],
      };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-2');
      
      expect(newMetadata.taskChain).toEqual(['task-1', 'task-2']);
    });

    it('should preserve originTaskId', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 2,
        originTaskId: 'task-1',
      };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-3');
      
      expect(newMetadata.originTaskId).toBe('task-1');
    });

    it('should set originTaskId if not present', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 1 };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-1');
      
      expect(newMetadata.originTaskId).toBe('task-1');
    });

    it('should preserve other metadata', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 1,
        customField: 'value',
      };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata);
      
      expect(newMetadata.customField).toBe('value');
    });

    it('should not mutate original metadata', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 1,
        taskChain: ['task-1'],
      };
      const newMetadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-2');
      
      expect(metadata.workflowDepth).toBe(1);
      expect(metadata.taskChain).toEqual(['task-1']);
      expect(newMetadata.taskChain).toEqual(['task-1', 'task-2']);
    });
  });

  describe('createInitialMetadata', () => {
    it('should create metadata with depth 1', () => {
      const metadata = WorkflowDepthTracker.createInitialMetadata();
      expect(metadata.workflowDepth).toBe(1);
    });

    it('should include task ID in chain', () => {
      const metadata = WorkflowDepthTracker.createInitialMetadata('task-1');
      expect(metadata.taskChain).toEqual(['task-1']);
      expect(metadata.originTaskId).toBe('task-1');
    });

    it('should create empty chain without task ID', () => {
      const metadata = WorkflowDepthTracker.createInitialMetadata();
      expect(metadata.taskChain).toEqual([]);
    });
  });

  describe('validateMetadata', () => {
    it('should accept valid metadata', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 2,
        taskChain: ['task-1'],
      };
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(true);
    });

    it('should accept empty metadata', () => {
      const metadata: Ha2haTaskMetadata = {};
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(true);
    });

    it('should reject non-integer depth', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 1.5 };
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });

    it('should reject negative depth', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: -1 };
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });

    it('should reject zero depth', () => {
      const metadata: Ha2haTaskMetadata = { workflowDepth: 0 };
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });

    it('should reject non-array chain', () => {
      const metadata = { taskChain: 'not-an-array' } as unknown as Ha2haTaskMetadata;
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });

    it('should reject chain with non-string elements', () => {
      const metadata = { taskChain: [1, 2, 3] } as unknown as Ha2haTaskMetadata;
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });

    it('should reject chain longer than depth', () => {
      const metadata: Ha2haTaskMetadata = {
        workflowDepth: 1,
        taskChain: ['task-1', 'task-2', 'task-3'],
      };
      expect(WorkflowDepthTracker.validateMetadata(metadata)).toBe(false);
    });
  });

  describe('workflow simulation', () => {
    it('should track depth through delegation chain', () => {
      // Original task from human
      let metadata = WorkflowDepthTracker.createInitialMetadata('task-1');
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(1);
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);

      // First delegation
      metadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-2');
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(2);
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(true);

      // Second delegation (at MAX_DEPTH)
      metadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-3');
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(3);
      expect(WorkflowDepthTracker.canDelegate(metadata)).toBe(false);

      // Third delegation (would exceed MAX_DEPTH)
      metadata = WorkflowDepthTracker.incrementDepth(metadata, 'task-4');
      expect(WorkflowDepthTracker.getDepth(metadata)).toBe(4);
      expect(WorkflowDepthTracker.checkDepth(metadata.workflowDepth!)).toBe(false);

      // Detailed check shows error
      const result = WorkflowDepthTracker.checkDepthDetailed(metadata);
      expect(result.allowed).toBe(false);
      expect(result.error?.taskChain).toEqual(['task-1', 'task-2', 'task-3', 'task-4']);
    });
  });
});

describe('WorkflowDepthExceededError', () => {
  it('should create error with correct message', () => {
    const error = new WorkflowDepthExceededError({
      depth: 4,
      maxDepth: 3,
      taskChain: ['task-1', 'task-2', 'task-3'],
    });

    expect(error.name).toBe('WorkflowDepthExceededError');
    expect(error.message).toContain('4 > 3');
    expect(error.message).toContain('task-1 → task-2 → task-3');
    expect(error.depth).toBe(4);
    expect(error.maxDepth).toBe(3);
    expect(error.taskChain).toEqual(['task-1', 'task-2', 'task-3']);
  });

  it('should handle empty task chain', () => {
    const error = new WorkflowDepthExceededError({
      depth: 4,
      maxDepth: 3,
      taskChain: [],
    });

    expect(error.message).toContain('(empty)');
  });
});
