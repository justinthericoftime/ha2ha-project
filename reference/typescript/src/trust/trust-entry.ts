/**
 * Trust Entry
 * 
 * Represents the trust state for a single agent.
 * Handles trust elevation, reduction, and cooldown tracking.
 */

import {
  TrustLevel,
  TrustContext,
  TrustEntryData,
  TrustEntryOptions,
  TrustHistoryEntry,
  TransitionReason,
  ViolationSeverity,
  TRUST_LEVEL_NAMES,
  COOLDOWN_PERIODS,
} from './types';
import { calculateTrustReduction, violationToTransitionReason } from './violations';

/**
 * Manages trust state for a single agent
 */
export class TrustEntry {
  private data: TrustEntryData;

  /**
   * Create a new trust entry from persisted data
   */
  constructor(data: TrustEntryData) {
    this.data = { ...data };
  }

  /**
   * Create a new trust entry for an agent
   */
  static create(agentId: string, options: TrustEntryOptions = {}): TrustEntry {
    const now = new Date().toISOString();
    const level = options.initialLevel ?? TrustLevel.UNKNOWN;
    const reason = options.reason ?? TransitionReason.INITIAL;

    // Set cooldown based on initial level
    const cooldownMs = COOLDOWN_PERIODS[level];
    const cooldownExpires = cooldownMs !== Infinity
      ? new Date(Date.now() + cooldownMs).toISOString()
      : null;

    const data: TrustEntryData = {
      agentId,
      level,
      createdAt: now,
      lastTransition: now,
      transitionReason: reason,
      violationCount: 0,
      cooldownExpires,
      preApprovalScope: [],
      history: [
        {
          timestamp: now,
          fromLevel: TrustLevel.UNKNOWN,
          toLevel: level,
          reason,
          approvedBy: options.createdBy,
          details: 'Initial trust entry created',
        },
      ],
    };

    return new TrustEntry(data);
  }

  /**
   * Get the agent ID
   */
  get agentId(): string {
    return this.data.agentId;
  }

  /**
   * Get the current trust level
   */
  get level(): TrustLevel {
    return this.data.level;
  }

  /**
   * Check if agent is blocked
   */
  get isBlocked(): boolean {
    return this.data.level === TrustLevel.BLOCKED;
  }

  /**
   * Check if agent is in cooldown period
   */
  get isInCooldown(): boolean {
    if (this.data.cooldownExpires === null) {
      return false;
    }
    return new Date(this.data.cooldownExpires) > new Date();
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  get cooldownRemaining(): number {
    if (this.data.cooldownExpires === null) {
      return 0;
    }
    const remaining = new Date(this.data.cooldownExpires).getTime() - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Get the trust context for authorization decisions
   */
  get context(): TrustContext {
    return {
      level: this.data.level,
      levelName: TRUST_LEVEL_NAMES[this.data.level],
      lastTransition: this.data.lastTransition,
      transitionReason: this.data.transitionReason,
      violationCount: this.data.violationCount,
      cooldownExpires: this.data.cooldownExpires,
      preApprovalScope: [...this.data.preApprovalScope],
    };
  }

  /**
   * Get violation count
   */
  get violationCount(): number {
    return this.data.violationCount;
  }

  /**
   * Get trust history
   */
  get history(): TrustHistoryEntry[] {
    return [...this.data.history];
  }

  /**
   * Check if trust can be elevated
   * Requires: not blocked, not at max level, not in cooldown
   */
  canElevate(): boolean {
    if (this.isBlocked) {
      return false;
    }
    if (this.data.level >= TrustLevel.VERIFIED) {
      return false;
    }
    if (this.isInCooldown) {
      return false;
    }
    return true;
  }

  /**
   * Elevate trust by one level
   * Requires human approval and no cooldown
   */
  elevate(approvedBy: string): boolean {
    if (!this.canElevate()) {
      return false;
    }

    const oldLevel = this.data.level;
    const newLevel = Math.min(this.data.level + 1, TrustLevel.VERIFIED) as TrustLevel;
    
    this.transition(newLevel, TransitionReason.HUMAN_APPROVAL, approvedBy);
    return true;
  }

  /**
   * Set trust to a specific level (human override)
   */
  setLevel(level: TrustLevel, approvedBy: string, details?: string): void {
    if (level === this.data.level) {
      return;
    }

    this.transition(level, TransitionReason.HUMAN_OVERRIDE, approvedBy, details);
  }

  /**
   * Record a violation and reduce trust accordingly
   */
  recordViolation(severity: ViolationSeverity, details?: string): void {
    this.data.violationCount++;

    const reduction = calculateTrustReduction(severity);
    const newLevel = Math.max(TrustLevel.BLOCKED, this.data.level - reduction) as TrustLevel;
    
    if (newLevel !== this.data.level) {
      const reason = violationToTransitionReason(severity);
      this.transition(newLevel, reason, undefined, details);
    } else {
      // Low severity - just record in history as warning
      this.data.history.push({
        timestamp: new Date().toISOString(),
        fromLevel: this.data.level,
        toLevel: this.data.level,
        reason: TransitionReason.VIOLATION_LOW,
        details: details ?? 'Warning recorded, no trust reduction',
      });
    }
  }

  /**
   * Block the agent (trust level 0)
   */
  block(reason: string, blockedBy?: string): void {
    this.transition(TrustLevel.BLOCKED, TransitionReason.VIOLATION_CRITICAL, blockedBy, reason);
  }

  /**
   * Unblock the agent and set to UNKNOWN level
   * Requires human approval
   */
  unblock(approvedBy: string, details?: string): void {
    if (!this.isBlocked) {
      return;
    }

    this.transition(
      TrustLevel.UNKNOWN,
      TransitionReason.HUMAN_OVERRIDE,
      approvedBy,
      details ?? 'Agent unblocked by human'
    );
  }

  /**
   * Add a pre-approval scope
   */
  addPreApprovalScope(scope: string): void {
    if (!this.data.preApprovalScope.includes(scope)) {
      this.data.preApprovalScope.push(scope);
    }
  }

  /**
   * Remove a pre-approval scope
   */
  removePreApprovalScope(scope: string): void {
    const index = this.data.preApprovalScope.indexOf(scope);
    if (index !== -1) {
      this.data.preApprovalScope.splice(index, 1);
    }
  }

  /**
   * Check if a scope is pre-approved
   */
  hasPreApprovalScope(scope: string): boolean {
    return this.data.preApprovalScope.includes(scope);
  }

  /**
   * Clear cooldown (used for testing or human override)
   */
  clearCooldown(): void {
    this.data.cooldownExpires = null;
  }

  /**
   * Serialize to JSON for persistence
   */
  toJSON(): TrustEntryData {
    return { ...this.data };
  }

  /**
   * Internal: perform a trust transition
   */
  private transition(
    newLevel: TrustLevel,
    reason: TransitionReason,
    approvedBy?: string,
    details?: string
  ): void {
    const now = new Date().toISOString();
    const oldLevel = this.data.level;

    // Record history entry
    this.data.history.push({
      timestamp: now,
      fromLevel: oldLevel,
      toLevel: newLevel,
      reason,
      approvedBy,
      details,
    });

    // Update state
    this.data.level = newLevel;
    this.data.lastTransition = now;
    this.data.transitionReason = reason;

    // Set cooldown based on new level
    const cooldownMs = COOLDOWN_PERIODS[newLevel];
    if (cooldownMs !== Infinity) {
      this.data.cooldownExpires = new Date(Date.now() + cooldownMs).toISOString();
    } else {
      this.data.cooldownExpires = null;
    }
  }
}
