/**
 * HA2HA JWS Signer
 * 
 * Signs data and Agent Cards using Ed25519/EdDSA in JWS compact format.
 */

import { KeyPair, bytesToBase64url, stringToBase64url } from './keypair';
import type { JWSHeader, JWSSignature, SignedAgentCard, HA2HAExtensions } from './types';

/**
 * Creates JWS signatures using an Ed25519 keypair.
 */
export class Signer {
  private _keyPair: KeyPair;
  private _agentId: string;

  /**
   * Create a new Signer.
   * 
   * @param keyPair - The keypair to sign with
   * @param agentId - The agent ID (used as key ID in signatures)
   */
  constructor(keyPair: KeyPair, agentId: string) {
    this._keyPair = keyPair;
    this._agentId = agentId;
  }

  /**
   * The agent ID used in signatures.
   */
  get agentId(): string {
    return this._agentId;
  }

  /**
   * Sign arbitrary data and return a JWS signature.
   * 
   * @param data - Data to sign (string or bytes)
   * @returns JWS signature structure
   */
  async sign(data: Uint8Array | string): Promise<JWSSignature> {
    // Create JWS header
    const header: JWSHeader = {
      alg: 'EdDSA',
      kid: this._agentId,
    };

    // Encode header
    const protectedHeader = stringToBase64url(JSON.stringify(header));

    // Encode payload
    const payload = typeof data === 'string'
      ? stringToBase64url(data)
      : bytesToBase64url(data);

    // Create signing input: header.payload
    const signingInput = `${protectedHeader}.${payload}`;
    const signingInputBytes = new TextEncoder().encode(signingInput);

    // Sign
    const signatureBytes = await this._keyPair.sign(signingInputBytes);

    return {
      protected: protectedHeader,
      signature: bytesToBase64url(signatureBytes),
    };
  }

  /**
   * Sign a message object and return the compact JWS string.
   * 
   * @param message - Object to sign (will be JSON-serialized)
   * @returns Compact JWS: header.payload.signature
   */
  async signMessage(message: unknown): Promise<string> {
    const payload = JSON.stringify(message);
    const signature = await this.sign(payload);
    const payloadBase64url = stringToBase64url(payload);
    
    return `${signature.protected}.${payloadBase64url}.${signature.signature}`;
  }

  /**
   * Sign an Agent Card with HA2HA cryptographic attestation.
   * 
   * @param cardData - Partial agent card data (ha2ha will be added)
   * @returns Complete signed Agent Card
   */
  async signAgentCard(cardData: Omit<SignedAgentCard, 'ha2ha'>): Promise<SignedAgentCard> {
    // Create the card content to sign (without ha2ha section)
    const cardContent = JSON.stringify({
      name: cardData.name,
      version: cardData.version,
      capabilities: cardData.capabilities,
      url: cardData.url,
    });

    // Sign the card content
    const attestation = await this.sign(cardContent);

    // Build HA2HA extensions
    const ha2ha: HA2HAExtensions = {
      publicKey: bytesToBase64url(this._keyPair.publicKey),
      attestation,
    };

    return {
      ...cardData,
      ha2ha,
    };
  }

  /**
   * Create a detached signature for data.
   * The payload is not included in the signature structure.
   * 
   * @param data - Data to sign
   * @returns JWS with detached payload
   */
  async signDetached(data: Uint8Array | string): Promise<JWSSignature> {
    // Same as sign, but we don't include the payload in output
    return this.sign(data);
  }
}

/**
 * Helper to create a Signer from an AgentIdentity.
 */
export function createSigner(identity: { keyPair: KeyPair; agentId: string }): Signer {
  return new Signer(identity.keyPair, identity.agentId);
}
