/**
 * HA2HA Cryptographic Identity Types
 * 
 * Defines interfaces for agent identity, keypairs, and signatures
 * per HA2HA spec §8.6 Cryptographic Attestation.
 */

/**
 * Ed25519 keypair data in Base64 format for serialization.
 */
export interface KeyPairData {
  /** Base64-encoded public key (32 bytes) */
  publicKey: string;
  /** Base64-encoded private key (32 bytes seed) */
  privateKey: string;
  /** ISO 8601 timestamp of key creation */
  createdAt: string;
  /** Cryptographic algorithm (always Ed25519) */
  algorithm: 'Ed25519';
}

/**
 * Complete agent identity data for persistence.
 */
export interface AgentIdentityData {
  /** Unique agent identifier (e.g., "luca.ricardo.ha2ha") */
  agentId: string;
  /** Human-readable display name */
  displayName?: string;
  /** The agent's cryptographic keypair */
  keyPair: KeyPairData;
  /** ISO 8601 timestamp of identity creation */
  createdAt: string;
  /** ISO 8601 timestamp of last use */
  lastUsed?: string;
}

/**
 * JWS (JSON Web Signature) header for EdDSA signatures.
 */
export interface JWSHeader {
  /** Algorithm identifier (EdDSA for Ed25519) */
  alg: 'EdDSA';
  /** Key ID - the agent ID that owns the signing key */
  kid: string;
}

/**
 * Compact JWS signature structure.
 */
export interface JWSSignature {
  /** Base64url-encoded JSON header */
  protected: string;
  /** Base64url-encoded signature bytes */
  signature: string;
}

/**
 * HA2HA extensions to an A2A Agent Card.
 */
export interface HA2HAExtensions {
  /** Base64-encoded Ed25519 public key */
  publicKey: string;
  /** JWS signature over the card content */
  attestation: JWSSignature;
}

/**
 * Signed Agent Card with HA2HA cryptographic attestation.
 * Extends the A2A Agent Card with identity verification.
 */
export interface SignedAgentCard {
  /** Agent name */
  name: string;
  /** Agent version */
  version: string;
  /** Agent capabilities */
  capabilities: Record<string, unknown>;
  /** Optional agent URL */
  url?: string;
  /** HA2HA cryptographic extensions */
  ha2ha: HA2HAExtensions;
}

/**
 * Trust levels for known keys.
 */
export type KeyTrust = 'trusted' | 'provisional' | 'revoked';

/**
 * Entry in the known keys registry.
 */
export interface KnownKeyEntry {
  /** Agent ID this key belongs to */
  agentId: string;
  /** Base64-encoded public key */
  publicKey: string;
  /** ISO 8601 timestamp when key was added */
  addedAt: string;
  /** Human operator who approved this key */
  addedBy: string;
  /** Current trust status */
  trust: KeyTrust;
  /** Optional notes about this key */
  notes?: string;
  /** ISO 8601 timestamp of revocation (if revoked) */
  revokedAt?: string;
  /** Reason for revocation (if revoked) */
  revokedReason?: string;
}

/**
 * Registry of all known keys, stored as JSON.
 */
export interface KnownKeysRegistry {
  /** Version for future migrations */
  version: number;
  /** Map of agent ID to key entry */
  keys: Record<string, KnownKeyEntry>;
  /** ISO 8601 timestamp of last update */
  lastUpdated: string;
}
