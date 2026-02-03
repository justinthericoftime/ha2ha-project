/**
 * Tests for audit query functionality
 */

import { describe, it, expect } from 'vitest';
import {
  queryAuditLog,
  getTaskHistory,
  getAgentHistory,
  getHumanHistory,
  getEntriesInRange,
  getRecentEntries,
  countByEventType,
  countByOutcome,
  groupByDate,
  getSecurityEvents,
  getTrustEvents,
  searchDetails,
  createQueryBuilder,
} from '../query';
import { createAuditEntry } from '../audit-entry';
import { AuditEventType, AuditEntry } from '../types';

/**
 * Create test entries with predictable data
 */
function createTestEntries(): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let prevHash: string | null = null;
  
  // Genesis
  const genesis = createAuditEntry({
    eventType: AuditEventType.CHAIN_GENESIS,
    sourceAgentId: 'system',
    targetAgentId: 'system',
    trustLevel: 0,
    outcome: 'success',
  }, null);
  entries.push(genesis);
  prevHash = genesis.hash;
  
  // Task workflow
  const submitted = createAuditEntry({
    eventType: AuditEventType.TASK_SUBMITTED,
    taskId: 'task-001',
    sourceAgentId: 'alice',
    targetAgentId: 'bob',
    trustLevel: 1,
    outcome: 'pending',
    details: { action: 'read', path: '/data' },
  }, prevHash);
  entries.push(submitted);
  prevHash = submitted.hash;
  
  const approved = createAuditEntry({
    eventType: AuditEventType.TASK_APPROVED,
    taskId: 'task-001',
    sourceAgentId: 'alice',
    targetAgentId: 'bob',
    humanId: 'carol',
    trustLevel: 1,
    outcome: 'success',
    details: { approvalScope: 'single' },
  }, prevHash);
  entries.push(approved);
  prevHash = approved.hash;
  
  const executed = createAuditEntry({
    eventType: AuditEventType.TASK_EXECUTED,
    taskId: 'task-001',
    sourceAgentId: 'alice',
    targetAgentId: 'bob',
    trustLevel: 1,
    outcome: 'success',
  }, prevHash);
  entries.push(executed);
  prevHash = executed.hash;
  
  // Another task (rejected)
  const submitted2 = createAuditEntry({
    eventType: AuditEventType.TASK_SUBMITTED,
    taskId: 'task-002',
    sourceAgentId: 'dave',
    targetAgentId: 'bob',
    trustLevel: 1,
    outcome: 'pending',
    details: { action: 'delete', path: '/important' },
  }, prevHash);
  entries.push(submitted2);
  prevHash = submitted2.hash;
  
  const rejected = createAuditEntry({
    eventType: AuditEventType.TASK_REJECTED,
    taskId: 'task-002',
    sourceAgentId: 'dave',
    targetAgentId: 'bob',
    humanId: 'carol',
    trustLevel: 1,
    outcome: 'rejected',
    details: { reason: 'Delete operation not allowed' },
  }, prevHash);
  entries.push(rejected);
  prevHash = rejected.hash;
  
  // Trust event
  const trustElevated = createAuditEntry({
    eventType: AuditEventType.TRUST_ELEVATED,
    sourceAgentId: 'alice',
    targetAgentId: 'alice',
    humanId: 'admin',
    trustLevel: 3,
    outcome: 'success',
    details: { previousLevel: 1, newLevel: 3 },
  }, prevHash);
  entries.push(trustElevated);
  prevHash = trustElevated.hash;
  
  // Security event
  const securityAlert = createAuditEntry({
    eventType: AuditEventType.SECURITY_ALERT,
    sourceAgentId: 'eve',
    targetAgentId: 'bob',
    trustLevel: 0,
    outcome: 'error',
    details: { alertType: 'unauthorized_access' },
  }, prevHash);
  entries.push(securityAlert);
  
  return entries;
}

describe('queryAuditLog', () => {
  const entries = createTestEntries();
  
  it('should return all entries with no filters', () => {
    const result = queryAuditLog(entries, {});
    expect(result.entries).toHaveLength(entries.length);
    expect(result.totalCount).toBe(entries.length);
    expect(result.hasMore).toBe(false);
  });
  
  it('should filter by event types', () => {
    const result = queryAuditLog(entries, {
      eventTypes: [AuditEventType.TASK_SUBMITTED],
    });
    
    expect(result.totalCount).toBe(2);
    expect(result.entries.every(e => e.eventType === AuditEventType.TASK_SUBMITTED)).toBe(true);
  });
  
  it('should filter by multiple event types', () => {
    const result = queryAuditLog(entries, {
      eventTypes: [AuditEventType.TASK_SUBMITTED, AuditEventType.TASK_APPROVED],
    });
    
    expect(result.totalCount).toBe(3);
  });
  
  it('should filter by task ID', () => {
    const result = queryAuditLog(entries, {
      taskId: 'task-001',
    });
    
    expect(result.totalCount).toBe(3); // submitted, approved, executed
    expect(result.entries.every(e => e.taskId === 'task-001')).toBe(true);
  });
  
  it('should filter by source agent', () => {
    const result = queryAuditLog(entries, {
      sourceAgentId: 'alice',
    });
    
    expect(result.entries.every(e => e.sourceAgentId === 'alice')).toBe(true);
  });
  
  it('should filter by target agent', () => {
    const result = queryAuditLog(entries, {
      targetAgentId: 'bob',
    });
    
    expect(result.entries.every(e => e.targetAgentId === 'bob')).toBe(true);
  });
  
  it('should filter by human ID', () => {
    const result = queryAuditLog(entries, {
      humanId: 'carol',
    });
    
    expect(result.totalCount).toBe(2); // approved and rejected
    expect(result.entries.every(e => e.humanId === 'carol')).toBe(true);
  });
  
  it('should filter by outcome', () => {
    const result = queryAuditLog(entries, {
      outcome: 'rejected',
    });
    
    expect(result.totalCount).toBe(1);
    expect(result.entries[0].eventType).toBe(AuditEventType.TASK_REJECTED);
  });
  
  it('should apply pagination with limit', () => {
    const result = queryAuditLog(entries, {
      limit: 3,
    });
    
    expect(result.entries).toHaveLength(3);
    expect(result.totalCount).toBe(entries.length);
    expect(result.hasMore).toBe(true);
  });
  
  it('should apply pagination with offset', () => {
    const result = queryAuditLog(entries, {
      offset: 2,
      limit: 3,
    });
    
    expect(result.entries).toHaveLength(3);
    expect(result.hasMore).toBe(true);
  });
  
  it('should sort in ascending order by default', () => {
    const result = queryAuditLog(entries, {});
    
    for (let i = 1; i < result.entries.length; i++) {
      const prev = new Date(result.entries[i - 1].timestamp).getTime();
      const curr = new Date(result.entries[i].timestamp).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
  
  it('should sort in descending order', () => {
    const result = queryAuditLog(entries, {
      order: 'desc',
    });
    
    for (let i = 1; i < result.entries.length; i++) {
      const prev = new Date(result.entries[i - 1].timestamp).getTime();
      const curr = new Date(result.entries[i].timestamp).getTime();
      expect(curr).toBeLessThanOrEqual(prev);
    }
  });
  
  it('should combine multiple filters', () => {
    const result = queryAuditLog(entries, {
      sourceAgentId: 'alice',
      outcome: 'success',
    });
    
    expect(result.entries.every(e => 
      e.sourceAgentId === 'alice' && e.outcome === 'success'
    )).toBe(true);
  });
});

describe('getTaskHistory', () => {
  const entries = createTestEntries();
  
  it('should return all entries for a task in order', () => {
    const history = getTaskHistory(entries, 'task-001');
    
    expect(history).toHaveLength(3);
    expect(history[0].eventType).toBe(AuditEventType.TASK_SUBMITTED);
    expect(history[1].eventType).toBe(AuditEventType.TASK_APPROVED);
    expect(history[2].eventType).toBe(AuditEventType.TASK_EXECUTED);
  });
  
  it('should return empty array for unknown task', () => {
    const history = getTaskHistory(entries, 'unknown');
    expect(history).toHaveLength(0);
  });
});

describe('getAgentHistory', () => {
  const entries = createTestEntries();
  
  it('should return entries where agent is source or target', () => {
    const history = getAgentHistory(entries, 'bob');
    
    expect(history.length).toBeGreaterThan(0);
    expect(history.every(e => 
      e.sourceAgentId === 'bob' || e.targetAgentId === 'bob'
    )).toBe(true);
  });
});

describe('getHumanHistory', () => {
  const entries = createTestEntries();
  
  it('should return entries for a human approver', () => {
    const history = getHumanHistory(entries, 'carol');
    
    expect(history).toHaveLength(2);
    expect(history.every(e => e.humanId === 'carol')).toBe(true);
  });
});

describe('getRecentEntries', () => {
  const entries = createTestEntries();
  
  it('should return most recent entries', () => {
    const recent = getRecentEntries(entries, 3);
    
    expect(recent).toHaveLength(3);
    // Should be in descending order (newest first)
    const times = recent.map(e => new Date(e.timestamp).getTime());
    expect(times[0]).toBeGreaterThanOrEqual(times[1]);
    expect(times[1]).toBeGreaterThanOrEqual(times[2]);
  });
});

describe('countByEventType', () => {
  const entries = createTestEntries();
  
  it('should count entries by event type', () => {
    const counts = countByEventType(entries);
    
    expect(counts.get(AuditEventType.CHAIN_GENESIS)).toBe(1);
    expect(counts.get(AuditEventType.TASK_SUBMITTED)).toBe(2);
    expect(counts.get(AuditEventType.TASK_APPROVED)).toBe(1);
    expect(counts.get(AuditEventType.TASK_REJECTED)).toBe(1);
  });
});

describe('countByOutcome', () => {
  const entries = createTestEntries();
  
  it('should count entries by outcome', () => {
    const counts = countByOutcome(entries);
    
    expect(counts.has('success')).toBe(true);
    expect(counts.has('rejected')).toBe(true);
    expect(counts.has('pending')).toBe(true);
    expect(counts.has('error')).toBe(true);
  });
});

describe('groupByDate', () => {
  const entries = createTestEntries();
  
  it('should group entries by date', () => {
    const groups = groupByDate(entries);
    
    expect(groups.size).toBeGreaterThan(0);
    
    // All entries in test data have same date (today)
    const today = new Date().toISOString().slice(0, 10);
    expect(groups.has(today)).toBe(true);
    expect(groups.get(today)!.length).toBe(entries.length);
  });
});

describe('getSecurityEvents', () => {
  const entries = createTestEntries();
  
  it('should return security-related events', () => {
    const security = getSecurityEvents(entries);
    
    expect(security.length).toBeGreaterThan(0);
    expect(security.some(e => e.eventType === AuditEventType.SECURITY_ALERT)).toBe(true);
  });
});

describe('getTrustEvents', () => {
  const entries = createTestEntries();
  
  it('should return trust-related events', () => {
    const trust = getTrustEvents(entries);
    
    expect(trust.length).toBeGreaterThan(0);
    expect(trust.some(e => e.eventType === AuditEventType.TRUST_ELEVATED)).toBe(true);
  });
});

describe('searchDetails', () => {
  const entries = createTestEntries();
  
  it('should find entries by details content', () => {
    const results = searchDetails(entries, 'delete');
    
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(e => e.taskId === 'task-002')).toBe(true);
  });
  
  it('should be case insensitive', () => {
    const results = searchDetails(entries, 'DELETE');
    
    expect(results.length).toBeGreaterThan(0);
  });
  
  it('should return empty for no matches', () => {
    const results = searchDetails(entries, 'xyznotfound');
    
    expect(results).toHaveLength(0);
  });
});

describe('AuditQueryBuilder', () => {
  const entries = createTestEntries();
  
  it('should build and execute queries fluently', () => {
    const result = createQueryBuilder(entries)
      .eventTypes([AuditEventType.TASK_APPROVED, AuditEventType.TASK_REJECTED])
      .human('carol')
      .execute();
    
    expect(result.totalCount).toBe(2);
  });
  
  it('should support all filter methods', () => {
    const result = createQueryBuilder(entries)
      .sourceAgent('alice')
      .outcome('success')
      .limit(5)
      .descending()
      .execute();
    
    expect(result.entries.every(e => 
      e.sourceAgentId === 'alice' && e.outcome === 'success'
    )).toBe(true);
  });
  
  it('should support time range filtering', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    const result = createQueryBuilder(entries)
      .between(yesterday.toISOString(), tomorrow.toISOString())
      .execute();
    
    expect(result.entries.length).toBe(entries.length);
  });
  
  it('should chain all methods', () => {
    const builder = createQueryBuilder(entries)
      .taskId('task-001')
      .sourceAgent('alice')
      .targetAgent('bob')
      .outcome('success')
      .since('2020-01-01')
      .until('2030-01-01')
      .limit(10)
      .offset(0)
      .ascending();
    
    const result = builder.execute();
    expect(result.entries).toBeDefined();
  });
});
