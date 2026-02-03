/**
 * Tests for ProfileEnforcer
 */

import { describe, it, expect } from 'vitest';
import { ProfileEnforcer, createProfileEnforcer } from '../profile-enforcer';
import { ApproverProfile } from '../../onboarding';
import { TrustLevel } from '../../trust';

// Test profile matching Ricardo's configuration
const testProfile: ApproverProfile = {
  approver: {
    name: 'Ricardo Caporale',
    id: 'ricardo-caporale',
    created: '2026-02-02T21:30:00-05:00',
  },
  identity: {
    model: 'channel-based',
    verification: 'simple',
    channels: [
      { type: 'openclaw-session', authenticated: true },
    ],
  },
  authorization: {
    domains: ['*'],
    availability: {
      mode: 'waking-hours',
      enforcement: 'soft',
    },
    off_hours_behavior: 'queue',
  },
  approval_preferences: {
    presentation: 'inline',
    fatigue_limit: null,
    batching: false,
  },
  trust_baseline: {
    default_level: 'unknown',
    pre_trusted: [
      {
        name: 'Mic',
        relationship: 'brother',
        level: 'provisional',
        domains: ['technical/*'],
      },
      {
        name: 'JD',
        relationship: 'friend/mentor',
        level: 'provisional',
        domains: ['*'],
      },
    ],
  },
  recovery: {
    delegation: null,
    timeout_hours: 5,
    timeout_action: 'deny',
  },
};

describe('ProfileEnforcer', () => {
  describe('construction', () => {
    it('should create from profile object', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getApproverId()).toBe('ricardo-caporale');
      expect(enforcer.getApproverName()).toBe('Ricardo Caporale');
    });

    it('should use createProfileEnforcer factory', () => {
      const enforcer = createProfileEnforcer({ profile: testProfile });
      
      expect(enforcer.getApproverId()).toBe('ricardo-caporale');
    });
  });

  describe('timeout settings', () => {
    it('should return correct timeout hours', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getTimeoutHours()).toBe(5);
    });

    it('should return correct timeout in milliseconds', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      // 5 hours * 60 min * 60 sec * 1000 ms = 18,000,000 ms
      expect(enforcer.getTimeoutMs()).toBe(5 * 60 * 60 * 1000);
    });

    it('should return correct timeout action', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getTimeoutAction()).toBe('deny');
    });
  });

  describe('pre-trust resolution', () => {
    it('should resolve Mic as provisional trust', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const result = enforcer.resolvePreTrust({ name: 'Mic' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
    });

    it('should resolve JD as provisional trust', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const result = enforcer.resolvePreTrust({ name: 'JD' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
    });

    it('should not resolve unknown entities', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const result = enforcer.resolvePreTrust({ name: 'Unknown Person' });
      
      expect(result.matched).toBe(false);
    });
  });

  describe('availability checking', () => {
    it('should check availability during waking hours', () => {
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0); // 2 PM
      
      const enforcer = new ProfileEnforcer(testProfile, {
        now: () => daytime,
      });
      
      expect(enforcer.isAvailable()).toBe(true);
    });

    it('should detect off-hours', () => {
      const nighttime = new Date();
      nighttime.setHours(3, 0, 0, 0); // 3 AM
      
      const enforcer = new ProfileEnforcer(testProfile, {
        now: () => nighttime,
      });
      
      expect(enforcer.isAvailable()).toBe(false);
    });

    it('should get off-hours behavior', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getOffHoursBehavior()).toBe('queue');
    });
  });

  describe('canApprove', () => {
    it('should allow approval during waking hours', () => {
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0);
      
      const enforcer = new ProfileEnforcer(testProfile, {
        now: () => daytime,
      });
      
      const result = enforcer.canApprove();
      
      expect(result.allowed).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should queue approval during off-hours (soft enforcement)', () => {
      const nighttime = new Date();
      nighttime.setHours(3, 0, 0, 0);
      
      const enforcer = new ProfileEnforcer(testProfile, {
        now: () => nighttime,
      });
      
      const result = enforcer.canApprove();
      
      // Soft enforcement means allowed=true but with suggestion to queue
      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.suggestedAction).toBe('queue');
    });
  });

  describe('fatigue tracking', () => {
    it('should record approvals', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      enforcer.recordApproval('task-1', 'agent-1');
      enforcer.recordApproval('task-2', 'agent-2');
      
      const status = enforcer.checkFatigue();
      expect(status.approvalsThisHour).toBe(2);
    });

    it('should return null limit for unlimited fatigue', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const status = enforcer.checkFatigue();
      expect(status.limit).toBeNull();
      expect(status.exceeded).toBe(false);
    });

    it('should warn when fatigue limit exceeded', () => {
      // Create profile with fatigue limit
      const limitedProfile = {
        ...testProfile,
        approval_preferences: {
          ...testProfile.approval_preferences,
          fatigue_limit: 2,
        },
      };
      
      const enforcer = new ProfileEnforcer(limitedProfile);
      
      enforcer.recordApproval('task-1', 'agent-1');
      enforcer.recordApproval('task-2', 'agent-2');
      
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0);
      
      const result = enforcer.canApprove({ at: daytime });
      
      expect(result.allowed).toBe(true); // Still allowed, but warned
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Fatigue limit exceeded');
    });
  });

  describe('profile settings', () => {
    it('should return default trust level', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getDefaultTrustLevel()).toBe(TrustLevel.UNKNOWN);
    });

    it('should return batching settings', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.isBatchingEnabled()).toBe(false);
      expect(enforcer.getMaxBatchSize()).toBe(10); // Default
    });

    it('should return presentation mode', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      expect(enforcer.getPresentationMode()).toBe('inline');
    });
  });

  describe('event callbacks', () => {
    it('should emit events for pre-trust resolution', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      const events: any[] = [];
      
      enforcer.onEvent(event => events.push(event));
      
      enforcer.resolvePreTrust({ name: 'Mic' });
      
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('pre_trust_resolve');
    });

    it('should emit events for canApprove checks', () => {
      const daytime = new Date();
      daytime.setHours(14, 0, 0, 0);
      
      const enforcer = new ProfileEnforcer(testProfile, {
        now: () => daytime,
      });
      
      const events: any[] = [];
      enforcer.onEvent(event => events.push(event));
      
      enforcer.canApprove();
      
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('sub-component access', () => {
    it('should provide access to pre-trust resolver', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const resolver = enforcer.getPreTrustResolver();
      expect(resolver.getPreTrustedEntities().length).toBe(2);
    });

    it('should provide access to availability checker', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const checker = enforcer.getAvailabilityChecker();
      expect(checker).toBeDefined();
    });

    it('should provide access to fatigue tracker', () => {
      const enforcer = new ProfileEnforcer(testProfile);
      
      const tracker = enforcer.getFatigueTracker();
      expect(tracker).toBeDefined();
    });
  });
});
