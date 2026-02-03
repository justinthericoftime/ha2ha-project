/**
 * Integration tests for full attestation flow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AgentIdentity } from '../agent-identity';
import { Signer, createSigner } from '../signer';
import { Verifier } from '../verifier';
import { KnownKeys } from '../known-keys';

describe('Attestation Flow', () => {
  let tempDir: string;
  let aliceIdentity: AgentIdentity;
  let bobIdentity: AgentIdentity;
  let aliceSigner: Signer;
  let bobSigner: Signer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ha2ha-attestation-test-'));
    
    // Create two agent identities
    aliceIdentity = await AgentIdentity.create('alice.ha2ha', 'Alice Agent');
    bobIdentity = await AgentIdentity.create('bob.ha2ha', 'Bob Agent');
    
    aliceSigner = createSigner(aliceIdentity);
    bobSigner = createSigner(bobIdentity);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Agent Card Exchange', () => {
    it('should create and verify agent cards', async () => {
      // Alice creates her Agent Card
      const aliceCard = await aliceSigner.signAgentCard({
        name: 'Alice Agent',
        version: '1.0.0',
        capabilities: { chat: true, tasks: true },
        url: 'https://alice.example.com/.well-known/agent.json',
      });

      // Bob receives Alice's card and verifies it
      // First verification uses embedded key (initial contact)
      const initialResult = await Verifier.verifyAgentCard(aliceCard);
      expect(initialResult.valid).toBe(true);

      // Bob adds Alice's key to known keys after human approval
      const bobKnownKeys = new KnownKeys(path.join(tempDir, 'bob-known-keys'));
      bobKnownKeys.addTrusted(
        'alice.ha2ha',
        aliceIdentity.publicKeyBase64,
        'bob-human',
        'Verified via video call'
      );
      await bobKnownKeys.save();

      // Future verifications use trusted key store
      const trustedKey = bobKnownKeys.getPublicKey('alice.ha2ha');
      expect(trustedKey).not.toBeNull();

      const trustedResult = await Verifier.verifyAgentCard(aliceCard, trustedKey!);
      expect(trustedResult.valid).toBe(true);
    });

    it('should reject tampered agent card', async () => {
      const card = await aliceSigner.signAgentCard({
        name: 'Alice Agent',
        version: '1.0.0',
        capabilities: {},
      });

      // Attacker modifies capabilities
      card.capabilities = { admin: true };

      const result = await Verifier.verifyAgentCard(card);
      expect(result.valid).toBe(false);
    });
  });

  describe('Message Exchange', () => {
    it('should sign and verify messages between agents', async () => {
      // Alice sends a signed message to Bob
      const message = {
        from: 'alice.ha2ha',
        to: 'bob.ha2ha',
        type: 'request',
        payload: { action: 'fetch-data', params: { id: '123' } },
        timestamp: new Date().toISOString(),
      };

      const signedMessage = await aliceSigner.signMessage(message);

      // Bob verifies the message
      // Bob has Alice's key in known keys
      const bobKnownKeys = new KnownKeys(path.join(tempDir, 'bob-keys'));
      bobKnownKeys.addTrusted('alice.ha2ha', aliceIdentity.publicKeyBase64, 'bob-human');

      const trustedKey = bobKnownKeys.getPublicKeyBase64('alice.ha2ha');
      const result = await Verifier.verifyCompact(signedMessage, trustedKey!);

      expect(result.valid).toBe(true);
      expect(result.agentId).toBe('alice.ha2ha');
      expect(result.payload).toEqual(message);
    });

    it('should reject message with wrong signature', async () => {
      const message = {
        from: 'alice.ha2ha',
        to: 'bob.ha2ha',
        content: 'Hello Bob!',
      };

      // Alice signs the message
      const signedMessage = await aliceSigner.signMessage(message);

      // Eve (attacker) doesn't have Alice's key
      const eveIdentity = await AgentIdentity.create('eve.ha2ha', 'Eve');
      
      // Verification with Eve's key fails
      const result = await Verifier.verifyCompact(signedMessage, eveIdentity.publicKeyBase64);
      expect(result.valid).toBe(false);
    });
  });

  describe('Unknown Agent Blocking', () => {
    it('should block unknown agents', async () => {
      // Unknown agent sends a message
      const unknownIdentity = await AgentIdentity.create('unknown.ha2ha');
      const unknownSigner = createSigner(unknownIdentity);
      
      const message = { content: 'Hello!' };
      const signedMessage = await unknownSigner.signMessage(message);

      // Receiving agent checks known keys
      const receiverKnownKeys = new KnownKeys(path.join(tempDir, 'receiver-keys'));
      await receiverKnownKeys.load();

      // Extract claimed agent ID
      const [protectedHeader] = signedMessage.split('.');
      const header = JSON.parse(Buffer.from(protectedHeader, 'base64').toString());
      const claimedAgentId = header.kid;

      // Check if agent is known
      const isKnown = receiverKnownKeys.isKnown(claimedAgentId);
      expect(isKnown).toBe(false);

      // Can't verify - no trusted key
      const trustedKey = receiverKnownKeys.getPublicKey(claimedAgentId);
      expect(trustedKey).toBeNull();
    });

    it('should allow messages from known agents', async () => {
      const receiverKnownKeys = new KnownKeys(path.join(tempDir, 'receiver-keys'));
      receiverKnownKeys.addTrusted('alice.ha2ha', aliceIdentity.publicKeyBase64, 'human');
      await receiverKnownKeys.save();

      const message = { content: 'Hello!' };
      const signedMessage = await aliceSigner.signMessage(message);

      // Extract agent ID
      const [protectedHeader] = signedMessage.split('.');
      const header = JSON.parse(Buffer.from(protectedHeader, 'base64').toString());
      const agentId = header.kid;

      // Check if known
      expect(receiverKnownKeys.isKnown(agentId)).toBe(true);
      expect(receiverKnownKeys.isTrusted(agentId)).toBe(true);

      // Verify message
      const trustedKey = receiverKnownKeys.getPublicKey(agentId);
      const result = await Verifier.verifyCompact(signedMessage, trustedKey!);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Key Revocation', () => {
    it('should block revoked agents', async () => {
      const knownKeys = new KnownKeys(path.join(tempDir, 'keys'));
      knownKeys.addTrusted('alice.ha2ha', aliceIdentity.publicKeyBase64, 'human');
      
      // Initially trusted
      expect(knownKeys.isTrusted('alice.ha2ha')).toBe(true);
      
      // Revoke the key
      knownKeys.revoke('alice.ha2ha', 'Suspected compromise');
      
      // No longer trusted
      expect(knownKeys.isTrusted('alice.ha2ha')).toBe(false);
      expect(knownKeys.getPublicKey('alice.ha2ha')).toBeNull();
    });
  });

  describe('Provisional Keys', () => {
    it('should handle provisional key workflow', async () => {
      const knownKeys = new KnownKeys(path.join(tempDir, 'keys'));
      
      // Unknown agent contacts us - add as provisional
      knownKeys.addProvisional('new-agent.ha2ha', aliceIdentity.publicKeyBase64, 'system');
      
      // Known but not trusted
      expect(knownKeys.isKnown('new-agent.ha2ha')).toBe(true);
      expect(knownKeys.isTrusted('new-agent.ha2ha')).toBe(false);
      
      // Human approves
      knownKeys.approve('new-agent.ha2ha', 'admin');
      
      // Now trusted
      expect(knownKeys.isTrusted('new-agent.ha2ha')).toBe(true);
    });
  });

  describe('Identity Persistence', () => {
    it('should maintain identity across restarts', async () => {
      const identityPath = path.join(tempDir, 'alice-identity');
      
      // Create and save identity
      const original = await AgentIdentity.create('alice.ha2ha', 'Alice');
      await original.save(identityPath);
      
      // Sign a message
      const signer1 = createSigner(original);
      const message = { content: 'Test' };
      const signed1 = await signer1.signMessage(message);
      
      // "Restart" - load identity from disk
      const loaded = await AgentIdentity.load(identityPath);
      const signer2 = createSigner(loaded);
      
      // Sign same message - should produce same signature (Ed25519 is deterministic)
      const signed2 = await signer2.signMessage(message);
      
      expect(signed1).toBe(signed2);
      
      // Verify with original public key
      const result = await Verifier.verifyCompact(signed2, original.publicKeyBase64);
      expect(result.valid).toBe(true);
    });
  });
});
