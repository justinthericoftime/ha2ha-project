/**
 * Tests for Ed25519 keypair management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  KeyPair,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64url,
  base64urlToBytes,
  stringToBase64url,
  base64urlToString,
} from '../keypair';

describe('KeyPair', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ha2ha-keypair-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('should generate a new keypair', async () => {
      const keyPair = await KeyPair.generate();
      
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey.length).toBe(32);
      expect(keyPair.privateKey.length).toBe(32);
    });

    it('should generate unique keypairs', async () => {
      const kp1 = await KeyPair.generate();
      const kp2 = await KeyPair.generate();
      
      expect(bytesToBase64(kp1.publicKey)).not.toBe(bytesToBase64(kp2.publicKey));
      expect(bytesToBase64(kp1.privateKey)).not.toBe(bytesToBase64(kp2.privateKey));
    });

    it('should set createdAt timestamp', async () => {
      const before = new Date();
      const keyPair = await KeyPair.generate();
      const after = new Date();
      
      expect(keyPair.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(keyPair.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('fromPrivateKey', () => {
    it('should derive public key from private key', async () => {
      const original = await KeyPair.generate();
      const restored = await KeyPair.fromPrivateKey(original.privateKey);
      
      expect(bytesToBase64(restored.publicKey)).toBe(bytesToBase64(original.publicKey));
    });

    it('should reject invalid private key length', async () => {
      const invalidKey = new Uint8Array(16); // Wrong length
      
      await expect(KeyPair.fromPrivateKey(invalidKey)).rejects.toThrow('Private key must be 32 bytes');
    });
  });

  describe('toBase64 / fromBase64', () => {
    it('should round-trip through Base64 serialization', async () => {
      const original = await KeyPair.generate();
      const data = original.toBase64();
      const restored = await KeyPair.fromBase64(data);
      
      expect(bytesToBase64(restored.publicKey)).toBe(bytesToBase64(original.publicKey));
      expect(bytesToBase64(restored.privateKey)).toBe(bytesToBase64(original.privateKey));
      expect(restored.createdAt.toISOString()).toBe(original.createdAt.toISOString());
    });

    it('should include algorithm in serialized data', async () => {
      const keyPair = await KeyPair.generate();
      const data = keyPair.toBase64();
      
      expect(data.algorithm).toBe('Ed25519');
    });

    it('should reject unsupported algorithm', async () => {
      const keyPair = await KeyPair.generate();
      const data = keyPair.toBase64();
      data.algorithm = 'RSA' as any;
      
      await expect(KeyPair.fromBase64(data)).rejects.toThrow('Unsupported algorithm');
    });
  });

  describe('save / load', () => {
    it('should save and load keypair from disk', async () => {
      const original = await KeyPair.generate();
      const keyDir = path.join(tempDir, 'keys');
      
      await original.save(keyDir);
      const loaded = await KeyPair.load(keyDir);
      
      expect(bytesToBase64(loaded.publicKey)).toBe(bytesToBase64(original.publicKey));
      expect(bytesToBase64(loaded.privateKey)).toBe(bytesToBase64(original.privateKey));
    });

    it('should create directory if it does not exist', async () => {
      const keyPair = await KeyPair.generate();
      const keyDir = path.join(tempDir, 'nested', 'path', 'keys');
      
      await keyPair.save(keyDir);
      
      const stats = await fs.stat(keyDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should save private key with restrictive permissions', async () => {
      const keyPair = await KeyPair.generate();
      const keyDir = path.join(tempDir, 'secure-keys');
      
      await keyPair.save(keyDir);
      
      const stats = await fs.stat(path.join(keyDir, 'private.key'));
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should report existence correctly', async () => {
      const keyDir = path.join(tempDir, 'check-exists');
      
      expect(await KeyPair.exists(keyDir)).toBe(false);
      
      const keyPair = await KeyPair.generate();
      await keyPair.save(keyDir);
      
      expect(await KeyPair.exists(keyDir)).toBe(true);
    });
  });

  describe('sign / verify', () => {
    it('should sign and verify data', async () => {
      const keyPair = await KeyPair.generate();
      const data = new TextEncoder().encode('Hello, HA2HA!');
      
      const signature = await keyPair.sign(data);
      const isValid = await keyPair.verify(signature, data);
      
      expect(signature.length).toBe(64);
      expect(isValid).toBe(true);
    });

    it('should reject tampered data', async () => {
      const keyPair = await KeyPair.generate();
      const data = new TextEncoder().encode('Hello, HA2HA!');
      const tampered = new TextEncoder().encode('Hello, Tampered!');
      
      const signature = await keyPair.sign(data);
      const isValid = await keyPair.verify(signature, tampered);
      
      expect(isValid).toBe(false);
    });

    it('should reject signature from different key', async () => {
      const keyPair1 = await KeyPair.generate();
      const keyPair2 = await KeyPair.generate();
      const data = new TextEncoder().encode('Hello, HA2HA!');
      
      const signature = await keyPair1.sign(data);
      const isValid = await keyPair2.verify(signature, data);
      
      expect(isValid).toBe(false);
    });
  });
});

describe('Base64 utilities', () => {
  describe('bytesToBase64 / base64ToBytes', () => {
    it('should round-trip bytes through Base64', () => {
      const original = new Uint8Array([0, 127, 255, 1, 2, 3]);
      const encoded = bytesToBase64(original);
      const decoded = base64ToBytes(encoded);
      
      expect(decoded).toEqual(original);
    });
  });

  describe('bytesToBase64url / base64urlToBytes', () => {
    it('should produce URL-safe encoding', () => {
      // These bytes produce +/= in standard Base64
      const bytes = new Uint8Array([251, 255, 254]);
      const encoded = bytesToBase64url(bytes);
      
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should round-trip bytes through Base64url', () => {
      const original = new Uint8Array([0, 127, 255, 1, 2, 3, 251, 254]);
      const encoded = bytesToBase64url(original);
      const decoded = base64urlToBytes(encoded);
      
      expect(decoded).toEqual(original);
    });
  });

  describe('stringToBase64url / base64urlToString', () => {
    it('should round-trip strings through Base64url', () => {
      const original = 'Hello, HA2HA! 🚀';
      const encoded = stringToBase64url(original);
      const decoded = base64urlToString(encoded);
      
      expect(decoded).toBe(original);
    });
  });
});
