/**
 * Tests for JWS verification.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyPair, bytesToBase64, bytesToBase64url } from '../keypair';
import { Signer } from '../signer';
import { Verifier } from '../verifier';

describe('Verifier', () => {
  let keyPair: KeyPair;
  let signer: Signer;
  const agentId = 'test-agent.ha2ha';

  beforeEach(async () => {
    keyPair = await KeyPair.generate();
    signer = new Signer(keyPair, agentId);
  });

  describe('verify', () => {
    it('should verify valid signature', async () => {
      const data = 'Hello, HA2HA!';
      const sig = await signer.sign(data);
      
      const result = await Verifier.verify(sig, data, keyPair.publicKey);
      
      expect(result.valid).toBe(true);
      expect(result.agentId).toBe(agentId);
      expect(result.error).toBeUndefined();
    });

    it('should verify with Base64 public key', async () => {
      const data = 'Hello, HA2HA!';
      const sig = await signer.sign(data);
      const publicKeyBase64 = bytesToBase64(keyPair.publicKey);
      
      const result = await Verifier.verify(sig, data, publicKeyBase64);
      
      expect(result.valid).toBe(true);
    });

    it('should verify with Base64url public key', async () => {
      const data = 'Hello, HA2HA!';
      const sig = await signer.sign(data);
      const publicKeyBase64url = bytesToBase64url(keyPair.publicKey);
      
      const result = await Verifier.verify(sig, data, publicKeyBase64url);
      
      expect(result.valid).toBe(true);
    });

    it('should reject tampered data', async () => {
      const data = 'Original data';
      const sig = await signer.sign(data);
      
      const result = await Verifier.verify(sig, 'Tampered data', keyPair.publicKey);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject wrong public key', async () => {
      const data = 'Test data';
      const sig = await signer.sign(data);
      
      const otherKeyPair = await KeyPair.generate();
      const result = await Verifier.verify(sig, data, otherKeyPair.publicKey);
      
      expect(result.valid).toBe(false);
    });

    it('should reject unsupported algorithm', async () => {
      // Create a signature with wrong algorithm header
      const data = 'Test data';
      const fakeHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: agentId }))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
      
      const result = await Verifier.verify(
        { protected: fakeHeader, signature: 'invalid' },
        data,
        keyPair.publicKey
      );
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported algorithm');
    });
  });

  describe('verifyCompact', () => {
    it('should verify compact JWS', async () => {
      const message = { type: 'test', value: 42 };
      const jws = await signer.signMessage(message);
      
      const result = await Verifier.verifyCompact(jws, keyPair.publicKey);
      
      expect(result.valid).toBe(true);
      expect(result.payload).toEqual(message);
      expect(result.agentId).toBe(agentId);
    });

    it('should reject invalid JWS format', async () => {
      const result = await Verifier.verifyCompact('not.valid', keyPair.publicKey);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid JWS format');
    });

    it('should return decoded payload on success', async () => {
      const message = { nested: { data: 'value' }, array: [1, 2, 3] };
      const jws = await signer.signMessage(message);
      
      const result = await Verifier.verifyCompact(jws, keyPair.publicKey);
      
      expect(result.payload).toEqual(message);
    });
  });

  describe('verifyAgentCard', () => {
    it('should verify Agent Card with embedded key', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: { chat: true },
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      const result = await Verifier.verifyAgentCard(signedCard);
      
      expect(result.valid).toBe(true);
    });

    it('should verify Agent Card with trusted key', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: {},
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      const result = await Verifier.verifyAgentCard(signedCard, keyPair.publicKey);
      
      expect(result.valid).toBe(true);
    });

    it('should reject tampered Agent Card', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: {},
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      
      // Tamper with the card
      signedCard.name = 'Tampered Agent';
      
      const result = await Verifier.verifyAgentCard(signedCard);
      
      expect(result.valid).toBe(false);
    });

    it('should reject Agent Card with wrong trusted key', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: {},
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      const wrongKeyPair = await KeyPair.generate();
      
      const result = await Verifier.verifyAgentCard(signedCard, wrongKeyPair.publicKey);
      
      expect(result.valid).toBe(false);
    });
  });

  describe('extractAgentId', () => {
    it('should extract agent ID from signature', async () => {
      const sig = await signer.sign('test');
      
      const extractedId = Verifier.extractAgentId(sig);
      
      expect(extractedId).toBe(agentId);
    });

    it('should return null for invalid signature', () => {
      const result = Verifier.extractAgentId({
        protected: 'invalid-base64',
        signature: 'test',
      });
      
      expect(result).toBeNull();
    });
  });
});
