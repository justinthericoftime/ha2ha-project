/**
 * Audit Chain
 * 
 * Manages a hash-chained audit log with tamper-evident properties.
 * Each entry's hash includes the previous entry's hash, creating
 * an immutable chain where any modification is detectable.
 * 
 * @see HA2HA Specification §8.9 (Audit Log Integrity)
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import {
  AuditEntry,
  AuditEntryInput,
  AuditChainConfig,
  ChainVerificationResult,
  AuditEventType,
  DEFAULT_AUDIT_CONFIG,
} from './types';
import {
  createAuditEntry,
  createGenesisEntry,
  serializeEntry,
  deserializeEntry,
  verifyEntryHash,
  verifyEntryLink,
} from './audit-entry';
import { verifyChain, detectTamperPoint } from './verifier';

/**
 * Error thrown when the audit chain is corrupted.
 */
export class ChainCorruptedError extends Error {
  constructor(
    message: string,
    public readonly verificationResult: ChainVerificationResult
  ) {
    super(message);
    this.name = 'ChainCorruptedError';
  }
}

/**
 * Manages a hash-chained audit log.
 * 
 * @example
 * ```typescript
 * const chain = new AuditChain({
 *   storePath: './audit.jsonl',
 *   agentId: 'my-agent',
 * });
 * 
 * await chain.load();
 * 
 * await chain.append({
 *   eventType: AuditEventType.TASK_APPROVED,
 *   sourceAgentId: 'alice',
 *   targetAgentId: 'bob',
 *   trustLevel: 3,
 *   outcome: 'success',
 * });
 * ```
 */
export class AuditChain {
  private readonly config: Required<AuditChainConfig>;
  private entries: AuditEntry[] = [];
  private loaded = false;
  private corrupted = false;
  private corruptionResult?: ChainVerificationResult;
  
  constructor(config: AuditChainConfig) {
    this.config = {
      ...DEFAULT_AUDIT_CONFIG,
      ...config,
    } as Required<AuditChainConfig>;
  }
  
  /**
   * Load the audit chain from storage.
   * Creates a genesis entry if the file doesn't exist.
   * Optionally verifies chain integrity on load.
   * 
   * @throws ChainCorruptedError if verifyOnLoad is true and chain is corrupted
   */
  async load(): Promise<void> {
    const { storePath, verifyOnLoad, agentId } = this.config;
    
    // Ensure directory exists
    const dir = dirname(storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    if (!existsSync(storePath)) {
      // Create new chain with genesis entry
      const genesis = createGenesisEntry(agentId);
      this.entries = [genesis];
      this.flush();
      this.loaded = true;
      return;
    }
    
    // Load existing entries
    const content = readFileSync(storePath, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    
    this.entries = lines.map((line, index) => {
      try {
        return deserializeEntry(line);
      } catch (error) {
        throw new Error(`Failed to parse audit entry at line ${index + 1}: ${error}`);
      }
    });
    
    this.loaded = true;
    
    // Verify chain integrity if configured
    if (verifyOnLoad && this.entries.length > 0) {
      const result = this.verify();
      if (!result.valid) {
        this.corrupted = true;
        this.corruptionResult = result;
        
        // Log the corruption event (append to corrupted chain for evidence)
        this.appendCorruptionRecord(result);
        
        throw new ChainCorruptedError(
          `Audit chain corrupted at entry ${result.brokenAt}: ${result.errorMessage}`,
          result
        );
      }
    }
  }
  
  /**
   * Append a new entry to the chain.
   * 
   * @param input - Entry data
   * @returns The created entry
   * @throws Error if chain is not loaded or is corrupted
   */
  async append(input: AuditEntryInput): Promise<AuditEntry> {
    this.ensureLoaded();
    this.ensureNotCorrupted();
    
    const prevHash = this.getLastHash();
    const entry = createAuditEntry(input, prevHash);
    
    this.entries.push(entry);
    
    if (this.config.autoFlush) {
      this.appendToFile(entry);
    }
    
    return entry;
  }
  
  /**
   * Get the hash of the last entry in the chain.
   * 
   * @returns Hash string, or null if chain is empty
   */
  getLastHash(): string | null {
    if (this.entries.length === 0) {
      return null;
    }
    return this.entries[this.entries.length - 1].hash;
  }
  
  /**
   * Get the last entry in the chain.
   * 
   * @returns Last entry, or undefined if chain is empty
   */
  getLastEntry(): AuditEntry | undefined {
    return this.entries[this.entries.length - 1];
  }
  
  /**
   * Get all entries in the chain.
   * 
   * @returns Copy of all entries
   */
  getEntries(): AuditEntry[] {
    return [...this.entries];
  }
  
  /**
   * Get the number of entries in the chain.
   */
  get length(): number {
    return this.entries.length;
  }
  
  /**
   * Get an entry by index.
   * 
   * @param index - Zero-based index
   * @returns Entry at index, or undefined if out of bounds
   */
  getEntry(index: number): AuditEntry | undefined {
    return this.entries[index];
  }
  
  /**
   * Verify the integrity of the entire chain.
   * 
   * @returns Verification result
   */
  verify(): ChainVerificationResult {
    return verifyChain(this.entries);
  }
  
  /**
   * Check if the chain is loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }
  
  /**
   * Check if the chain is corrupted.
   */
  isCorrupted(): boolean {
    return this.corrupted;
  }
  
  /**
   * Get the corruption result if chain is corrupted.
   */
  getCorruptionResult(): ChainVerificationResult | undefined {
    return this.corruptionResult;
  }
  
  /**
   * Flush all entries to storage (full rewrite).
   * Normally not needed if autoFlush is enabled.
   */
  flush(): void {
    const content = this.entries.map(serializeEntry).join('\n') + '\n';
    writeFileSync(this.config.storePath, content, 'utf-8');
  }
  
  /**
   * Get the storage path.
   */
  getStorePath(): string {
    return this.config.storePath;
  }
  
  /**
   * Clear the in-memory chain (does not affect storage).
   * Call load() to reload from storage.
   */
  clear(): void {
    this.entries = [];
    this.loaded = false;
    this.corrupted = false;
    this.corruptionResult = undefined;
  }
  
  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('Audit chain not loaded. Call load() first.');
    }
  }
  
  private ensureNotCorrupted(): void {
    if (this.corrupted) {
      throw new ChainCorruptedError(
        'Cannot append to corrupted chain',
        this.corruptionResult!
      );
    }
  }
  
  private appendToFile(entry: AuditEntry): void {
    appendFileSync(this.config.storePath, serializeEntry(entry) + '\n', 'utf-8');
  }
  
  private appendCorruptionRecord(result: ChainVerificationResult): void {
    // Create a tamper detection record
    const record = createAuditEntry({
      eventType: AuditEventType.CHAIN_TAMPER_DETECTED,
      sourceAgentId: this.config.agentId,
      targetAgentId: this.config.agentId,
      trustLevel: 0,
      outcome: 'error',
      details: {
        brokenAt: result.brokenAt,
        errorType: result.errorType,
        errorMessage: result.errorMessage,
        evidenceEntryIds: result.evidence?.map(e => e.entryId),
      },
    }, this.getLastHash());
    
    // Append to file (don't add to in-memory chain to preserve evidence)
    this.appendToFile(record);
  }
}

/**
 * Create an audit chain with default configuration.
 * 
 * @param storePath - Path to the audit log file
 * @param agentId - ID of the agent
 * @returns Configured AuditChain instance
 */
export function createAuditChain(storePath: string, agentId: string): AuditChain {
  return new AuditChain({ storePath, agentId });
}

/**
 * Get the default audit log path for an agent.
 * 
 * @param agentId - ID of the agent
 * @returns Default path (in user's home directory)
 */
export function getDefaultAuditPath(agentId: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.ha2ha/audit/${agentId}.jsonl`;
}
