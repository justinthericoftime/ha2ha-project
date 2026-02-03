/**
 * Persistence Tests
 * 
 * Verifies trust state survives save/load cycles.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadTrustStore,
  saveTrustStore,
  loadTrustStoreSync,
  saveTrustStoreSync,
  createEmptyStore,
  setTrustEntry,
  getTrustEntry,
  listAgentIds,
  getAllEntries,
  removeTrustEntry,
} from '../persistence';
import { TrustEntry } from '../trust-entry';
import { TrustLevel, TransitionReason, ViolationSeverity } from '../types';

describe('Persistence functions', () => {
  let testDir: string;
  let testPath: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `ha2ha-trust-test-${Date.now()}`);
    testPath = path.join(testDir, 'agents.json');
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('createEmptyStore', () => {
    it('creates store with correct structure', () => {
      const store = createEmptyStore();
      expect(store.version).toBe(1);
      expect(store.agents).toEqual({});
      expect(store.lastUpdated).toBeDefined();
    });
  });

  describe('loadTrustStore', () => {
    it('returns empty store if file does not exist', async () => {
      const store = await loadTrustStore(testPath);
      expect(store.agents).toEqual({});
    });

    it('loads existing store from file', async () => {
      // Create and save a store first
      const store = createEmptyStore();
      const entry = TrustEntry.create('agent-1').toJSON();
      setTrustEntry(store, entry);
      await saveTrustStore(testPath, store);

      // Load it back
      const loaded = await loadTrustStore(testPath);
      expect(loaded.agents['agent-1']).toBeDefined();
      expect(loaded.agents['agent-1'].agentId).toBe('agent-1');
    });
  });

  describe('saveTrustStore', () => {
    it('creates directory if not exists', async () => {
      const store = createEmptyStore();
      await saveTrustStore(testPath, store);
      expect(fs.existsSync(testPath)).toBe(true);
    });

    it('creates backup of existing file', async () => {
      const store = createEmptyStore();
      await saveTrustStore(testPath, store);
      
      // Save again
      store.agents['test'] = TrustEntry.create('test').toJSON();
      await saveTrustStore(testPath, store);
      
      expect(fs.existsSync(testPath + '.backup')).toBe(true);
    });

    it('updates lastUpdated timestamp', async () => {
      const store = createEmptyStore();
      const before = store.lastUpdated;
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await saveTrustStore(testPath, store);
      
      expect(store.lastUpdated).not.toBe(before);
    });
  });

  describe('sync versions', () => {
    it('loadTrustStoreSync returns empty store if file missing', () => {
      const store = loadTrustStoreSync(testPath);
      expect(store.agents).toEqual({});
    });

    it('saveTrustStoreSync writes to file', () => {
      const store = createEmptyStore();
      setTrustEntry(store, TrustEntry.create('agent-sync').toJSON());
      saveTrustStoreSync(testPath, store);
      
      expect(fs.existsSync(testPath)).toBe(true);
      const loaded = loadTrustStoreSync(testPath);
      expect(loaded.agents['agent-sync']).toBeDefined();
    });
  });

  describe('store operations', () => {
    it('setTrustEntry adds entry to store', () => {
      const store = createEmptyStore();
      const entry = TrustEntry.create('new-agent').toJSON();
      
      setTrustEntry(store, entry);
      expect(store.agents['new-agent']).toBeDefined();
    });

    it('getTrustEntry retrieves entry from store', () => {
      const store = createEmptyStore();
      const entry = TrustEntry.create('get-test').toJSON();
      setTrustEntry(store, entry);
      
      const retrieved = getTrustEntry(store, 'get-test');
      expect(retrieved?.agentId).toBe('get-test');
    });

    it('getTrustEntry returns undefined for missing agent', () => {
      const store = createEmptyStore();
      expect(getTrustEntry(store, 'missing')).toBeUndefined();
    });

    it('listAgentIds returns all agent IDs', () => {
      const store = createEmptyStore();
      setTrustEntry(store, TrustEntry.create('a1').toJSON());
      setTrustEntry(store, TrustEntry.create('a2').toJSON());
      setTrustEntry(store, TrustEntry.create('a3').toJSON());
      
      const ids = listAgentIds(store);
      expect(ids).toHaveLength(3);
      expect(ids).toContain('a1');
      expect(ids).toContain('a2');
      expect(ids).toContain('a3');
    });

    it('getAllEntries returns all entries', () => {
      const store = createEmptyStore();
      setTrustEntry(store, TrustEntry.create('e1').toJSON());
      setTrustEntry(store, TrustEntry.create('e2').toJSON());
      
      const entries = getAllEntries(store);
      expect(entries).toHaveLength(2);
    });

    it('removeTrustEntry removes entry from store', () => {
      const store = createEmptyStore();
      setTrustEntry(store, TrustEntry.create('remove-me').toJSON());
      
      expect(removeTrustEntry(store, 'remove-me')).toBe(true);
      expect(store.agents['remove-me']).toBeUndefined();
    });

    it('removeTrustEntry returns false for missing agent', () => {
      const store = createEmptyStore();
      expect(removeTrustEntry(store, 'not-there')).toBe(false);
    });
  });

  describe('full save/load cycle', () => {
    it('preserves trust entry data through save/load', async () => {
      // Create entry with complex state
      const entry = TrustEntry.create('complex-agent', {
        initialLevel: TrustLevel.STANDARD,
        reason: TransitionReason.ALLOWLIST_MIGRATION,
        createdBy: 'system',
      });
      entry.recordViolation(ViolationSeverity.LOW, 'Test warning');
      entry.addPreApprovalScope('read:messages');
      
      // Save
      const store = createEmptyStore();
      setTrustEntry(store, entry.toJSON());
      await saveTrustStore(testPath, store);
      
      // Load
      const loaded = await loadTrustStore(testPath);
      const loadedEntry = new TrustEntry(loaded.agents['complex-agent']);
      
      // Verify
      expect(loadedEntry.level).toBe(TrustLevel.STANDARD);
      expect(loadedEntry.violationCount).toBe(1);
      expect(loadedEntry.hasPreApprovalScope('read:messages')).toBe(true);
      expect(loadedEntry.history).toHaveLength(2); // Initial + violation warning
    });
  });
});
