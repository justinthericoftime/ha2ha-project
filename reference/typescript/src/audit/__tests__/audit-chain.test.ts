/**
 * Tests for AuditChain class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import {
  AuditChain,
  ChainCorruptedError,
  createAuditChain,
  getDefaultAuditPath,
} from '../audit-chain';
import { AuditEventType } from '../types';

describe('AuditChain', () => {
  let testDir: string;
  let testPath: string;
  
  beforeEach(() => {
    testDir = join(tmpdir(), `ha2ha-audit-test-${randomUUID()}`);
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
  
  describe('load', () => {
    it('should create genesis entry for new chain', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      
      await chain.load();
      
      expect(chain.length).toBe(1);
      expect(chain.isLoaded()).toBe(true);
      
      const genesis = chain.getEntry(0);
      expect(genesis).toBeDefined();
      expect(genesis!.eventType).toBe(AuditEventType.CHAIN_GENESIS);
      expect(genesis!.prevHash).toBeNull();
    });
    
    it('should create storage directory if needed', async () => {
      const nestedPath = join(testDir, 'nested', 'deep', 'audit.jsonl');
      const chain = new AuditChain({
        storePath: nestedPath,
        agentId: 'test-agent',
      });
      
      await chain.load();
      
      expect(existsSync(nestedPath)).toBe(true);
    });
    
    it('should load existing chain', async () => {
      // Create chain and add entries
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
      
      // Load in new instance
      const chain2 = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain2.load();
      
      expect(chain2.length).toBe(2);
      expect(chain2.getEntry(1)!.eventType).toBe(AuditEventType.TASK_SUBMITTED);
    });
  });
  
  describe('append', () => {
    it('should append entry with correct prevHash', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      const genesisHash = chain.getLastHash();
      
      const entry = await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      expect(entry.prevHash).toBe(genesisHash);
      expect(chain.length).toBe(2);
    });
    
    it('should persist entries to storage', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      // Reload and verify
      const chain2 = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain2.load();
      
      expect(chain2.length).toBe(2);
    });
    
    it('should throw if not loaded', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      
      await expect(chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      })).rejects.toThrow('not loaded');
    });
    
    it('should chain multiple entries correctly', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      const entry1 = await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      const entry2 = await chain.append({
        eventType: AuditEventType.TASK_APPROVED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'success',
        humanId: 'carol',
      });
      
      const entry3 = await chain.append({
        eventType: AuditEventType.TASK_EXECUTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'success',
      });
      
      expect(entry2.prevHash).toBe(entry1.hash);
      expect(entry3.prevHash).toBe(entry2.hash);
      expect(chain.length).toBe(4); // genesis + 3
    });
  });
  
  describe('verify', () => {
    it('should verify valid chain', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      await chain.append({
        eventType: AuditEventType.TASK_APPROVED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'success',
      });
      
      const result = chain.verify();
      
      expect(result.valid).toBe(true);
      expect(result.entriesVerified).toBe(3);
    });
  });
  
  describe('getters', () => {
    it('should return last hash', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      const hash = chain.getLastHash();
      expect(hash).toHaveLength(64);
    });
    
    it('should return last entry', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      const last = chain.getLastEntry();
      expect(last!.eventType).toBe(AuditEventType.TASK_SUBMITTED);
    });
    
    it('should return all entries', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      const entries = chain.getEntries();
      expect(entries).toHaveLength(2);
      // Should return a copy
      entries.push({} as any);
      expect(chain.getEntries()).toHaveLength(2);
    });
  });
  
  describe('clear', () => {
    it('should clear in-memory state', async () => {
      const chain = new AuditChain({
        storePath: testPath,
        agentId: 'test-agent',
      });
      await chain.load();
      
      await chain.append({
        eventType: AuditEventType.TASK_SUBMITTED,
        sourceAgentId: 'alice',
        targetAgentId: 'bob',
        trustLevel: 1,
        outcome: 'pending',
      });
      
      chain.clear();
      
      expect(chain.isLoaded()).toBe(false);
      expect(chain.length).toBe(0);
      
      // Should be able to reload
      await chain.load();
      expect(chain.length).toBe(2); // Genesis + 1 from file
    });
  });
});

describe('createAuditChain', () => {
  it('should create configured chain', () => {
    const chain = createAuditChain('/tmp/test.jsonl', 'test-agent');
    expect(chain).toBeInstanceOf(AuditChain);
    expect(chain.getStorePath()).toBe('/tmp/test.jsonl');
  });
});

describe('getDefaultAuditPath', () => {
  it('should return path with agent ID', () => {
    const path = getDefaultAuditPath('my-agent');
    expect(path).toContain('my-agent');
    expect(path).toContain('.ha2ha');
    expect(path).toContain('.jsonl');
  });
});
