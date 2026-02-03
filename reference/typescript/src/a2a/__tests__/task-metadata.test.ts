/**
 * Tests for task metadata extension.
 */

import { describe, it, expect } from 'vitest';
import {
  createTaskMetadata,
  createTrustContext,
  validateTaskMetadata,
  validateTrustContext,
  extractHa2haMetadata,
  extractTrustContext,
  injectMetadata,
  injectMetadataWithTrust,
  parseDurationToMs,
  msToDuration,
  isApprovalTimedOut,
  calculateApprovalExpiry,
  DEFAULT_APPROVAL_TIMEOUT,
  TRUST_LEVEL_NAMES,
} from '../task-metadata';
import type { Ha2haTaskMetadata, Ha2haTrustContext } from '../types';

describe('createTaskMetadata', () => {
  it('should create metadata with required fields', () => {
    const metadata = createTaskMetadata({
      requestingAgent: 'agent-a.ha2ha',
      requestingHuman: 'ricardo@example.com',
      trustLevel: 3,
    });

    expect(metadata.requestingAgent).toBe('agent-a.ha2ha');
    expect(metadata.requestingHuman).toBe('ricardo@example.com');
    expect(metadata.trustLevel).toBe(3);
    expect(metadata.approvalRequired).toBe(true);
    expect(metadata.approvalTimeout).toBe(DEFAULT_APPROVAL_TIMEOUT);
    expect(metadata.auditId).toMatch(/^audit-/);
  });

  it('should use provided optional fields', () => {
    const metadata = createTaskMetadata({
      requestingAgent: 'agent-a.ha2ha',
      requestingHuman: 'ricardo@example.com',
      trustLevel: 4,
      approvalRequired: false,
      approvalTimeout: 'PT30M',
      auditId: 'custom-audit-id',
    });

    expect(metadata.approvalRequired).toBe(false);
    expect(metadata.approvalTimeout).toBe('PT30M');
    expect(metadata.auditId).toBe('custom-audit-id');
  });

  it('should generate unique audit IDs', () => {
    const meta1 = createTaskMetadata({
      requestingAgent: 'agent',
      requestingHuman: 'human',
      trustLevel: 1,
    });
    const meta2 = createTaskMetadata({
      requestingAgent: 'agent',
      requestingHuman: 'human',
      trustLevel: 1,
    });

    expect(meta1.auditId).not.toBe(meta2.auditId);
  });
});

describe('createTrustContext', () => {
  it('should create trust context with level name', () => {
    const context = createTrustContext({
      level: 3,
      lastTransition: '2026-02-02T10:00:00Z',
      transitionReason: 'human_approval',
    });

    expect(context.level).toBe(3);
    expect(context.levelName).toBe('STANDARD');
    expect(context.lastTransition).toBe('2026-02-02T10:00:00Z');
    expect(context.transitionReason).toBe('human_approval');
    expect(context.violationCount).toBe(0);
    expect(context.cooldownExpires).toBeNull();
  });

  it('should use correct level names', () => {
    expect(createTrustContext({ level: 0, lastTransition: '', transitionReason: '' }).levelName).toBe('BLOCKED');
    expect(createTrustContext({ level: 1, lastTransition: '', transitionReason: '' }).levelName).toBe('UNKNOWN');
    expect(createTrustContext({ level: 2, lastTransition: '', transitionReason: '' }).levelName).toBe('PROVISIONAL');
    expect(createTrustContext({ level: 3, lastTransition: '', transitionReason: '' }).levelName).toBe('STANDARD');
    expect(createTrustContext({ level: 4, lastTransition: '', transitionReason: '' }).levelName).toBe('TRUSTED');
    expect(createTrustContext({ level: 5, lastTransition: '', transitionReason: '' }).levelName).toBe('VERIFIED');
  });

  it('should include optional fields', () => {
    const context = createTrustContext({
      level: 4,
      lastTransition: '2026-02-02T10:00:00Z',
      transitionReason: 'human_approval',
      violationCount: 2,
      cooldownExpires: '2026-02-02T11:00:00Z',
      preApprovalScope: ['read', 'list'],
    });

    expect(context.violationCount).toBe(2);
    expect(context.cooldownExpires).toBe('2026-02-02T11:00:00Z');
    expect(context.preApprovalScope).toEqual(['read', 'list']);
  });
});

describe('validateTaskMetadata', () => {
  const validMetadata: Ha2haTaskMetadata = {
    requestingAgent: 'agent.ha2ha',
    requestingHuman: 'human@example.com',
    trustLevel: 3,
    approvalRequired: true,
    approvalTimeout: 'PT1H',
    auditId: 'audit-123',
  };

  it('should validate correct metadata', () => {
    const result = validateTaskMetadata(validMetadata);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing requestingAgent', () => {
    const result = validateTaskMetadata({ ...validMetadata, requestingAgent: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('requestingAgent is required');
  });

  it('should reject missing requestingHuman', () => {
    const result = validateTaskMetadata({ ...validMetadata, requestingHuman: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('requestingHuman is required');
  });

  it('should reject invalid trust level', () => {
    const result1 = validateTaskMetadata({ ...validMetadata, trustLevel: -1 });
    expect(result1.valid).toBe(false);

    const result2 = validateTaskMetadata({ ...validMetadata, trustLevel: 6 });
    expect(result2.valid).toBe(false);
  });

  it('should reject invalid approval timeout', () => {
    const result = validateTaskMetadata({ ...validMetadata, approvalTimeout: 'invalid' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('duration'))).toBe(true);
  });
});

describe('validateTrustContext', () => {
  const validContext: Ha2haTrustContext = {
    level: 3,
    levelName: 'STANDARD',
    lastTransition: '2026-02-02T10:00:00Z',
    transitionReason: 'human_approval',
    violationCount: 0,
    cooldownExpires: null,
  };

  it('should validate correct context', () => {
    const result = validateTrustContext(validContext);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid trust level', () => {
    const result = validateTrustContext({ ...validContext, level: 10 });
    expect(result.valid).toBe(false);
  });

  it('should reject missing level name', () => {
    const result = validateTrustContext({ ...validContext, levelName: '' });
    expect(result.valid).toBe(false);
  });

  it('should reject invalid timestamp', () => {
    const result = validateTrustContext({ ...validContext, lastTransition: 'not-a-date' });
    expect(result.valid).toBe(false);
  });

  it('should reject negative violation count', () => {
    const result = validateTrustContext({ ...validContext, violationCount: -1 });
    expect(result.valid).toBe(false);
  });
});

describe('extractHa2haMetadata', () => {
  it('should extract metadata from task', () => {
    const taskMetadata = {
      ha2ha: {
        requestingAgent: 'agent.ha2ha',
        requestingHuman: 'human',
        trustLevel: 3,
        approvalRequired: true,
        approvalTimeout: 'PT1H',
        auditId: 'audit-123',
      },
    };

    const extracted = extractHa2haMetadata(taskMetadata);
    expect(extracted?.requestingAgent).toBe('agent.ha2ha');
    expect(extracted?.trustLevel).toBe(3);
  });

  it('should return undefined for missing metadata', () => {
    expect(extractHa2haMetadata(undefined)).toBeUndefined();
    expect(extractHa2haMetadata({})).toBeUndefined();
  });
});

describe('extractTrustContext', () => {
  it('should extract trust context from task', () => {
    const taskMetadata = {
      ha2ha: {
        requestingAgent: 'agent.ha2ha',
        trustContext: {
          level: 3,
          levelName: 'STANDARD',
          lastTransition: '2026-02-02T10:00:00Z',
          transitionReason: 'human_approval',
          violationCount: 0,
          cooldownExpires: null,
        },
      },
    };

    const extracted = extractTrustContext(taskMetadata);
    expect(extracted?.level).toBe(3);
    expect(extracted?.levelName).toBe('STANDARD');
  });

  it('should return undefined when not present', () => {
    expect(extractTrustContext(undefined)).toBeUndefined();
    expect(extractTrustContext({ ha2ha: {} })).toBeUndefined();
  });
});

describe('injectMetadata', () => {
  it('should inject metadata into task', () => {
    const task = { id: 'task-1', action: 'read', metadata: {} as Record<string, unknown> };
    const metadata = createTaskMetadata({
      requestingAgent: 'agent',
      requestingHuman: 'human',
      trustLevel: 3,
    });

    const result = injectMetadata(task, metadata);

    expect((result as typeof task).id).toBe('task-1');
    expect((result as typeof task).action).toBe('read');
    expect(result.metadata?.ha2ha).toEqual(metadata);
  });

  it('should preserve existing metadata', () => {
    const task = { metadata: { other: 'data' } as Record<string, unknown> };
    const metadata = createTaskMetadata({
      requestingAgent: 'agent',
      requestingHuman: 'human',
      trustLevel: 3,
    });

    const result = injectMetadata(task, metadata);

    expect(result.metadata?.other).toBe('data');
    expect(result.metadata?.ha2ha).toEqual(metadata);
  });
});

describe('injectMetadataWithTrust', () => {
  it('should inject both metadata and trust context', () => {
    const task = { metadata: {} as Record<string, unknown> };
    const metadata = createTaskMetadata({
      requestingAgent: 'agent',
      requestingHuman: 'human',
      trustLevel: 3,
    });
    const trustContext = createTrustContext({
      level: 3,
      lastTransition: '2026-02-02T10:00:00Z',
      transitionReason: 'human_approval',
    });

    const result = injectMetadataWithTrust(task, metadata, trustContext);

    const ha2ha = result.metadata?.ha2ha as Ha2haTaskMetadata & { trustContext: Ha2haTrustContext };
    expect(ha2ha.requestingAgent).toBe('agent');
    expect(ha2ha.trustContext.level).toBe(3);
  });
});

describe('parseDurationToMs', () => {
  it('should parse hours', () => {
    expect(parseDurationToMs('PT1H')).toBe(3600000);
    expect(parseDurationToMs('PT2H')).toBe(7200000);
  });

  it('should parse minutes', () => {
    expect(parseDurationToMs('PT30M')).toBe(1800000);
    expect(parseDurationToMs('PT1M')).toBe(60000);
  });

  it('should parse seconds', () => {
    expect(parseDurationToMs('PT30S')).toBe(30000);
    expect(parseDurationToMs('PT1S')).toBe(1000);
  });

  it('should parse combined durations', () => {
    expect(parseDurationToMs('PT1H30M')).toBe(5400000);
    expect(parseDurationToMs('PT1H30M45S')).toBe(5445000);
    expect(parseDurationToMs('PT2H15S')).toBe(7215000);
  });

  it('should throw for invalid duration', () => {
    expect(() => parseDurationToMs('invalid')).toThrow();
    expect(() => parseDurationToMs('P1D')).toThrow(); // Days not supported
  });
});

describe('msToDuration', () => {
  it('should convert milliseconds to duration', () => {
    expect(msToDuration(3600000)).toBe('PT1H');
    expect(msToDuration(1800000)).toBe('PT30M');
    expect(msToDuration(30000)).toBe('PT30S');
  });

  it('should handle combined durations', () => {
    expect(msToDuration(5400000)).toBe('PT1H30M');
    expect(msToDuration(5445000)).toBe('PT1H30M45S');
  });

  it('should handle zero', () => {
    expect(msToDuration(0)).toBe('PT0S');
  });
});

describe('isApprovalTimedOut', () => {
  it('should return false for non-expired approval', () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30 min ago
    const timeout = 'PT1H';

    expect(isApprovalTimedOut(submittedAt, timeout, now)).toBe(false);
  });

  it('should return true for expired approval', () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    const timeout = 'PT1H';

    expect(isApprovalTimedOut(submittedAt, timeout, now)).toBe(true);
  });

  it('should return true exactly at expiry', () => {
    const now = new Date();
    const submittedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString(); // Exactly 1 hour ago
    const timeout = 'PT1H';

    expect(isApprovalTimedOut(submittedAt, timeout, now)).toBe(true);
  });
});

describe('calculateApprovalExpiry', () => {
  it('should calculate expiry time', () => {
    const submittedAt = '2026-02-02T10:00:00.000Z';
    const timeout = 'PT1H';

    const expiry = calculateApprovalExpiry(submittedAt, timeout);

    expect(expiry).toBe('2026-02-02T11:00:00.000Z');
  });

  it('should handle different timeouts', () => {
    const submittedAt = '2026-02-02T10:00:00.000Z';

    expect(calculateApprovalExpiry(submittedAt, 'PT30M')).toBe('2026-02-02T10:30:00.000Z');
    expect(calculateApprovalExpiry(submittedAt, 'PT2H')).toBe('2026-02-02T12:00:00.000Z');
  });
});

describe('TRUST_LEVEL_NAMES', () => {
  it('should have all trust levels defined', () => {
    expect(TRUST_LEVEL_NAMES[0]).toBe('BLOCKED');
    expect(TRUST_LEVEL_NAMES[1]).toBe('UNKNOWN');
    expect(TRUST_LEVEL_NAMES[2]).toBe('PROVISIONAL');
    expect(TRUST_LEVEL_NAMES[3]).toBe('STANDARD');
    expect(TRUST_LEVEL_NAMES[4]).toBe('TRUSTED');
    expect(TRUST_LEVEL_NAMES[5]).toBe('VERIFIED');
  });
});
