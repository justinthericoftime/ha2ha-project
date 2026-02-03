/**
 * Tests for CLI commands
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli, parseArgs, formatTask, formatTaskTable } from '../cli';
import { ApprovalQueue } from '../approval-queue';
import { PendingTask } from '../pending-task';

describe('parseArgs', () => {
  it('should parse command without arguments', () => {
    const result = parseArgs(['list']);

    expect(result.command).toBe('list');
    expect(result.taskId).toBeUndefined();
    expect(result.options).toEqual({});
  });

  it('should parse command with task ID', () => {
    const result = parseArgs(['approve', 'task-123']);

    expect(result.command).toBe('approve');
    expect(result.taskId).toBe('task-123');
  });

  it('should parse options with values', () => {
    const result = parseArgs(['reject', 'task-123', '--reason', 'Not authorized']);

    expect(result.command).toBe('reject');
    expect(result.taskId).toBe('task-123');
    expect(result.options.reason).toBe('Not authorized');
  });

  it('should parse boolean options', () => {
    const result = parseArgs(['list', '--all', '--json']);

    expect(result.options.all).toBe(true);
    expect(result.options.json).toBe(true);
  });

  it('should handle empty args as help', () => {
    const result = parseArgs([]);

    expect(result.command).toBe('help');
  });
});

describe('runCli', () => {
  let tempDir: string;
  let queue: ApprovalQueue;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));

    tempDir = mkdtempSync(join(tmpdir(), 'cli-test-'));
    queue = new ApprovalQueue({
      storePath: tempDir,
      autoPersist: true,
      validatorConfig: { requireSignature: false },
    });

    // Add a test task
    await queue.add({
      sourceAgent: 'agent-a.example.ha2ha',
      targetAgent: 'agent-b.example.ha2ha',
      payload: { action: 'test' },
      trustLevel: 3,
    });
    await queue.save();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('help command', () => {
    it('should show help text', async () => {
      const result = await runCli(['help'], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain('approve');
      expect(result.message).toContain('reject');
      expect(result.message).toContain('list');
      expect(result.exitCode).toBe(0);
    });

    it('should show help for unknown command', async () => {
      const result = await runCli(['unknown'], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Commands:');
    });
  });

  describe('list command', () => {
    it('should list pending tasks', async () => {
      const result = await runCli(['list'], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain('task(s)');
      expect(result.exitCode).toBe(0);
    });

    it('should output JSON when requested', async () => {
      const result = await runCli(['list'], { storePath: tempDir, json: true });

      expect(result.success).toBe(true);
      const data = JSON.parse(result.message);
      expect(Array.isArray(data)).toBe(true);
    });

    it('should show message when no tasks', async () => {
      // Clear queue
      queue.clear();
      await queue.save();

      const result = await runCli(['list'], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain('No pending tasks');
    });
  });

  describe('show command', () => {
    it('should show task details', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(['show', taskId], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain(taskId);
      expect(result.message).toContain('agent-a.example.ha2ha');
    });

    it('should return error for missing task ID', async () => {
      const result = await runCli(['show'], { storePath: tempDir });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should return error for non-existent task', async () => {
      const result = await runCli(['show', 'non-existent'], { storePath: tempDir });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should output JSON when requested', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(['show', taskId], { storePath: tempDir, json: true });

      expect(result.success).toBe(true);
      const data = JSON.parse(result.message);
      expect(data.taskId).toBe(taskId);
    });
  });

  describe('approve command', () => {
    it('should approve a pending task', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(['approve', taskId], { storePath: tempDir });

      expect(result.success).toBe(true);
      expect(result.message).toContain('approved');
      expect(result.exitCode).toBe(0);
    });

    it('should return error for missing task ID', async () => {
      const result = await runCli(['approve'], { storePath: tempDir });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Usage');
    });

    it('should return error for non-existent task', async () => {
      const result = await runCli(['approve', 'non-existent'], { storePath: tempDir });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should use custom approver when provided', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(
        ['approve', taskId, '--approver', 'custom-approver'],
        { storePath: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('custom-approver');
    });

    it('should output JSON when requested', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(['approve', taskId], { storePath: tempDir, json: true });

      expect(result.success).toBe(true);
      const data = JSON.parse(result.message);
      expect(data.success).toBe(true);
      expect(data.taskId).toBe(taskId);
    });
  });

  describe('reject command', () => {
    it('should reject a pending task', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(
        ['reject', taskId, '--reason', 'Not authorized'],
        { storePath: tempDir }
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('rejected');
      expect(result.exitCode).toBe(0);
    });

    it('should return error for missing task ID', async () => {
      const result = await runCli(['reject'], { storePath: tempDir });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Usage');
    });

    it('should use default reason if not provided', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(['reject', taskId], { storePath: tempDir });

      expect(result.success).toBe(true);
    });

    it('should output JSON when requested', async () => {
      const tasks = queue.listPending();
      const taskId = tasks[0].taskId;

      const result = await runCli(
        ['reject', taskId, '--reason', 'Test'],
        { storePath: tempDir, json: true }
      );

      expect(result.success).toBe(true);
      const data = JSON.parse(result.message);
      expect(data.success).toBe(true);
    });
  });
});

describe('formatTask', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should format task as string', () => {
    const task = PendingTask.create({
      sourceAgent: 'agent-a.example.ha2ha',
      targetAgent: 'agent-b.example.ha2ha',
      payload: { action: 'test' },
      trustLevel: 3,
    });

    const output = formatTask(task);

    expect(output).toContain(task.taskId);
    expect(output).toContain('agent-a.example.ha2ha');
    expect(output).toContain('SUBMITTED');
  });
});

describe('formatTaskTable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should format tasks as table', () => {
    const tasks = [
      PendingTask.create({
        sourceAgent: 'agent-a.example.ha2ha',
        targetAgent: 'agent-b.example.ha2ha',
        payload: { action: 'test' },
        trustLevel: 3,
      }),
      PendingTask.create({
        sourceAgent: 'agent-c.example.ha2ha',
        targetAgent: 'agent-d.example.ha2ha',
        payload: { action: 'test2' },
        trustLevel: 2,
      }),
    ];

    const output = formatTaskTable(tasks);

    expect(output).toContain('ID');
    expect(output).toContain('From');
    expect(output).toContain('State');
    expect(output).toContain('agent-a.example.ha2ha');
    expect(output).toContain('agent-c.example.ha2ha');
  });

  it('should return message for empty list', () => {
    const output = formatTaskTable([]);

    expect(output).toBe('No tasks.');
  });
});
