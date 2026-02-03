/**
 * Fatigue Tracker
 * 
 * Tracks approvals per time window to prevent approval fatigue.
 * Implements §8.7.2 Rate Limiting from HA2HA specification.
 */

import { FatigueStatus, ApprovalRecord } from './types';

/**
 * Configuration for the fatigue tracker.
 */
export interface FatigueTrackerConfig {
  /** Maximum approvals per hour (null = unlimited) */
  limit: number | null;
  /** Window size in milliseconds (default: 1 hour) */
  windowMs?: number;
  /** Current time provider (for testing) */
  now?: () => Date;
}

/**
 * Default window size: 1 hour in milliseconds.
 */
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Tracks approval counts to prevent fatigue.
 */
export class FatigueTracker {
  private limit: number | null;
  private windowMs: number;
  private nowFn: () => Date;
  private approvals: ApprovalRecord[] = [];

  constructor(config: FatigueTrackerConfig) {
    this.limit = config.limit;
    this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
    this.nowFn = config.now ?? (() => new Date());
  }

  /**
   * Record an approval.
   */
  recordApproval(taskId: string, agentId: string): void {
    this.approvals.push({
      timestamp: this.nowFn(),
      taskId,
      agentId,
    });
    
    // Clean up old approvals
    this.pruneOldApprovals();
  }

  /**
   * Get the current fatigue status.
   */
  getStatus(): FatigueStatus {
    this.pruneOldApprovals();
    
    const now = this.nowFn();
    const windowStart = new Date(now.getTime() - this.windowMs);
    
    const approvalsThisHour = this.approvals.filter(
      a => a.timestamp >= windowStart
    ).length;
    
    const exceeded = this.limit !== null && approvalsThisHour >= this.limit;
    
    // Calculate minutes until the oldest approval in this window expires
    let minutesUntilReset = 60;
    if (this.approvals.length > 0) {
      const oldestInWindow = this.approvals
        .filter(a => a.timestamp >= windowStart)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];
      
      if (oldestInWindow) {
        const expiresAt = new Date(oldestInWindow.timestamp.getTime() + this.windowMs);
        minutesUntilReset = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 60000));
      }
    }
    
    return {
      approvalsThisHour,
      limit: this.limit,
      exceeded,
      minutesUntilReset,
    };
  }

  /**
   * Check if the fatigue limit has been exceeded.
   */
  isExceeded(): boolean {
    return this.getStatus().exceeded;
  }

  /**
   * Check if an approval is allowed (not exceeded).
   */
  canApprove(): boolean {
    return !this.isExceeded();
  }

  /**
   * Get the number of approvals this hour.
   */
  getApprovalCount(): number {
    return this.getStatus().approvalsThisHour;
  }

  /**
   * Get the configured limit.
   */
  getLimit(): number | null {
    return this.limit;
  }

  /**
   * Update the limit (e.g., if profile changes).
   */
  setLimit(limit: number | null): void {
    this.limit = limit;
  }

  /**
   * Get all approvals within the current window.
   */
  getRecentApprovals(): ApprovalRecord[] {
    this.pruneOldApprovals();
    const now = this.nowFn();
    const windowStart = new Date(now.getTime() - this.windowMs);
    return this.approvals.filter(a => a.timestamp >= windowStart);
  }

  /**
   * Clear all approval records.
   */
  clear(): void {
    this.approvals = [];
  }

  /**
   * Remove approvals older than the window.
   */
  private pruneOldApprovals(): void {
    const now = this.nowFn();
    const windowStart = new Date(now.getTime() - this.windowMs);
    this.approvals = this.approvals.filter(a => a.timestamp >= windowStart);
  }
}

/**
 * Create a fatigue tracker from an approver's fatigue_limit setting.
 */
export function createFatigueTracker(
  fatigueLimit: number | null,
  options: { windowMs?: number; now?: () => Date } = {}
): FatigueTracker {
  return new FatigueTracker({
    limit: fatigueLimit,
    windowMs: options.windowMs,
    now: options.now,
  });
}
