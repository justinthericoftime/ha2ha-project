/**
 * HA2HA Ed25519 Keypair Management
 * 
 * Handles generation, serialization, and persistence of Ed25519 keypairs
 * using @noble/ed25519 for cryptographic operations.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { KeyPairData } from './types';

// Configure ed25519 to use sha512 for sync operations (v3 API)
ed.hashes.sha512 = sha512;

/**
 * Represents an Ed25519 keypair for cryptographic operations.
 */
export class KeyPair {
  private _privateKey: Uint8Array;
  private _publicKey: Uint8Array;
  private _createdAt: Date;

  private constructor(privateKey: Uint8Array, publicKey: Uint8Array, createdAt?: Date) {
    this._privateKey = privateKey;
    this._publicKey = publicKey;
    this._createdAt = createdAt || new Date();
  }

  /**
   * Generate a new random Ed25519 keypair.
   */
  static async generate(): Promise<KeyPair> {
    const { secretKey, publicKey } = await ed.keygenAsync();
    return new KeyPair(secretKey, publicKey, new Date());
  }

  /**
   * Create a KeyPair from an existing private key.
   * The public key is derived from the private key.
   */
  static async fromPrivateKey(privateKey: Uint8Array, createdAt?: Date): Promise<KeyPair> {
    if (privateKey.length !== 32) {
      throw new Error('Private key must be 32 bytes');
    }
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    return new KeyPair(privateKey, publicKey, createdAt);
  }

  /**
   * Restore a KeyPair from serialized Base64 data.
   */
  static async fromBase64(data: KeyPairData): Promise<KeyPair> {
    if (data.algorithm !== 'Ed25519') {
      throw new Error(`Unsupported algorithm: ${data.algorithm}`);
    }
    const privateKey = base64ToBytes(data.privateKey);
    const createdAt = new Date(data.createdAt);
    return KeyPair.fromPrivateKey(privateKey, createdAt);
  }

  /**
   * The public key bytes (32 bytes).
   */
  get publicKey(): Uint8Array {
    return this._publicKey;
  }

  /**
   * The private key bytes (32 bytes seed).
   */
  get privateKey(): Uint8Array {
    return this._privateKey;
  }

  /**
   * The creation timestamp.
   */
  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * Serialize the keypair to Base64 format for storage.
   */
  toBase64(): KeyPairData {
    return {
      publicKey: bytesToBase64(this._publicKey),
      privateKey: bytesToBase64(this._privateKey),
      createdAt: this._createdAt.toISOString(),
      algorithm: 'Ed25519',
    };
  }

  /**
   * Save the keypair to disk with secure file permissions.
   * Creates directory structure if needed.
   * 
   * @param dirPath - Directory to save keypair files
   */
  async save(dirPath: string): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });

    const privatePath = path.join(dirPath, 'private.key');
    const publicPath = path.join(dirPath, 'public.key');

    // Save private key with restrictive permissions (0600)
    await fs.writeFile(privatePath, JSON.stringify({
      algorithm: 'Ed25519',
      privateKey: bytesToBase64(this._privateKey),
      createdAt: this._createdAt.toISOString(),
    }, null, 2));
    await fs.chmod(privatePath, 0o600);

    // Save public key (readable)
    await fs.writeFile(publicPath, JSON.stringify({
      algorithm: 'Ed25519',
      publicKey: bytesToBase64(this._publicKey),
      createdAt: this._createdAt.toISOString(),
    }, null, 2));
  }

  /**
   * Load a keypair from disk.
   * 
   * @param dirPath - Directory containing keypair files
   */
  static async load(dirPath: string): Promise<KeyPair> {
    const privatePath = path.join(dirPath, 'private.key');

    const privateData = JSON.parse(await fs.readFile(privatePath, 'utf-8'));
    
    if (privateData.algorithm !== 'Ed25519') {
      throw new Error(`Unsupported algorithm: ${privateData.algorithm}`);
    }

    const privateKey = base64ToBytes(privateData.privateKey);
    const createdAt = new Date(privateData.createdAt);

    return KeyPair.fromPrivateKey(privateKey, createdAt);
  }

  /**
   * Check if a keypair exists at the given path.
   */
  static async exists(dirPath: string): Promise<boolean> {
    try {
      await fs.access(path.join(dirPath, 'private.key'));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sign data using this keypair.
   * 
   * @param data - Data to sign
   * @returns Signature bytes (64 bytes)
   */
  async sign(data: Uint8Array): Promise<Uint8Array> {
    return ed.signAsync(data, this._privateKey);
  }

  /**
   * Verify a signature against this keypair's public key.
   * 
   * @param signature - Signature bytes
   * @param data - Original signed data
   * @returns True if signature is valid
   */
  async verify(signature: Uint8Array, data: Uint8Array): Promise<boolean> {
    return ed.verifyAsync(signature, data, this._publicKey);
  }
}

/**
 * Convert bytes to Base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/**
 * Convert Base64 string to bytes.
 */
export function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Convert bytes to Base64url string (URL-safe, no padding).
 */
export function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert Base64url string to bytes.
 */
export function base64urlToBytes(base64url: string): Uint8Array {
  // Add padding if needed
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Convert string to Base64url.
 */
export function stringToBase64url(str: string): string {
  return bytesToBase64url(new TextEncoder().encode(str));
}

/**
 * Convert Base64url to string.
 */
export function base64urlToString(base64url: string): string {
  return new TextDecoder().decode(base64urlToBytes(base64url));
}
