/**
 * Tests for tamper detection
 * 
 * These tests verify that the hash-chained audit log correctly
 * detects any modification to entries, as required by HA2HA
 * Specification §8.9 (Audit Log Integrity).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  AuditChain,
  ChainCorruptedError,
} from '../audit-chain';
import {
  verifyChain,
  detectTamperPoint,
  formatVerificationReport,
} from '../verifier';
import {
  createAuditEntry,
  createGenesisEntry,
  serializeEntry,
} from '../audit-entry';
import { AuditEventType, AuditEntry } from '../types';

describe('Tamper Detection', () => {
  let testDir: string;
  let testPath: string;
  
  beforeEach(() => {
    testDir = join(tmpdir(), `ha2ha-tamper-test-${randomUUID()}`);
    mkdirSync(testDir, { recursive: true });
    testPath = join(testDir, 'audit.jsonl');
  });
  
  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  /**
   * Helper to create a valid chain in file
   */
  async function createValidChain(entryCount: number): Promise<AuditEntry[]> {
    const chain = new AuditChain({
      storePath: testPath,
      agentId: 'test-agent',
    });
    await chain.load();
    
    for (let i = 0; i < entryCount; i++) {
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: `agent-${i}`,
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
        details: { index: i },
      });
    }
    
    return chain.getEntries();
  }
  
  /**
   * Helper to tamper with a file-based chain
   */
  function tamperFile(tamperedEntries: AuditEntry[]): void {
    const content = tamperedEntries.map(serializeEntry).join('\n') + '\n';
    writeFileSync(testPath, content);
  }
  
  describe('Hash Modification Detection', () => {
    it('should detect modified entry hash', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change the hash of entry 2
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        hash: 'a'.repeat(64), // Invalid hash
      };
      
      tamperFile(tampered);
      
      // Try to load - should detect corruption
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect modified entry content (outcome)', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change the outcome without updating hash
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        outcome: 'rejected', // Changed from 'pending'
      };
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect modified entry content (details)', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change the details
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        details: { index: 999, malicious: true },
      };
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect modified entry content (timestamp)', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change the timestamp
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        timestamp: '2020-01-01T00:00:00.000Z',
      };
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect modified entry content (trustLevel)', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change the trust level
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        trustLevel: 5, // Elevated from 1
      };
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
  });
  
  describe('Chain Link Detection', () => {
    it('should detect broken prevHash link', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: change prevHash to break the chain
      // Need to recompute hash after changing prevHash
      const tampered = [...entries];
      const brokenEntry = createAuditEntry({
        eventType: tampered[2].eventType,
        taskId: tampered[2].taskId,
        sourceAgentId: tampered[2].sourceAgentId,
        targetAgentId: tampered[2].targetAgentId,
        humanId: tampered[2].humanId,
        trustLevel: tampered[2].trustLevel,
        outcome: tampered[2].outcome,
        details: tampered[2].details,
      }, 'completely-wrong-hash');
      
      tampered[2] = brokenEntry;
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect removed entry', async () => {
      const entries = await createValidChain(5);
      
      // Tamper: remove entry 2 (entries 0, 1, 3, 4)
      const tampered = [
        entries[0],
        entries[1],
        // entries[2] is removed
        entries[3],
        entries[4],
      ];
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      // Entry 3 will have prevHash pointing to removed entry 2
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect reordered entries', async () => {
      const entries = await createValidChain(4);
      
      // Tamper: swap entries 2 and 3
      const tampered = [
        entries[0],
        entries[1],
        entries[3], // Swapped
        entries[2], // Swapped
      ];
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect inserted entry', async () => {
      const entries = await createValidChain(3);
      
      // Tamper: insert a fake entry between 1 and 2
      const fakeEntry = createAuditEntry({
        eventType: AuditEventType.TRUST_ELEVATED,
        sourceAgentId: 'malicious',
        targetAgentId: 'bob',
        trustLevel: 5,
        outcome: 'success',
      }, entries[1].hash); // Links to entry 1
      
      const tampered = [
        entries[0],
        entries[1],
        fakeEntry, // Inserted
        entries[2], // Entry 2's prevHash still points to entry 1, not fakeEntry
      ];
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
  });
  
  describe('Genesis Entry Protection', () => {
    it('should detect modified genesis entry', async () => {
      const entries = await createValidChain(2);
      
      // Tamper: modify genesis
      const tampered = [...entries];
      tampered[0] = {
        ...tampered[0],
        sourceAgentId: 'evil-agent',
      };
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
    
    it('should detect non-null prevHash in genesis', async () => {
      const entries = await createValidChain(2);
      
      // Tamper: create genesis with non-null prevHash
      const fakeGenesis = createAuditEntry({
        eventType: AuditEventType.CHAIN_GENESIS,
        sourceAgentId: 'test-agent',
        targetAgentId: 'test-agent',
        trustLevel: 0,
        outcome: 'success',
      }, 'fake-prev-hash'); // Should be null
      
      const tampered = [fakeGenesis, entries[1]];
      
      tamperFile(tampered);
      
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      await expect(chain.load()).rejects.toThrow(ChainCorruptedError);
    });
  });
  
  describe('Verification Functions', () => {
    it('detectTamperPoint should return index of first corrupted entry', async () => {
      const entries = await createValidChain(5);
      
      // Tamper entry 3
      const tampered = [...entries];
      tampered[3] = {
        ...tampered[3],
        outcome: 'error',
      };
      
      const index = detectTamperPoint(tampered);
      expect(index).toBe(3);
    });
    
    it('detectTamperPoint should return -1 for valid chain', async () => {
      const entries = await createValidChain(5);
      
      const index = detectTamperPoint(entries);
      expect(index).toBe(-1);
    });
    
    it('verifyChain should provide evidence entries', async () => {
      const entries = await createValidChain(5);
      
      // Tamper entry 3
      const tampered = [...entries];
      tampered[3] = {
        ...tampered[3],
        outcome: 'error',
      };
      
      const result = verifyChain(tampered);
      
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe(3);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.length).toBeGreaterThan(0);
      // Should include entries around the break point
      expect(result.evidence!.some(e => e.entryId === entries[2].entryId)).toBe(true);
      expect(result.evidence!.some(e => e.entryId === entries[3].entryId)).toBe(true);
    });
    
    it('formatVerificationReport should produce readable output', async () => {
      const entries = await createValidChain(3);
      
      // Tamper
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        outcome: 'error',
      };
      
      const result = verifyChain(tampered);
      const report = formatVerificationReport(result);
      
      expect(report).toContain('CORRUPTED');
      expect(report).toContain('Broken at entry');
      expect(report).toContain('hash_mismatch');
      expect(report).toContain('Evidence');
    });
  });
  
  describe('Evidence Preservation', () => {
    it('should preserve evidence when corruption detected', async () => {
      // Create a valid chain first
      const chain1 = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain1.load();
      
      await chain1.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      await chain1.append({
        eventType: AuditEventType.TASK_APPROVED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'success',
      });
      
      // Read file and tamper
      const content = readFileSync(testPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entries = lines.map(l => JSON.parse(l));
      
      entries[2].outcome = 'rejected'; // Tamper
      
      const tampered = entries.map((e: AuditEntry) => JSON.stringify(e)).join('\n') + '\n';
      writeFileSync(testPath, tampered);
      
      // Try to load - should throw but file should have tamper record appended
      const chain2 = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: true,
      });
      
      try {
        await chain2.load();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ChainCorruptedError);
        
        // Check that tamper detection was recorded
        const finalContent = readFileSync(testPath, 'utf-8');
        const finalLines = finalContent.trim().split('\n');
        const lastEntry = JSON.parse(finalLines[finalLines.length - 1]);
        
        expect(lastEntry.eventType).toBe(AuditEventType.CHAIN_TAMPER_DETECTED);
        expect(lastEntry.details.brokenAt).toBe(2);
      }
    });
  });
  
  describe('Load Without Verification', () => {
    it('should allow loading without verification', async () => {
      const entries = await createValidChain(3);
      
      // Tamper
      const tampered = [...entries];
      tampered[2] = {
        ...tampered[2],
        outcome: 'error',
      };
      
      tamperFile(tampered);
      
      // Load with verification disabled
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
        verifyOnLoad: false, // Disabled
      });
      
      // Should not throw
      await chain.load();
      // createValidChain(3) creates genesis + 3 entries = 4 total
      expect(chain.length).toBe(4);
      
      // But manual verification should still detect
      const result = chain.verify();
      expect(result.valid).toBe(false);
    });
  });
});
