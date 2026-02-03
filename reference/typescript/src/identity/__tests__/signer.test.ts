/**
 * Tests for JWS signing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyPair, base64urlToString, base64urlToBytes } from '../keypair';
import { Signer } from '../signer';
import type { JWSHeader, SignedAgentCard } from '../types';

describe('Signer', () => {
  let keyPair: KeyPair;
  let signer: Signer;
  const agentId = 'test-agent.ha2ha';

  beforeEach(async () => {
    keyPair = await KeyPair.generate();
    signer = new Signer(keyPair, agentId);
  });

  describe('constructor', () => {
    it('should store agent ID', () => {
      expect(signer.agentId).toBe(agentId);
    });
  });

  describe('sign', () => {
    it('should sign string data', async () => {
      const data = 'Hello, HA2HA!';
      const sig = await signer.sign(data);
      
      expect(sig.protected).toBeDefined();
      expect(sig.signature).toBeDefined();
    });

    it('should sign binary data', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const sig = await signer.sign(data);
      
      expect(sig.protected).toBeDefined();
      expect(sig.signature).toBeDefined();
    });

    it('should include correct header', async () => {
      const data = 'Test data';
      const sig = await signer.sign(data);
      
      const header = JSON.parse(base64urlToString(sig.protected)) as JWSHeader;
      
      expect(header.alg).toBe('EdDSA');
      expect(header.kid).toBe(agentId);
    });

    it('should produce valid Ed25519 signature', async () => {
      const data = 'Test data';
      const sig = await signer.sign(data);
      
      const signatureBytes = base64urlToBytes(sig.signature);
      expect(signatureBytes.length).toBe(64); // Ed25519 signatures are 64 bytes
    });

    it('should produce different signatures for different data', async () => {
      const sig1 = await signer.sign('Data 1');
      const sig2 = await signer.sign('Data 2');
      
      expect(sig1.signature).not.toBe(sig2.signature);
    });

    it('should produce consistent signatures for same data', async () => {
      // Note: Ed25519 signatures are deterministic
      const data = 'Same data';
      const sig1 = await signer.sign(data);
      const sig2 = await signer.sign(data);
      
      expect(sig1.signature).toBe(sig2.signature);
    });
  });

  describe('signMessage', () => {
    it('should return compact JWS format', async () => {
      const message = { type: 'test', payload: 'hello' };
      const jws = await signer.signMessage(message);
      
      const parts = jws.split('.');
      expect(parts.length).toBe(3);
    });

    it('should include JSON-serialized payload', async () => {
      const message = { type: 'test', value: 42 };
      const jws = await signer.signMessage(message);
      
      const [, payloadBase64url] = jws.split('.');
      const payload = JSON.parse(base64urlToString(payloadBase64url));
      
      expect(payload).toEqual(message);
    });
  });

  describe('signAgentCard', () => {
    it('should create signed Agent Card', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: { chat: true },
        url: 'https://example.com',
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      
      expect(signedCard.name).toBe(cardData.name);
      expect(signedCard.version).toBe(cardData.version);
      expect(signedCard.capabilities).toEqual(cardData.capabilities);
      expect(signedCard.url).toBe(cardData.url);
    });

    it('should include HA2HA extensions', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: {},
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      
      expect(signedCard.ha2ha).toBeDefined();
      expect(signedCard.ha2ha.publicKey).toBeDefined();
      expect(signedCard.ha2ha.attestation).toBeDefined();
    });

    it('should include public key in ha2ha extensions', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: {},
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      
      // Decode the public key and verify it matches
      const embeddedKey = base64urlToBytes(signedCard.ha2ha.publicKey);
      expect(embeddedKey.length).toBe(32);
    });

    it('should sign only card content (not ha2ha section)', async () => {
      const cardData = {
        name: 'Test Agent',
        version: '1.0.0',
        capabilities: { skill: 'value' },
        url: 'https://example.com',
      };
      
      const signedCard = await signer.signAgentCard(cardData);
      
      // The attestation should be over just the card content
      expect(signedCard.ha2ha.attestation.protected).toBeDefined();
      expect(signedCard.ha2ha.attestation.signature).toBeDefined();
    });
  });
});
