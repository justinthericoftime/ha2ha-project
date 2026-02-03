/**
 * HA2HA JWS Verifier
 * 
 * Verifies Ed25519/EdDSA signatures in JWS format.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { base64urlToBytes, base64urlToString, base64ToBytes } from './keypair';
import type { JWSHeader, JWSSignature, SignedAgentCard } from './types';

// Configure ed25519 to use sha512 (v3 API)
ed.hashes.sha512 = sha512;

/**
 * Result of signature verification.
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** The agent ID from the signature header (if valid) */
  agentId?: string;
  /** Error message if verification failed */
  error?: string;
}

/**
 * Verifies JWS signatures using Ed25519 public keys.
 */
export class Verifier {
  /**
   * Verify a JWS signature against a public key.
   * 
   * @param signature - The JWS signature structure
   * @param data - The original signed data
   * @param publicKey - The public key to verify against (bytes or Base64)
   * @returns Verification result
   */
  static async verify(
    signature: JWSSignature,
    data: Uint8Array | string,
    publicKey: Uint8Array | string
  ): Promise<VerificationResult> {
    try {
      // Parse and validate header
      const headerJson = base64urlToString(signature.protected);
      const header = JSON.parse(headerJson) as JWSHeader;

      if (header.alg !== 'EdDSA') {
        return {
          valid: false,
          error: `Unsupported algorithm: ${header.alg}`,
        };
      }

      // Prepare payload
      const payload = typeof data === 'string'
        ? stringToBase64url(data)
        : bytesToBase64url(data);

      // Recreate signing input
      const signingInput = `${signature.protected}.${payload}`;
      const signingInputBytes = new TextEncoder().encode(signingInput);

      // Decode signature
      const signatureBytes = base64urlToBytes(signature.signature);

      // Decode public key
      const pubKeyBytes = typeof publicKey === 'string'
        ? decodePublicKey(publicKey)
        : publicKey;

      // Verify
      const valid = await ed.verifyAsync(signatureBytes, signingInputBytes, pubKeyBytes);

      return {
        valid,
        agentId: valid ? header.kid : undefined,
        error: valid ? undefined : 'Signature verification failed',
      };
    } catch (error) {
      return {
        valid: false,
        error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify a compact JWS string.
   * 
   * @param jws - Compact JWS: header.payload.signature
   * @param publicKey - Public key to verify against
   * @returns Verification result with decoded payload
   */
  static async verifyCompact(
    jws: string,
    publicKey: Uint8Array | string
  ): Promise<VerificationResult & { payload?: unknown }> {
    try {
      const parts = jws.split('.');
      if (parts.length !== 3) {
        return {
          valid: false,
          error: 'Invalid JWS format: expected 3 parts',
        };
      }

      const [protectedHeader, payloadBase64url, signatureBase64url] = parts;

      const signature: JWSSignature = {
        protected: protectedHeader,
        signature: signatureBase64url,
      };

      // Decode payload for verification
      const payloadJson = base64urlToString(payloadBase64url);
      
      // Verify using the original payload string
      const result = await Verifier.verify(signature, payloadJson, publicKey);

      if (result.valid) {
        try {
          return {
            ...result,
            payload: JSON.parse(payloadJson),
          };
        } catch {
          return {
            ...result,
            payload: payloadJson,
          };
        }
      }

      return result;
    } catch (error) {
      return {
        valid: false,
        error: `Verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify an Agent Card's cryptographic attestation.
   * 
   * @param card - The signed Agent Card
   * @param trustedKey - Optional: trusted public key (if not provided, uses embedded key)
   * @returns Verification result
   */
  static async verifyAgentCard(
    card: SignedAgentCard,
    trustedKey?: Uint8Array | string
  ): Promise<VerificationResult> {
    try {
      // Use trusted key or fall back to embedded key
      const publicKey = trustedKey || card.ha2ha.publicKey;

      // Recreate the signed content (card without ha2ha)
      const cardContent = JSON.stringify({
        name: card.name,
        version: card.version,
        capabilities: card.capabilities,
        url: card.url,
      });

      return Verifier.verify(card.ha2ha.attestation, cardContent, publicKey);
    } catch (error) {
      return {
        valid: false,
        error: `Card verification error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Extract the agent ID from a JWS signature without verifying.
   * Use this only for routing/logging, not for trust decisions.
   * 
   * @param signature - The JWS signature
   * @returns The claimed agent ID, or null if parsing fails
   */
  static extractAgentId(signature: JWSSignature): string | null {
    try {
      const headerJson = base64urlToString(signature.protected);
      const header = JSON.parse(headerJson) as JWSHeader;
      return header.kid || null;
    } catch {
      return null;
    }
  }
}

/**
 * Decode a public key from Base64 or Base64url format.
 */
function decodePublicKey(key: string): Uint8Array {
  // Try Base64url first (no padding, URL-safe chars)
  if (!key.includes('+') && !key.includes('/')) {
    return base64urlToBytes(key);
  }
  // Fall back to standard Base64
  return base64ToBytes(key);
}

/**
 * Convert string to Base64url (duplicated here to avoid circular imports).
 */
function stringToBase64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert bytes to Base64url.
 */
function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
