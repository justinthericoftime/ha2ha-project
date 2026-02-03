/**
 * Tests for Known Keys store.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { KnownKeys } from '../known-keys';
import { KeyPair, bytesToBase64 } from '../keypair';

describe('KnownKeys', () => {
  let tempDir: string;
  let knownKeys: KnownKeys;
  let testKeyPair: KeyPair;
  let testPublicKey: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ha2ha-known-keys-test-'));
    knownKeys = new KnownKeys(tempDir);
    testKeyPair = await KeyPair.generate();
    testPublicKey = bytesToBase64(testKeyPair.publicKey);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('load', () => {
    it('should create empty registry if none exists', async () => {
      await knownKeys.load();
      
      const entries = knownKeys.list();
      expect(entries).toHaveLength(0);
    });

    it('should load existing registry', async () => {
      // Pre-create registry
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'registry.json'),
        JSON.stringify({
          version: 1,
          keys: {
            'existing.ha2ha': {
              agentId: 'existing.ha2ha',
              publicKey: testPublicKey,
              addedAt: new Date().toISOString(),
              addedBy: 'admin',
              trust: 'trusted',
            },
          },
          lastUpdated: new Date().toISOString(),
        })
      );

      await knownKeys.load();
      
      expect(knownKeys.get('existing.ha2ha')).not.toBeNull();
      expect(knownKeys.isTrusted('existing.ha2ha')).toBe(true);
    });
  });

  describe('add / addTrusted / addProvisional', () => {
    it('should add trusted key', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin', 'Test key');
      
      const entry = knownKeys.get('agent.ha2ha');
      expect(entry).not.toBeNull();
      expect(entry!.trust).toBe('trusted');
      expect(entry!.addedBy).toBe('admin');
      expect(entry!.notes).toBe('Test key');
    });

    it('should add provisional key', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      
      const entry = knownKeys.get('agent.ha2ha');
      expect(entry).not.toBeNull();
      expect(entry!.trust).toBe('provisional');
    });

    it('should set addedAt timestamp', () => {
      const before = new Date();
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      const after = new Date();
      
      const entry = knownKeys.get('agent.ha2ha');
      const addedAt = new Date(entry!.addedAt);
      
      expect(addedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(addedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('save', () => {
    it('should persist registry to disk', async () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      await knownKeys.save();
      
      const newKnownKeys = new KnownKeys(tempDir);
      await newKnownKeys.load();
      
      expect(newKnownKeys.isTrusted('agent.ha2ha')).toBe(true);
    });

    it('should create .pub files for non-revoked keys', async () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      await knownKeys.save();
      
      const pubFile = await fs.readFile(path.join(tempDir, 'agent.ha2ha.pub'), 'utf-8');
      const pubData = JSON.parse(pubFile);
      
      expect(pubData.agentId).toBe('agent.ha2ha');
      expect(pubData.publicKey).toBe(testPublicKey);
      expect(pubData.trust).toBe('trusted');
    });

    it('should create directory if needed', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'known-keys');
      const nestedKnownKeys = new KnownKeys(nestedPath);
      
      nestedKnownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      await nestedKnownKeys.save();
      
      const stats = await fs.stat(nestedPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('isTrusted / isKnown', () => {
    it('should return true for trusted keys', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      
      expect(knownKeys.isTrusted('agent.ha2ha')).toBe(true);
      expect(knownKeys.isKnown('agent.ha2ha')).toBe(true);
    });

    it('should return false for provisional keys (isTrusted)', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      
      expect(knownKeys.isTrusted('agent.ha2ha')).toBe(false);
      expect(knownKeys.isKnown('agent.ha2ha')).toBe(true);
    });

    it('should return false for unknown keys', () => {
      expect(knownKeys.isTrusted('unknown.ha2ha')).toBe(false);
      expect(knownKeys.isKnown('unknown.ha2ha')).toBe(false);
    });

    it('should return false for revoked keys', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      knownKeys.revoke('agent.ha2ha', 'Compromised');
      
      expect(knownKeys.isTrusted('agent.ha2ha')).toBe(false);
      expect(knownKeys.isKnown('agent.ha2ha')).toBe(false);
    });
  });

  describe('getPublicKey', () => {
    it('should return public key bytes for trusted agent', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      
      const key = knownKeys.getPublicKey('agent.ha2ha');
      
      expect(key).not.toBeNull();
      expect(key!.length).toBe(32);
    });

    it('should return null for provisional when requireTrusted=true', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      
      const key = knownKeys.getPublicKey('agent.ha2ha', true);
      
      expect(key).toBeNull();
    });

    it('should return key for provisional when requireTrusted=false', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      
      const key = knownKeys.getPublicKey('agent.ha2ha', false);
      
      expect(key).not.toBeNull();
    });

    it('should return null for unknown agent', () => {
      const key = knownKeys.getPublicKey('unknown.ha2ha');
      
      expect(key).toBeNull();
    });

    it('should return null for revoked agent', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      knownKeys.revoke('agent.ha2ha', 'Test');
      
      const key = knownKeys.getPublicKey('agent.ha2ha');
      
      expect(key).toBeNull();
    });
  });

  describe('getPublicKeyBase64', () => {
    it('should return Base64 string', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      
      const key = knownKeys.getPublicKeyBase64('agent.ha2ha');
      
      expect(key).toBe(testPublicKey);
    });
  });

  describe('revoke', () => {
    it('should mark key as revoked', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      knownKeys.revoke('agent.ha2ha', 'Key compromised');
      
      const entry = knownKeys.get('agent.ha2ha');
      
      expect(entry!.trust).toBe('revoked');
      expect(entry!.revokedReason).toBe('Key compromised');
      expect(entry!.revokedAt).toBeDefined();
    });

    it('should not throw for non-existent key', () => {
      expect(() => knownKeys.revoke('nonexistent.ha2ha', 'Test')).not.toThrow();
    });
  });

  describe('approve', () => {
    it('should upgrade provisional to trusted', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      
      const result = knownKeys.approve('agent.ha2ha', 'admin');
      
      expect(result).toBe(true);
      expect(knownKeys.isTrusted('agent.ha2ha')).toBe(true);
    });

    it('should return false for already trusted', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      
      const result = knownKeys.approve('agent.ha2ha', 'admin');
      
      expect(result).toBe(false);
    });

    it('should return false for non-existent', () => {
      const result = knownKeys.approve('nonexistent.ha2ha', 'admin');
      
      expect(result).toBe(false);
    });

    it('should add approval note', () => {
      knownKeys.addProvisional('agent.ha2ha', testPublicKey, 'system');
      knownKeys.approve('agent.ha2ha', 'admin');
      
      const entry = knownKeys.get('agent.ha2ha');
      
      expect(entry!.notes).toContain('Approved by admin');
    });
  });

  describe('list', () => {
    it('should return all keys', () => {
      knownKeys.addTrusted('agent1.ha2ha', testPublicKey, 'admin');
      knownKeys.addProvisional('agent2.ha2ha', testPublicKey, 'system');
      
      const entries = knownKeys.list();
      
      expect(entries).toHaveLength(2);
    });

    it('should filter by trust level', () => {
      knownKeys.addTrusted('agent1.ha2ha', testPublicKey, 'admin');
      knownKeys.addProvisional('agent2.ha2ha', testPublicKey, 'system');
      
      const trusted = knownKeys.list({ trust: 'trusted' });
      const provisional = knownKeys.list({ trust: 'provisional' });
      
      expect(trusted).toHaveLength(1);
      expect(trusted[0].agentId).toBe('agent1.ha2ha');
      expect(provisional).toHaveLength(1);
      expect(provisional[0].agentId).toBe('agent2.ha2ha');
    });
  });

  describe('remove', () => {
    it('should remove key entry', () => {
      knownKeys.addTrusted('agent.ha2ha', testPublicKey, 'admin');
      
      const result = knownKeys.remove('agent.ha2ha');
      
      expect(result).toBe(true);
      expect(knownKeys.get('agent.ha2ha')).toBeNull();
    });

    it('should return false for non-existent key', () => {
      const result = knownKeys.remove('nonexistent.ha2ha');
      
      expect(result).toBe(false);
    });
  });

  describe('getDefaultPath', () => {
    it('should return path under .openclaw', () => {
      const defaultPath = KnownKeys.getDefaultPath();
      
      expect(defaultPath).toContain('.openclaw');
      expect(defaultPath).toContain('ha2ha');
      expect(defaultPath).toContain('known-keys');
    });

    it('should use custom base directory', () => {
      const customPath = KnownKeys.getDefaultPath('/custom/base');
      
      expect(customPath).toBe('/custom/base/known-keys');
    });
  });
});
