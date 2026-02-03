/**
 * HA2HA Agent Identity
 * 
 * Manages the complete cryptographic identity of an agent,
 * including keypair management and identity persistence.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { KeyPair, bytesToBase64 } from './keypair';
import type { AgentIdentityData } from './types';

/**
 * Represents a complete agent identity with cryptographic credentials.
 */
export class AgentIdentity {
  private _agentId: string;
  private _displayName?: string;
  private _keyPair: KeyPair;
  private _createdAt: Date;
  private _lastUsed?: Date;

  private constructor(
    agentId: string,
    keyPair: KeyPair,
    displayName?: string,
    createdAt?: Date,
    lastUsed?: Date
  ) {
    this._agentId = agentId;
    this._keyPair = keyPair;
    this._displayName = displayName;
    this._createdAt = createdAt || new Date();
    this._lastUsed = lastUsed;
  }

  /**
   * Create a new agent identity with a fresh keypair.
   * 
   * @param agentId - Unique agent identifier
   * @param displayName - Human-readable name
   */
  static async create(agentId: string, displayName?: string): Promise<AgentIdentity> {
    const keyPair = await KeyPair.generate();
    return new AgentIdentity(agentId, keyPair, displayName);
  }

  /**
   * Load an existing agent identity from disk.
   * 
   * @param identityPath - Directory containing identity files
   */
  static async load(identityPath: string): Promise<AgentIdentity> {
    const metaPath = path.join(identityPath, 'identity.json');
    const metaData = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as AgentIdentityData;

    const keyPair = await KeyPair.load(identityPath);

    return new AgentIdentity(
      metaData.agentId,
      keyPair,
      metaData.displayName,
      new Date(metaData.createdAt),
      metaData.lastUsed ? new Date(metaData.lastUsed) : undefined
    );
  }

  /**
   * Load an existing identity or create a new one if it doesn't exist.
   * 
   * @param identityPath - Directory for identity files
   * @param agentId - Agent ID (used only for creation)
   * @param displayName - Display name (used only for creation)
   */
  static async loadOrCreate(
    identityPath: string,
    agentId: string,
    displayName?: string
  ): Promise<AgentIdentity> {
    if (await KeyPair.exists(identityPath)) {
      return AgentIdentity.load(identityPath);
    }
    const identity = await AgentIdentity.create(agentId, displayName);
    await identity.save(identityPath);
    return identity;
  }

  /**
   * The unique agent identifier.
   */
  get agentId(): string {
    return this._agentId;
  }

  /**
   * Human-readable display name.
   */
  get displayName(): string | undefined {
    return this._displayName;
  }

  /**
   * The agent's Ed25519 keypair.
   */
  get keyPair(): KeyPair {
    return this._keyPair;
  }

  /**
   * The public key as Base64 string.
   */
  get publicKeyBase64(): string {
    return bytesToBase64(this._keyPair.publicKey);
  }

  /**
   * When this identity was created.
   */
  get createdAt(): Date {
    return this._createdAt;
  }

  /**
   * When this identity was last used.
   */
  get lastUsed(): Date | undefined {
    return this._lastUsed;
  }

  /**
   * Update the last used timestamp.
   */
  touch(): void {
    this._lastUsed = new Date();
  }

  /**
   * Save the identity to disk.
   * 
   * @param identityPath - Directory to save identity files
   */
  async save(identityPath: string): Promise<void> {
    // Save keypair
    await this._keyPair.save(identityPath);

    // Save identity metadata
    const metaPath = path.join(identityPath, 'identity.json');
    const metaData: AgentIdentityData = {
      agentId: this._agentId,
      displayName: this._displayName,
      keyPair: this._keyPair.toBase64(),
      createdAt: this._createdAt.toISOString(),
      lastUsed: this._lastUsed?.toISOString(),
    };
    await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2));
  }

  /**
   * Serialize identity data for transport/display.
   */
  toData(): AgentIdentityData {
    return {
      agentId: this._agentId,
      displayName: this._displayName,
      keyPair: this._keyPair.toBase64(),
      createdAt: this._createdAt.toISOString(),
      lastUsed: this._lastUsed?.toISOString(),
    };
  }

  /**
   * Get the default identity storage path.
   * 
   * @param agentId - Agent ID for the subdirectory
   * @param baseDir - Base directory (defaults to ~/.openclaw/ha2ha/identity)
   */
  static getDefaultPath(agentId: string, baseDir?: string): string {
    const base = baseDir || path.join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.openclaw',
      'ha2ha',
      'identity'
    );
    return path.join(base, agentId);
  }
}
