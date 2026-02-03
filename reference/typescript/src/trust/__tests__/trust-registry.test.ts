/**
 * Trust Registry Tests
 * 
 * Verifies central trust management functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TrustRegistry } from '../trust-registry';
import { TrustLevel, ViolationSeverity } from '../types';

describe('TrustRegistry', () => {
  let testDir: string;
  let testPath: string;
  let registry: TrustRegistry;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ha2ha-registry-test-${Date.now()}`);
    testPath = path.join(testDir, 'agents.json');
    registry = new TrustRegistry({ storePath: testPath, autoSave: false });
    await registry.load();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getTrust', () => {
    it('creates new entry for unknown agent', () => {
      const entry = registry.getTrust('new-agent');
      expect(entry.level).toBe(TrustLevel.UNKNOWN);
      expect(entry.agentId).toBe('new-agent');
    });

    it('returns existing entry for known agent', async () => {
      await registry.setTrust('known-agent', TrustLevel.TRUSTED, 'admin');
      const entry = registry.getTrust('known-agent');
      expect(entry.level).toBe(TrustLevel.TRUSTED);
    });
  });

  describe('getTrustContext', () => {
    it('returns trust context for agent', () => {
      const context = registry.getTrustContext('ctx-agent');
      expect(context.level).toBe(TrustLevel.UNKNOWN);
      expect(context.levelName).toBe('UNKNOWN');
    });
  });

  describe('setTrust', () => {
    it('sets trust level for agent', async () => {
      await registry.setTrust('set-agent', TrustLevel.STANDARD, 'admin');
      expect(registry.getTrustLevel('set-agent')).toBe(TrustLevel.STANDARD);
    });
  });

  describe('elevateTrust', () => {
    it('elevates trust when allowed', async () => {
      await registry.setTrust('elev-agent', TrustLevel.PROVISIONAL, 'admin');
      registry.getTrust('elev-agent').clearCooldown();
      
      const success = await registry.elevateTrust('elev-agent', 'admin');
      expect(success).toBe(true);
      expect(registry.getTrustLevel('elev-agent')).toBe(TrustLevel.STANDARD);
    });

    it('fails when in cooldown', async () => {
      await registry.setTrust('cooldown-agent', TrustLevel.PROVISIONAL, 'admin');
      // Don't clear cooldown
      
      const success = await registry.elevateTrust('cooldown-agent', 'admin');
      expect(success).toBe(false);
      expect(registry.getTrustLevel('cooldown-agent')).toBe(TrustLevel.PROVISIONAL);
    });
  });

  describe('recordViolation', () => {
    it('records violation and reduces trust', async () => {
      await registry.setTrust('viol-agent', TrustLevel.TRUSTED, 'admin');
      await registry.recordViolation('viol-agent', ViolationSeverity.MEDIUM, 'Test');
      
      expect(registry.getTrustLevel('viol-agent')).toBe(TrustLevel.STANDARD);
    });

    it('adds to violation log', async () => {
      await registry.recordViolation('log-agent', ViolationSeverity.LOW, 'Minor issue');
      
      const log = registry.getViolationLog();
      expect(log).toHaveLength(1);
      expect(log[0].agentId).toBe('log-agent');
    });
  });

  describe('blockAgent / unblockAgent', () => {
    it('blocks agent', async () => {
      await registry.setTrust('block-agent', TrustLevel.STANDARD, 'admin');
      await registry.blockAgent('block-agent', 'Security concern', 'security-bot');
      
      expect(registry.getTrustLevel('block-agent')).toBe(TrustLevel.BLOCKED);
      expect(registry.getTrust('block-agent').isBlocked).toBe(true);
    });

    it('unblocks agent to UNKNOWN', async () => {
      await registry.blockAgent('unblock-agent', 'Test');
      await registry.unblockAgent('unblock-agent', 'admin');
      
      expect(registry.getTrustLevel('unblock-agent')).toBe(TrustLevel.UNKNOWN);
    });
  });

  describe('hasAgent', () => {
    it('returns true for known agent', () => {
      registry.getTrust('has-agent'); // Creates entry
      expect(registry.hasAgent('has-agent')).toBe(true);
    });

    it('returns false for unknown agent', () => {
      expect(registry.hasAgent('unknown-agent')).toBe(false);
    });
  });

  describe('removeAgent', () => {
    it('removes agent from registry', async () => {
      registry.getTrust('remove-agent');
      expect(registry.hasAgent('remove-agent')).toBe(true);
      
      await registry.removeAgent('remove-agent');
      expect(registry.hasAgent('remove-agent')).toBe(false);
    });
  });

  describe('listing methods', () => {
    beforeEach(async () => {
      await registry.setTrust('a1', TrustLevel.BLOCKED, 'admin');
      await registry.setTrust('a2', TrustLevel.STANDARD, 'admin');
      await registry.setTrust('a3', TrustLevel.TRUSTED, 'admin');
      await registry.setTrust('a4', TrustLevel.BLOCKED, 'admin');
    });

    it('listAgentIds returns all IDs', () => {
      const ids = registry.listAgentIds();
      expect(ids).toContain('a1');
      expect(ids).toContain('a2');
      expect(ids).toContain('a3');
      expect(ids).toContain('a4');
    });

    it('listAgents returns all entries', () => {
      const agents = registry.listAgents();
      expect(agents).toHaveLength(4);
    });

    it('getBlockedAgents returns only blocked', () => {
      const blocked = registry.getBlockedAgents();
      expect(blocked).toHaveLength(2);
      expect(blocked.every(e => e.isBlocked)).toBe(true);
    });

    it('getAgentsByLevel filters by level', () => {
      const trusted = registry.getAgentsByLevel(TrustLevel.TRUSTED);
      expect(trusted).toHaveLength(1);
      expect(trusted[0].agentId).toBe('a3');
    });
  });

  describe('importFromAllowlist', () => {
    it('imports allowed agents at STANDARD level', async () => {
      const count = await registry.importFromAllowlist(
        ['allowed-1', 'allowed-2', 'allowed-3'],
        'migration-script'
      );
      
      expect(count).toBe(3);
      expect(registry.getTrustLevel('allowed-1')).toBe(TrustLevel.STANDARD);
      expect(registry.getTrustLevel('allowed-2')).toBe(TrustLevel.STANDARD);
      expect(registry.getTrustLevel('allowed-3')).toBe(TrustLevel.STANDARD);
    });

    it('does not overwrite existing entries', async () => {
      await registry.setTrust('existing', TrustLevel.TRUSTED, 'admin');
      
      const count = await registry.importFromAllowlist(['existing', 'new-one'], 'script');
      
      expect(count).toBe(1); // Only new-one added
      expect(registry.getTrustLevel('existing')).toBe(TrustLevel.TRUSTED);
      expect(registry.getTrustLevel('new-one')).toBe(TrustLevel.STANDARD);
    });
  });

  describe('getStats', () => {
    it('returns correct statistics', async () => {
      await registry.setTrust('s1', TrustLevel.BLOCKED, 'admin');
      await registry.setTrust('s2', TrustLevel.UNKNOWN, 'admin');
      await registry.setTrust('s3', TrustLevel.STANDARD, 'admin');
      await registry.setTrust('s4', TrustLevel.STANDARD, 'admin');
      await registry.recordViolation('s3', ViolationSeverity.LOW, 'Warning');
      await registry.recordViolation('s4', ViolationSeverity.LOW, 'Warning');
      await registry.recordViolation('s4', ViolationSeverity.LOW, 'Warning 2');
      
      const stats = registry.getStats();
      
      expect(stats.totalAgents).toBe(4);
      expect(stats.levelCounts[TrustLevel.BLOCKED]).toBe(1);
      expect(stats.levelCounts[TrustLevel.UNKNOWN]).toBe(1);
      expect(stats.levelCounts[TrustLevel.STANDARD]).toBe(2);
      expect(stats.totalViolations).toBe(3);
    });
  });

  describe('persistence', () => {
    it('saves and loads state correctly', async () => {
      await registry.setTrust('persist-agent', TrustLevel.TRUSTED, 'admin');
      await registry.recordViolation('persist-agent', ViolationSeverity.LOW, 'Test');
      await registry.save();
      
      // Create new registry and load
      const newRegistry = new TrustRegistry({ storePath: testPath, autoSave: false });
      await newRegistry.load();
      
      expect(newRegistry.getTrustLevel('persist-agent')).toBe(TrustLevel.TRUSTED);
      expect(newRegistry.getTrust('persist-agent').violationCount).toBe(1);
    });
  });
});
