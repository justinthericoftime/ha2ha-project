/**
 * Tests for Agent Identity management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentIdentity } from '../agent-identity';
import { bytesToBase64 } from '../keypair';

describe('AgentIdentity', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ha2ha-identity-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('should create new identity with generated keypair', async () => {
      const identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
      
      expect(identity.agentId).toBe('test-agent.ha2ha');
      expect(identity.displayName).toBe('Test Agent');
      expect(identity.keyPair).toBeDefined();
      expect(identity.keyPair.publicKey.length).toBe(32);
    });

    it('should create identity without display name', async () => {
      const identity = await AgentIdentity.create('minimal-agent.ha2ha');
      
      expect(identity.agentId).toBe('minimal-agent.ha2ha');
      expect(identity.displayName).toBeUndefined();
    });

    it('should set creation timestamp', async () => {
      const before = new Date();
      const identity = await AgentIdentity.create('test.ha2ha');
      const after = new Date();
      
      expect(identity.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(identity.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('save / load', () => {
    it('should save and load identity', async () => {
      const original = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
      const identityPath = path.join(tempDir, 'identity');
      
      await original.save(identityPath);
      const loaded = await AgentIdentity.load(identityPath);
      
      expect(loaded.agentId).toBe(original.agentId);
      expect(loaded.displayName).toBe(original.displayName);
      expect(bytesToBase64(loaded.keyPair.publicKey)).toBe(bytesToBase64(original.keyPair.publicKey));
    });

    it('should preserve creation timestamp through save/load', async () => {
      const original = await AgentIdentity.create('test.ha2ha');
      const identityPath = path.join(tempDir, 'identity');
      
      await original.save(identityPath);
      const loaded = await AgentIdentity.load(identityPath);
      
      expect(loaded.createdAt.toISOString()).toBe(original.createdAt.toISOString());
    });

    it('should create necessary files', async () => {
      const identity = await AgentIdentity.create('test.ha2ha');
      const identityPath = path.join(tempDir, 'identity');
      
      await identity.save(identityPath);
      
      await expect(fs.access(path.join(identityPath, 'private.key'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(identityPath, 'public.key'))).resolves.toBeUndefined();
      await expect(fs.access(path.join(identityPath, 'identity.json'))).resolves.toBeUndefined();
    });
  });

  describe('loadOrCreate', () => {
    it('should create new identity if none exists', async () => {
      const identityPath = path.join(tempDir, 'new-identity');
      
      const identity = await AgentIdentity.loadOrCreate(identityPath, 'new-agent.ha2ha', 'New Agent');
      
      expect(identity.agentId).toBe('new-agent.ha2ha');
      expect(identity.displayName).toBe('New Agent');
    });

    it('should load existing identity', async () => {
      const identityPath = path.join(tempDir, 'existing-identity');
      
      // Create and save first
      const original = await AgentIdentity.create('existing.ha2ha', 'Existing');
      await original.save(identityPath);
      
      // Load should return existing
      const loaded = await AgentIdentity.loadOrCreate(identityPath, 'different.ha2ha', 'Different');
      
      // Should use existing identity, not the new parameters
      expect(loaded.agentId).toBe('existing.ha2ha');
      expect(bytesToBase64(loaded.keyPair.publicKey)).toBe(bytesToBase64(original.keyPair.publicKey));
    });

    it('should persist newly created identity', async () => {
      const identityPath = path.join(tempDir, 'persist-identity');
      
      const created = await AgentIdentity.loadOrCreate(identityPath, 'new.ha2ha');
      const loaded = await AgentIdentity.load(identityPath);
      
      expect(loaded.agentId).toBe(created.agentId);
      expect(bytesToBase64(loaded.keyPair.publicKey)).toBe(bytesToBase64(created.keyPair.publicKey));
    });
  });

  describe('publicKeyBase64', () => {
    it('should return Base64-encoded public key', async () => {
      const identity = await AgentIdentity.create('test.ha2ha');
      
      const base64 = identity.publicKeyBase64;
      
      expect(typeof base64).toBe('string');
      expect(base64.length).toBeGreaterThan(0);
      expect(base64).toBe(bytesToBase64(identity.keyPair.publicKey));
    });
  });

  describe('touch', () => {
    it('should update lastUsed timestamp', async () => {
      const identity = await AgentIdentity.create('test.ha2ha');
      
      expect(identity.lastUsed).toBeUndefined();
      
      identity.touch();
      
      expect(identity.lastUsed).toBeDefined();
      expect(identity.lastUsed).toBeInstanceOf(Date);
    });

    it('should update lastUsed on each call', async () => {
      const identity = await AgentIdentity.create('test.ha2ha');
      
      identity.touch();
      const first = identity.lastUsed!.getTime();
      
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      identity.touch();
      const second = identity.lastUsed!.getTime();
      
      expect(second).toBeGreaterThanOrEqual(first);
    });
  });

  describe('toData', () => {
    it('should serialize identity to data object', async () => {
      const identity = await AgentIdentity.create('test.ha2ha', 'Test');
      
      const data = identity.toData();
      
      expect(data.agentId).toBe('test.ha2ha');
      expect(data.displayName).toBe('Test');
      expect(data.keyPair).toBeDefined();
      expect(data.keyPair.algorithm).toBe('Ed25519');
      expect(data.createdAt).toBeDefined();
    });
  });

  describe('getDefaultPath', () => {
    it('should return path under .openclaw', () => {
      const path = AgentIdentity.getDefaultPath('test.ha2ha');
      
      expect(path).toContain('.openclaw');
      expect(path).toContain('ha2ha');
      expect(path).toContain('identity');
      expect(path).toContain('test.ha2ha');
    });

    it('should use custom base directory', () => {
      const customBase = '/custom/base';
      const path = AgentIdentity.getDefaultPath('test.ha2ha', customBase);
      
      expect(path).toBe('/custom/base/test.ha2ha');
    });
  });
});
