/**
 * Tests for audit entry creation and hashing
 */

import { describe, it, expect } from 'vitest';
import {
  createAuditEntry,
  createGenesisEntry,
  computeEntryHash,
  recomputeEntryHash,
  verifyEntryHash,
  verifyEntryLink,
  serializeEntry,
  deserializeEntry,
  summarizeEntry,
  compareEntries,
} from '../audit-entry';
import { AuditEventType, AuditEntryData } from '../types';

describe('createAuditEntry', () => {
  it('should create entry with all fields', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      taskId: 'task-123',
      humanId: 'human-carol',
      trustLevel: 3,
      outcome: 'success',
      details: { approvalScope: 'single' },
    }, 'prev-hash-abc');
    
    expect(entry.eventType).toBe(AuditEventType.TASK_APPROVED);
    expect(entry.sourceAgentId).toBe('alice');
    expect(entry.targetAgentId).toBe('bob');
    expect(entry.taskId).toBe('task-123');
    expect(entry.humanId).toBe('human-carol');
    expect(entry.trustLevel).toBe(3);
    expect(entry.outcome).toBe('success');
    expect(entry.details).toEqual({ approvalScope: 'single' });
    expect(entry.prevHash).toBe('prev-hash-abc');
    expect(entry.hash).toHaveLength(64);
    expect(entry.entryId).toHaveLength(36); // UUID
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  
  it('should create entry with null prevHash for genesis', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.CHAIN_GENESIS,
      sourceAgentId: 'agent',
      targetAgentId: 'agent',
      trustLevel: 0,
      outcome: 'success',
    }, null);
    
    expect(entry.prevHash).toBeNull();
  });
  
  it('should use empty object for missing details', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    expect(entry.details).toEqual({});
  });
  
  it('should generate unique entry IDs', () => {
    const entry1 = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    const entry2 = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    expect(entry1.entryId).not.toBe(entry2.entryId);
  });
});

describe('createGenesisEntry', () => {
  it('should create a valid genesis entry', () => {
    const genesis = createGenesisEntry('my-agent');
    
    expect(genesis.eventType).toBe(AuditEventType.CHAIN_GENESIS);
    expect(genesis.sourceAgentId).toBe('my-agent');
    expect(genesis.targetAgentId).toBe('my-agent');
    expect(genesis.prevHash).toBeNull();
    expect(genesis.trustLevel).toBe(0);
    expect(genesis.outcome).toBe('success');
    expect(genesis.details).toHaveProperty('message');
    expect(genesis.details).toHaveProperty('version');
  });
});

describe('computeEntryHash', () => {
  it('should compute SHA-256 hash', () => {
    const data: AuditEntryData = {
      timestamp: '2026-02-02T20:00:00.000Z',
      entryId: 'entry-123',
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 3,
      outcome: 'success',
      details: {},
      prevHash: null,
    };
    
    const hash = computeEntryHash(data);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
  
  it('should produce consistent hashes for same data', () => {
    const data: AuditEntryData = {
      timestamp: '2026-02-02T20:00:00.000Z',
      entryId: 'entry-123',
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 3,
      outcome: 'success',
      details: {},
      prevHash: null,
    };
    
    const hash1 = computeEntryHash(data);
    const hash2 = computeEntryHash(data);
    expect(hash1).toBe(hash2);
  });
  
  it('should produce different hashes for different data', () => {
    const data1: AuditEntryData = {
      timestamp: '2026-02-02T20:00:00.000Z',
      entryId: 'entry-123',
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 3,
      outcome: 'success',
      details: {},
      prevHash: null,
    };
    
    const data2: AuditEntryData = {
      ...data1,
      outcome: 'rejected',
    };
    
    const hash1 = computeEntryHash(data1);
    const hash2 = computeEntryHash(data2);
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyEntryHash', () => {
  it('should return true for valid entry', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 3,
      outcome: 'success',
    }, null);
    
    expect(verifyEntryHash(entry)).toBe(true);
  });
  
  it('should return false for tampered entry', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 3,
      outcome: 'success',
    }, null);
    
    // Tamper with the entry
    const tampered = { ...entry, outcome: 'rejected' as const };
    expect(verifyEntryHash(tampered)).toBe(false);
  });
});

describe('verifyEntryLink', () => {
  it('should return true for properly linked entries', () => {
    const first = createAuditEntry({
      eventType: AuditEventType.CHAIN_GENESIS,
      sourceAgentId: 'agent',
      targetAgentId: 'agent',
      trustLevel: 0,
      outcome: 'success',
    }, null);
    
    const second = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, first.hash);
    
    expect(verifyEntryLink(second, first)).toBe(true);
  });
  
  it('should return true for genesis with null previous', () => {
    const genesis = createGenesisEntry('agent');
    expect(verifyEntryLink(genesis, null)).toBe(true);
  });
  
  it('should return false for broken link', () => {
    const first = createAuditEntry({
      eventType: AuditEventType.CHAIN_GENESIS,
      sourceAgentId: 'agent',
      targetAgentId: 'agent',
      trustLevel: 0,
      outcome: 'success',
    }, null);
    
    // Create second entry with wrong prevHash
    const second = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, 'wrong-hash');
    
    expect(verifyEntryLink(second, first)).toBe(false);
  });
});

describe('serializeEntry / deserializeEntry', () => {
  it('should serialize and deserialize correctly', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      taskId: 'task-123',
      humanId: 'carol',
      trustLevel: 3,
      outcome: 'success',
      details: { foo: 'bar' },
    }, 'prev-hash');
    
    const serialized = serializeEntry(entry);
    const deserialized = deserializeEntry(serialized);
    
    expect(deserialized).toEqual(entry);
  });
  
  it('should throw on malformed JSON', () => {
    expect(() => deserializeEntry('not json')).toThrow();
  });
  
  it('should throw on missing required fields', () => {
    expect(() => deserializeEntry('{}')).toThrow(/Missing required field/);
  });
});

describe('summarizeEntry', () => {
  it('should produce human-readable summary', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      taskId: 'task-123-456-789',
      humanId: 'carol',
      trustLevel: 3,
      outcome: 'success',
    }, null);
    
    const summary = summarizeEntry(entry);
    
    expect(summary).toContain('task.approved');
    expect(summary).toContain('task-123');
    expect(summary).toContain('carol');
    expect(summary).toContain('success');
  });
});

describe('compareEntries', () => {
  it('should compare entries by timestamp', () => {
    const earlier = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    // Wait a tiny bit to ensure different timestamps
    const later = createAuditEntry({
      eventType: AuditEventType.TASK_APPROVED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'success',
    }, earlier.hash);
    
    expect(compareEntries(earlier, later)).toBeLessThanOrEqual(0);
    expect(compareEntries(later, earlier)).toBeGreaterThanOrEqual(0);
  });
});
