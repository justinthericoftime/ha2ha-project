/**
 * HA2HA Cryptographic Identity Module
 * 
 * Provides Ed25519-based cryptographic identity for agents, including:
 * - Keypair generation and management
 * - Agent identity with persistence
 * - JWS signing and verification
 * - Trusted public key store
 * 
 * @example
 * ```typescript
 * import { AgentIdentity, Signer, Verifier, KnownKeys } from '@ha2ha/reference/identity';
 * 
 * // Create or load agent identity
 * const identity = await AgentIdentity.loadOrCreate(
 *   '/path/to/identity',
 *   'my-agent.example.ha2ha',
 *   'My Agent'
 * );
 * 
 * // Sign messages
 * const signer = new Signer(identity.keyPair, identity.agentId);
 * const signedMessage = await signer.signMessage({ hello: 'world' });
 * 
 * // Verify signatures
 * const result = await Verifier.verifyCompact(signedMessage, identity.publicKeyBase64);
 * console.log(result.valid); // true
 * ```
 */

// Types
export type {
  KeyPairData,
  AgentIdentityData,
  JWSHeader,
  JWSSignature,
  HA2HAExtensions,
  SignedAgentCard,
  KeyTrust,
  KnownKeyEntry,
  KnownKeysRegistry,
} from './types';

// Keypair management
export {
  KeyPair,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64url,
  base64urlToBytes,
  stringToBase64url,
  base64urlToString,
} from './keypair';

// Agent identity
export { AgentIdentity } from './agent-identity';

// Signing
export { Signer, createSigner } from './signer';

// Verification
export { Verifier } from './verifier';
export type { VerificationResult } from './verifier';

// Known keys store
export { KnownKeys } from './known-keys';
