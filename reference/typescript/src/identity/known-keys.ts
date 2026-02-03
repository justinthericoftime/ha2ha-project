/**
 * HA2HA Known Keys Store
 * 
 * Manages trusted public keys for agent identity verification.
 * Human operators must approve new keys before they become trusted.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { base64ToBytes } from './keypair';
import type { KnownKeyEntry, KnownKeysRegistry, KeyTrust } from './types';

/**
 * Manages the store of known and trusted public keys.
 */
export class KnownKeys {
  private _storePath: string;
  private _registry: KnownKeysRegistry;
  private _loaded: boolean = false;

  /**
   * Create a new KnownKeys store.
   * 
   * @param storePath - Path to the known-keys directory
   */
  constructor(storePath: string) {
    this._storePath = storePath;
    this._registry = {
      version: 1,
      keys: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Load the registry from disk.
   */
  async load(): Promise<void> {
    const registryPath = path.join(this._storePath, 'registry.json');
    
    try {
      const data = await fs.readFile(registryPath, 'utf-8');
      this._registry = JSON.parse(data) as KnownKeysRegistry;
      this._loaded = true;
    } catch (error) {
      // If file doesn't exist, start with empty registry
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this._registry = {
          version: 1,
          keys: {},
          lastUpdated: new Date().toISOString(),
        };
        this._loaded = true;
        return;
      }
      throw error;
    }
  }

  /**
   * Save the registry to disk.
   */
  async save(): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this._storePath, { recursive: true });

    this._registry.lastUpdated = new Date().toISOString();
    
    const registryPath = path.join(this._storePath, 'registry.json');
    await fs.writeFile(registryPath, JSON.stringify(this._registry, null, 2));

    // Also save individual public key files for easy inspection
    for (const [agentId, entry] of Object.entries(this._registry.keys)) {
      if (entry.trust !== 'revoked') {
        const keyPath = path.join(this._storePath, `${sanitizeFilename(agentId)}.pub`);
        await fs.writeFile(keyPath, JSON.stringify({
          agentId: entry.agentId,
          publicKey: entry.publicKey,
          trust: entry.trust,
          addedBy: entry.addedBy,
          addedAt: entry.addedAt,
        }, null, 2));
      }
    }
  }

  /**
   * Add a new known key entry.
   * 
   * @param entry - The key entry to add
   */
  add(entry: Omit<KnownKeyEntry, 'addedAt'>): void {
    this._registry.keys[entry.agentId] = {
      ...entry,
      addedAt: new Date().toISOString(),
    };
  }

  /**
   * Add a trusted key (convenience method).
   * 
   * @param agentId - The agent ID
   * @param publicKey - Base64-encoded public key
   * @param addedBy - Human who approved this key
   * @param notes - Optional notes
   */
  addTrusted(
    agentId: string,
    publicKey: string,
    addedBy: string,
    notes?: string
  ): void {
    this.add({
      agentId,
      publicKey,
      addedBy,
      trust: 'trusted',
      notes,
    });
  }

  /**
   * Add a provisional key (pending human verification).
   */
  addProvisional(
    agentId: string,
    publicKey: string,
    addedBy: string,
    notes?: string
  ): void {
    this.add({
      agentId,
      publicKey,
      addedBy,
      trust: 'provisional',
      notes,
    });
  }

  /**
   * Get a key entry by agent ID.
   */
  get(agentId: string): KnownKeyEntry | null {
    return this._registry.keys[agentId] || null;
  }

  /**
   * Check if an agent ID has a trusted key.
   */
  isTrusted(agentId: string): boolean {
    const entry = this._registry.keys[agentId];
    return entry?.trust === 'trusted';
  }

  /**
   * Check if an agent ID has any known key (trusted or provisional).
   */
  isKnown(agentId: string): boolean {
    const entry = this._registry.keys[agentId];
    return entry !== undefined && entry.trust !== 'revoked';
  }

  /**
   * Get the public key for an agent.
   * 
   * @param agentId - The agent ID
   * @param requireTrusted - If true, only return if trust === 'trusted'
   * @returns Public key bytes, or null if not found/not trusted
   */
  getPublicKey(agentId: string, requireTrusted: boolean = true): Uint8Array | null {
    const entry = this._registry.keys[agentId];
    
    if (!entry) {
      return null;
    }

    if (entry.trust === 'revoked') {
      return null;
    }

    if (requireTrusted && entry.trust !== 'trusted') {
      return null;
    }

    return base64ToBytes(entry.publicKey);
  }

  /**
   * Get the public key as Base64 string.
   */
  getPublicKeyBase64(agentId: string, requireTrusted: boolean = true): string | null {
    const entry = this._registry.keys[agentId];
    
    if (!entry || entry.trust === 'revoked') {
      return null;
    }

    if (requireTrusted && entry.trust !== 'trusted') {
      return null;
    }

    return entry.publicKey;
  }

  /**
   * Revoke a key.
   * 
   * @param agentId - The agent ID
   * @param reason - Reason for revocation
   */
  revoke(agentId: string, reason: string): void {
    const entry = this._registry.keys[agentId];
    if (entry) {
      entry.trust = 'revoked';
      entry.revokedAt = new Date().toISOString();
      entry.revokedReason = reason;
    }
  }

  /**
   * Upgrade a provisional key to trusted.
   * 
   * @param agentId - The agent ID
   * @param approvedBy - Human who approved
   */
  approve(agentId: string, approvedBy: string): boolean {
    const entry = this._registry.keys[agentId];
    if (entry && entry.trust === 'provisional') {
      entry.trust = 'trusted';
      entry.notes = `${entry.notes || ''}\nApproved by ${approvedBy} on ${new Date().toISOString()}`.trim();
      return true;
    }
    return false;
  }

  /**
   * List all keys with optional filter.
   */
  list(filter?: { trust?: KeyTrust }): KnownKeyEntry[] {
    const entries = Object.values(this._registry.keys);
    
    if (filter?.trust) {
      return entries.filter(e => e.trust === filter.trust);
    }
    
    return entries;
  }

  /**
   * Remove a key entry completely.
   */
  remove(agentId: string): boolean {
    if (this._registry.keys[agentId]) {
      delete this._registry.keys[agentId];
      return true;
    }
    return false;
  }

  /**
   * Get the default known-keys storage path.
   */
  static getDefaultPath(baseDir?: string): string {
    const base = baseDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.openclaw',
      'ha2ha',
      'identity'
    );
    return path.join(base, 'known-keys');
  }
}

/**
 * Sanitize a string for use as a filename.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
