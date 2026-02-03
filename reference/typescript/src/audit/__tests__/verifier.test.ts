/**
 * Tests for chain verification
 */

import { describe, it, expect } from 'vitest';
import {
  verifyChain,
  verifyEntry,
  verifyLink,
  detectTamperPoint,
  verifyRange,
  formatVerificationReport,
  getChainStats,
} from '../verifier';
import { createAuditEntry, createGenesisEntry } from '../audit-entry';
import { AuditEventType, AuditEntry } from '../types';

/**
 * Create a valid chain of entries
 */
function createValidChain(length: number): AuditEntry[] {
  const entries: AuditEntry[] = [];
  
  const genesis = createGenesisEntry('test-agent');
  entries.push(genesis);
  
  for (let i = 1; i < length; i++) {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: `agent-${i}`,
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
      details: { index: i },
    }, entries[i - 1].hash);
    entries.push(entry);
  }
  
  return entries;
}

describe('verifyChain', () => {
  it('should verify valid empty chain', () => {
    const result = verifyChain([]);
    
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(0);
  });
  
  it('should verify valid single entry chain', () => {
    const genesis = createGenesisEntry('test-agent');
    const result = verifyChain([genesis]);
    
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(1);
  });
  
  it('should verify valid multi-entry chain', () => {
    const entries = createValidChain(10);
    const result = verifyChain(entries);
    
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(10);
  });
  
  it('should detect invalid genesis prevHash', () => {
    const badGenesis = createAuditEntry({
      eventType: AuditEventType.CHAIN_GENESIS,
      sourceAgentId: 'test-agent',
      targetAgentId: 'test-agent',
      trustLevel: 0,
      outcome: 'success',
    }, 'non-null-hash'); // Should be null
    
    const result = verifyChain([badGenesis]);
    
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.errorType).toBe('prev_hash_mismatch');
  });
  
  it('should detect tampered hash', () => {
    const entries = createValidChain(5);
    
    // Tamper with entry 3's hash
    entries[3] = {
      ...entries[3],
      hash: 'x'.repeat(64),
    };
    
    const result = verifyChain(entries);
    
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.errorType).toBe('hash_mismatch');
  });
  
  it('should detect broken link', () => {
    const entries = createValidChain(5);
    
    // Create new entry with valid hash but wrong prevHash
    const replacement = createAuditEntry({
      eventType: entries[3].eventType,
      sourceAgentId: entries[3].sourceAgentId,
      targetAgentId: entries[3].targetAgentId,
      trustLevel: entries[3].trustLevel,
      outcome: entries[3].outcome,
      details: entries[3].details,
    }, 'wrong-prev-hash');
    
    entries[3] = replacement;
    
    const result = verifyChain(entries);
    
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(3);
    expect(result.errorType).toBe('prev_hash_mismatch');
  });
  
  it('should include evidence entries', () => {
    const entries = createValidChain(10);
    
    // Tamper with entry 5
    entries[5] = {
      ...entries[5],
      outcome: 'error',
    };
    
    const result = verifyChain(entries);
    
    expect(result.evidence).toBeDefined();
    expect(result.evidence!.length).toBe(3); // before, at, after
    expect(result.evidence![0].entryId).toBe(entries[4].entryId); // before
    expect(result.evidence![1].entryId).toBe(entries[5].entryId); // at
    expect(result.evidence![2].entryId).toBe(entries[6].entryId); // after
  });
  
  it('should include verification timestamp', () => {
    const entries = createValidChain(3);
    const result = verifyChain(entries);
    
    expect(result.verifiedAt).toBeDefined();
    expect(result.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('verifyEntry', () => {
  it('should return true for valid entry', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    expect(verifyEntry(entry)).toBe(true);
  });
  
  it('should return false for tampered entry', () => {
    const entry = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, null);
    
    const tampered = { ...entry, trustLevel: 5 };
    expect(verifyEntry(tampered)).toBe(false);
  });
});

describe('verifyLink', () => {
  it('should return true for properly linked entries', () => {
    const first = createGenesisEntry('agent');
    const second = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, first.hash);
    
    expect(verifyLink(second, first)).toBe(true);
  });
  
  it('should return true for genesis with null previous', () => {
    const genesis = createGenesisEntry('agent');
    expect(verifyLink(genesis, null)).toBe(true);
  });
  
  it('should return false for broken link', () => {
    const first = createGenesisEntry('agent');
    const second = createAuditEntry({
      eventType: AuditEventType.TASK_SUBMITTED,
      sourceAgentId: 'alice',
      targetAgentId: 'bob',
      trustLevel: 1,
      outcome: 'pending',
    }, 'wrong-hash');
    
    expect(verifyLink(second, first)).toBe(false);
  });
});

describe('detectTamperPoint', () => {
  it('should return -1 for valid chain', () => {
    const entries = createValidChain(5);
    expect(detectTamperPoint(entries)).toBe(-1);
  });
  
  it('should return index of first corrupted entry', () => {
    const entries = createValidChain(5);
    entries[3] = { ...entries[3], outcome: 'error' };
    
    expect(detectTamperPoint(entries)).toBe(3);
  });
  
  it('should return 0 for corrupted genesis', () => {
    const entries = createValidChain(3);
    entries[0] = { ...entries[0], sourceAgentId: 'evil' };
    
    expect(detectTamperPoint(entries)).toBe(0);
  });
});

describe('verifyRange', () => {
  it('should verify a valid range', () => {
    const entries = createValidChain(10);
    const result = verifyRange(entries, 3, 7);
    
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(4);
  });
  
  it('should detect corruption within range', () => {
    const entries = createValidChain(10);
    entries[5] = { ...entries[5], outcome: 'error' };
    
    const result = verifyRange(entries, 3, 8);
    
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(5);
  });
  
  it('should verify link to entry before range', () => {
    const entries = createValidChain(10);
    
    // Break link from entry 5 to entry 4
    const replacement = createAuditEntry({
      eventType: entries[5].eventType,
      sourceAgentId: entries[5].sourceAgentId,
      targetAgentId: entries[5].targetAgentId,
      trustLevel: entries[5].trustLevel,
      outcome: entries[5].outcome,
    }, 'wrong-hash');
    entries[5] = replacement;
    
    const result = verifyRange(entries, 5, 8);
    
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(5);
  });
  
  it('should handle invalid range', () => {
    const entries = createValidChain(5);
    
    const result = verifyRange(entries, 3, 2); // Invalid: start >= end
    expect(result.valid).toBe(false);
    expect(result.errorType).toBe('invalid_format');
  });
  
  it('should handle range starting at 0', () => {
    const entries = createValidChain(5);
    const result = verifyRange(entries, 0, 3);
    
    expect(result.valid).toBe(true);
    expect(result.entriesVerified).toBe(3);
  });
});

describe('formatVerificationReport', () => {
  it('should format valid chain report', () => {
    const entries = createValidChain(5);
    const result = verifyChain(entries);
    const report = formatVerificationReport(result);
    
    expect(report).toContain('VALID ✓');
    expect(report).toContain('Entries verified: 5');
  });
  
  it('should format corrupted chain report', () => {
    const entries = createValidChain(5);
    entries[3] = { ...entries[3], outcome: 'error' };
    
    const result = verifyChain(entries);
    const report = formatVerificationReport(result);
    
    expect(report).toContain('CORRUPTED ✗');
    expect(report).toContain('Broken at entry: 3');
    expect(report).toContain('hash_mismatch');
    expect(report).toContain('Evidence');
  });
});

describe('getChainStats', () => {
  it('should return stats for empty chain', () => {
    const stats = getChainStats([]);
    
    expect(stats.totalEntries).toBe(0);
    expect(stats.firstEntryTime).toBeNull();
    expect(stats.lastEntryTime).toBeNull();
  });
  
  it('should return stats for populated chain', () => {
    const entries = createValidChain(5);
    const stats = getChainStats(entries);
    
    expect(stats.totalEntries).toBe(5);
    expect(stats.firstEntryTime).toBeDefined();
    expect(stats.lastEntryTime).toBeDefined();
    expect(stats.eventTypeCounts[AuditEventType.CHAIN_GENESIS]).toBe(1);
    expect(stats.eventTypeCounts[AuditEventType.TASK_SUBMITTED]).toBe(4);
    expect(stats.outcomeCounts['success']).toBe(1);
    expect(stats.outcomeCounts['pending']).toBe(4);
  });
});
