/**
 * Profile Enforcement Module
 * 
 * Runtime enforcement of approver profile settings.
 * Implements §10 Human Onboarding from HA2HA specification.
 */

// Types
export {
  EnforcementResult,
  FatigueStatus,
  AvailabilityStatus,
  PreTrustResult,
  ProfileEnforcerConfig,
  AvailabilityCheckOptions,
  PreTrustResolveOptions,
  ApprovalRecord,
  WakingHoursConfig,
  DEFAULT_WAKING_HOURS,
  ProfileEnforcementEvent,
} from './types';

// Availability Checker
export { AvailabilityChecker } from './availability';

// Fatigue Tracker
export {
  FatigueTracker,
  createFatigueTracker,
  type FatigueTrackerConfig,
} from './fatigue';

// Pre-Trust Resolver
export {
  PreTrustResolver,
  createPreTrustResolver,
} from './pre-trust';

// Profile Enforcer
export {
  ProfileEnforcer,
  createProfileEnforcer,
  type EnforcementEventCallback,
} from './profile-enforcer';
