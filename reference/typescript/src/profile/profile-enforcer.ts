/**
 * Profile Enforcer
 * 
 * Main enforcement class that applies approver profile rules at runtime.
 * Coordinates availability checking, fatigue tracking, pre-trust resolution,
 * and timeout settings.
 */

import { ApproverProfile } from '../onboarding';
import { loadProfile, loadActiveProfile } from '../onboarding/loader';
import { TrustRegistry, TrustLevel, TransitionReason } from '../trust';
import { ApprovalQueue } from '../approval';
import { AvailabilityChecker } from './availability';
import { FatigueTracker, createFatigueTracker } from './fatigue';
import { PreTrustResolver, createPreTrustResolver } from './pre-trust';
import {
  EnforcementResult,
  FatigueStatus,
  AvailabilityStatus,
  PreTrustResult,
  ProfileEnforcerConfig,
  AvailabilityCheckOptions,
  PreTrustResolveOptions,
  ProfileEnforcementEvent,
} from './types';

/**
 * Callback type for enforcement events.
 */
export type EnforcementEventCallback = (event: ProfileEnforcementEvent) => void;

/**
 * Main profile enforcement class.
 * Applies profile rules to approval decisions.
 */
export class ProfileEnforcer {
  private profile: ApproverProfile;
  private trustRegistry?: TrustRegistry;
  private approvalQueue?: ApprovalQueue;
  private availabilityChecker: AvailabilityChecker;
  private fatigueTracker: FatigueTracker;
  private preTrustResolver: PreTrustResolver;
  private nowFn: () => Date;
  private eventCallbacks: EnforcementEventCallback[] = [];

  constructor(
    profile: ApproverProfile,
    options: {
      trustRegistry?: TrustRegistry;
      approvalQueue?: ApprovalQueue;
      now?: () => Date;
    } = {}
  ) {
    this.profile = profile;
    this.trustRegistry = options.trustRegistry;
    this.approvalQueue = options.approvalQueue;
    this.nowFn = options.now ?? (() => new Date());

    // Initialize sub-components
    this.availabilityChecker = new AvailabilityChecker(
      profile.authorization.availability,
      { now: this.nowFn }
    );

    this.fatigueTracker = createFatigueTracker(
      profile.approval_preferences.fatigue_limit,
      { now: this.nowFn }
    );

    this.preTrustResolver = createPreTrustResolver(
      profile.trust_baseline.pre_trusted
    );
  }

  /**
   * Create a ProfileEnforcer from a profile path.
   */
  static fromPath(
    profilePath: string,
    options?: {
      trustRegistry?: TrustRegistry;
      approvalQueue?: ApprovalQueue;
      now?: () => Date;
    }
  ): ProfileEnforcer {
    const profile = loadProfile(profilePath);
    return new ProfileEnforcer(profile, options);
  }

  /**
   * Create a ProfileEnforcer from the active profile in OpenClaw config.
   */
  static fromActiveProfile(
    openclawConfigPath?: string,
    options?: {
      trustRegistry?: TrustRegistry;
      approvalQueue?: ApprovalQueue;
      now?: () => Date;
    }
  ): ProfileEnforcer | null {
    const profile = loadActiveProfile(openclawConfigPath);
    if (!profile) {
      return null;
    }
    return new ProfileEnforcer(profile, options);
  }

  /**
   * Check if an approval can proceed (all checks pass).
   */
  canApprove(options: AvailabilityCheckOptions = {}): EnforcementResult {
    const warnings: string[] = [];
    
    // Check availability
    const availability = this.checkAvailability(options);
    if (!availability.available) {
      const result: EnforcementResult = {
        allowed: availability.enforcement === 'soft',
        reason: availability.reason,
        warnings: availability.enforcement === 'soft' 
          ? [`Approver is ${availability.reason?.toLowerCase() ?? 'unavailable'} - request will be queued`]
          : [],
        suggestedAction: this.profile.authorization.off_hours_behavior,
      };
      
      this.emitEvent({
        type: 'availability_check',
        timestamp: new Date().toISOString(),
        result,
      });
      
      return result;
    }

    // Check fatigue
    const fatigue = this.checkFatigue();
    if (fatigue.exceeded) {
      warnings.push(
        `Fatigue limit exceeded: ${fatigue.approvalsThisHour}/${fatigue.limit} approvals this hour. ` +
        `Consider taking a break. Resets in ${fatigue.minutesUntilReset} minutes.`
      );
    }

    const result: EnforcementResult = {
      allowed: true,
      warnings,
    };

    this.emitEvent({
      type: 'fatigue_check',
      timestamp: new Date().toISOString(),
      result: fatigue,
    });

    return result;
  }

  /**
   * Check availability status.
   */
  checkAvailability(options: AvailabilityCheckOptions = {}): AvailabilityStatus {
    return this.availabilityChecker.getStatus(options);
  }

  /**
   * Check if the approver is currently available.
   */
  isAvailable(options: AvailabilityCheckOptions = {}): boolean {
    return this.availabilityChecker.isAvailable(options);
  }

  /**
   * Check fatigue status.
   */
  checkFatigue(): FatigueStatus {
    return this.fatigueTracker.getStatus();
  }

  /**
   * Get the timeout duration in hours from the profile.
   */
  getTimeoutHours(): number {
    return this.profile.recovery.timeout_hours;
  }

  /**
   * Get the timeout duration in milliseconds.
   */
  getTimeoutMs(): number {
    return this.profile.recovery.timeout_hours * 60 * 60 * 1000;
  }

  /**
   * Get the timeout action (deny, escalate, hold).
   */
  getTimeoutAction(): 'deny' | 'escalate' | 'hold' {
    return this.profile.recovery.timeout_action;
  }

  /**
   * Resolve a pre-trusted entity.
   */
  resolvePreTrust(options: PreTrustResolveOptions): PreTrustResult {
    const result = this.preTrustResolver.resolve(options);
    
    this.emitEvent({
      type: 'pre_trust_resolve',
      timestamp: new Date().toISOString(),
      result,
      context: { options },
    });
    
    return result;
  }

  /**
   * Apply pre-trust to an agent in the trust registry.
   * This is called on first contact with a potentially pre-trusted entity.
   */
  async applyPreTrust(agentId: string, name?: string): Promise<TrustLevel | null> {
    if (!this.trustRegistry) {
      return null;
    }

    const result = this.resolvePreTrust({ agentId, name });
    
    if (result.matched && result.trustLevel !== undefined) {
      // Check if agent already has trust entry
      if (this.trustRegistry.hasAgent(agentId)) {
        // Don't override existing trust
        return this.trustRegistry.getTrustLevel(agentId);
      }

      // Apply pre-trust level
      await this.trustRegistry.setTrust(
        agentId,
        result.trustLevel,
        `pre-trust:${this.profile.approver.id}`
      );

      return result.trustLevel;
    }

    return null;
  }

  /**
   * Record an approval for fatigue tracking.
   */
  recordApproval(taskId: string, agentId: string): void {
    this.fatigueTracker.recordApproval(taskId, agentId);
  }

  /**
   * Get the approver profile.
   */
  getProfile(): ApproverProfile {
    return this.profile;
  }

  /**
   * Get the approver ID.
   */
  getApproverId(): string {
    return this.profile.approver.id;
  }

  /**
   * Get the approver name.
   */
  getApproverName(): string {
    return this.profile.approver.name;
  }

  /**
   * Get the off-hours behavior setting.
   */
  getOffHoursBehavior(): 'queue' | 'deny' | 'escalate' {
    return this.profile.authorization.off_hours_behavior;
  }

  /**
   * Get the default trust level for unknown agents.
   */
  getDefaultTrustLevel(): TrustLevel {
    const levelName = this.profile.trust_baseline.default_level;
    switch (levelName) {
      case 'blocked':
        return TrustLevel.BLOCKED;
      case 'unknown':
        return TrustLevel.UNKNOWN;
      case 'provisional':
        return TrustLevel.PROVISIONAL;
      default:
        return TrustLevel.UNKNOWN;
    }
  }

  /**
   * Check if batching is enabled.
   */
  isBatchingEnabled(): boolean {
    return this.profile.approval_preferences.batching;
  }

  /**
   * Get the max batch size (if batching is enabled).
   */
  getMaxBatchSize(): number {
    return this.profile.approval_preferences.batch_max_size ?? 10;
  }

  /**
   * Get the presentation mode preference.
   */
  getPresentationMode(): 'inline' | 'batched' | 'both' {
    return this.profile.approval_preferences.presentation;
  }

  /**
   * Register a callback for enforcement events.
   */
  onEvent(callback: EnforcementEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Get the pre-trust resolver for direct access.
   */
  getPreTrustResolver(): PreTrustResolver {
    return this.preTrustResolver;
  }

  /**
   * Get the availability checker for direct access.
   */
  getAvailabilityChecker(): AvailabilityChecker {
    return this.availabilityChecker;
  }

  /**
   * Get the fatigue tracker for direct access.
   */
  getFatigueTracker(): FatigueTracker {
    return this.fatigueTracker;
  }

  /**
   * Emit an enforcement event to registered callbacks.
   */
  private emitEvent(event: ProfileEnforcementEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (e) {
        console.error('Enforcement event callback error:', e);
      }
    }
  }
}

/**
 * Create a ProfileEnforcer from configuration options.
 */
export function createProfileEnforcer(
  config: ProfileEnforcerConfig & {
    trustRegistry?: TrustRegistry;
    approvalQueue?: ApprovalQueue;
  }
): ProfileEnforcer {
  let profile: ApproverProfile;

  if (config.profile) {
    profile = config.profile;
  } else if (config.profilePath) {
    profile = loadProfile(config.profilePath);
  } else {
    throw new Error('Either profile or profilePath must be provided');
  }

  return new ProfileEnforcer(profile, {
    trustRegistry: config.trustRegistry,
    approvalQueue: config.approvalQueue,
    now: config.now,
  });
}
