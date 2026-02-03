/**
 * Trust Registry
 * 
 * Central management for all agent trust states.
 * Handles trust lookups, modifications, and persistence.
 */

import {
  TrustLevel,
  TrustContext,
  TrustStoreData,
  TrustEntryData,
  TrustEntryOptions,
  ViolationSeverity,
  TransitionReason,
} from './types';
import { TrustEntry } from './trust-entry';
import {
  loadTrustStore,
  saveTrustStore,
  getDefaultStorePath,
  createEmptyStore,
  setTrustEntry,
  getTrustEntry,
  listAgentIds,
  getAllEntries,
  removeTrustEntry,
} from './persistence';
import { createViolationRecord, ViolationRecord } from './violations';

/**
 * Configuration options for TrustRegistry
 */
export interface TrustRegistryOptions {
  /** Path to trust store file */
  storePath?: string;
  /** Auto-save after modifications */
  autoSave?: boolean;
  /** Log violations to separate file */
  violationLogPath?: string;
}

/**
 * Central registry for managing agent trust
 */
export class TrustRegistry {
  private storePath: string;
  private autoSave: boolean;
  private store: TrustStoreData;
  private entries: Map<string, TrustEntry>;
  private loaded: boolean;
  private violationLog: ViolationRecord[];

  constructor(options: TrustRegistryOptions = {}) {
    this.storePath = options.storePath ?? getDefaultStorePath();
    this.autoSave = options.autoSave ?? true;
    this.store = createEmptyStore();
    this.entries = new Map();
    this.loaded = false;
    this.violationLog = [];
  }

  /**
   * Load trust store from disk
   */
  async load(): Promise<void> {
    this.store = await loadTrustStore(this.storePath);
    
    // Hydrate entries
    this.entries.clear();
    for (const data of getAllEntries(this.store)) {
      this.entries.set(data.agentId, new TrustEntry(data));
    }
    
    this.loaded = true;
  }

  /**
   * Save trust store to disk
   */
  async save(): Promise<void> {
    // Sync entries back to store
    for (const [agentId, entry] of this.entries) {
      setTrustEntry(this.store, entry.toJSON());
    }
    
    await saveTrustStore(this.storePath, this.store);
  }

  /**
   * Get or create trust entry for an agent
   */
  getTrust(agentId: string): TrustEntry {
    let entry = this.entries.get(agentId);
    
    if (!entry) {
      // Create new entry with UNKNOWN trust
      entry = TrustEntry.create(agentId);
      this.entries.set(agentId, entry);
      
      if (this.autoSave) {
        this.save().catch(console.error);
      }
    }
    
    return entry;
  }

  /**
   * Get trust context for an agent (for authorization)
   */
  getTrustContext(agentId: string): TrustContext {
    return this.getTrust(agentId).context;
  }

  /**
   * Get trust level for an agent
   */
  getTrustLevel(agentId: string): TrustLevel {
    return this.getTrust(agentId).level;
  }

  /**
   * Check if an agent is known (has an entry)
   */
  hasAgent(agentId: string): boolean {
    return this.entries.has(agentId);
  }

  /**
   * Set trust level for an agent (requires human approval)
   */
  async setTrust(agentId: string, level: TrustLevel, approvedBy: string): Promise<void> {
    const entry = this.getTrust(agentId);
    entry.setLevel(level, approvedBy);
    
    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Elevate trust for an agent by one level
   */
  async elevateTrust(agentId: string, approvedBy: string): Promise<boolean> {
    const entry = this.getTrust(agentId);
    const success = entry.elevate(approvedBy);
    
    if (success && this.autoSave) {
      await this.save();
    }
    
    return success;
  }

  /**
   * Record a violation and reduce trust accordingly
   */
  async recordViolation(
    agentId: string,
    severity: ViolationSeverity,
    details: string
  ): Promise<void> {
    const entry = this.getTrust(agentId);
    const trustBefore = entry.level;
    
    entry.recordViolation(severity, details);
    
    const trustAfter = entry.level;
    
    // Log violation
    this.violationLog.push(createViolationRecord(
      agentId,
      'manual',
      severity,
      details,
      trustBefore,
      trustAfter
    ));
    
    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Block an agent
   */
  async blockAgent(agentId: string, reason: string, blockedBy?: string): Promise<void> {
    const entry = this.getTrust(agentId);
    entry.block(reason, blockedBy);
    
    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Unblock an agent
   */
  async unblockAgent(agentId: string, approvedBy: string): Promise<void> {
    const entry = this.getTrust(agentId);
    entry.unblock(approvedBy);
    
    if (this.autoSave) {
      await this.save();
    }
  }

  /**
   * Remove an agent from the registry
   */
  async removeAgent(agentId: string): Promise<boolean> {
    const removed = this.entries.delete(agentId);
    if (removed) {
      removeTrustEntry(this.store, agentId);
      
      if (this.autoSave) {
        await this.save();
      }
    }
    return removed;
  }

  /**
   * List all agent IDs
   */
  listAgentIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * List all trust entries
   */
  listAgents(): TrustEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get all blocked agents
   */
  getBlockedAgents(): TrustEntry[] {
    return this.listAgents().filter(entry => entry.isBlocked);
  }

  /**
   * Get agents by trust level
   */
  getAgentsByLevel(level: TrustLevel): TrustEntry[] {
    return this.listAgents().filter(entry => entry.level === level);
  }

  /**
   * Get agents with violations
   */
  getAgentsWithViolations(): TrustEntry[] {
    return this.listAgents().filter(entry => entry.violationCount > 0);
  }

  /**
   * Import agents from an allowlist (migration helper)
   * Maps allowed agents to STANDARD trust level
   */
  async importFromAllowlist(allowedAgents: string[], importedBy: string): Promise<number> {
    let count = 0;
    
    for (const agentId of allowedAgents) {
      if (!this.entries.has(agentId)) {
        const entry = TrustEntry.create(agentId, {
          initialLevel: TrustLevel.STANDARD,
          reason: TransitionReason.ALLOWLIST_MIGRATION,
          createdBy: importedBy,
        });
        this.entries.set(agentId, entry);
        count++;
      }
    }
    
    if (count > 0 && this.autoSave) {
      await this.save();
    }
    
    return count;
  }

  /**
   * Get violation log
   */
  getViolationLog(): ViolationRecord[] {
    return [...this.violationLog];
  }

  /**
   * Clear violation log
   */
  clearViolationLog(): void {
    this.violationLog = [];
  }

  /**
   * Get statistics about the trust registry
   */
  getStats(): TrustRegistryStats {
    const agents = this.listAgents();
    const levelCounts: Record<TrustLevel, number> = {
      [TrustLevel.BLOCKED]: 0,
      [TrustLevel.UNKNOWN]: 0,
      [TrustLevel.PROVISIONAL]: 0,
      [TrustLevel.STANDARD]: 0,
      [TrustLevel.TRUSTED]: 0,
      [TrustLevel.VERIFIED]: 0,
    };

    let totalViolations = 0;
    let inCooldown = 0;

    for (const agent of agents) {
      levelCounts[agent.level]++;
      totalViolations += agent.violationCount;
      if (agent.isInCooldown) {
        inCooldown++;
      }
    }

    return {
      totalAgents: agents.length,
      levelCounts,
      totalViolations,
      inCooldown,
    };
  }
}

/**
 * Statistics about the trust registry
 */
export interface TrustRegistryStats {
  /** Total number of agents */
  totalAgents: number;
  /** Count of agents at each trust level */
  levelCounts: Record<TrustLevel, number>;
  /** Total violations across all agents */
  totalViolations: number;
  /** Number of agents currently in cooldown */
  inCooldown: number;
}
