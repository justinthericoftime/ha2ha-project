/**
 * HA2HA Onboarding Module
 * 
 * Provides functionality for human approver onboarding and profile management.
 * 
 * @example
 * ```typescript
 * import { loadActiveProfile, validateProfile, canAuthorizeDomain } from '@ha2ha/onboarding';
 * 
 * // Load the active approver profile
 * const profile = loadActiveProfile();
 * 
 * if (profile) {
 *   // Check if the approver can authorize a domain
 *   const canApprove = canAuthorizeDomain(profile, 'technical/deploy');
 *   
 *   // Get trust level for an entity
 *   const trustLevel = getTrustLevel(profile, 'Mic');
 * }
 * ```
 */

// Types
export type {
  ApproverProfile,
  Ha2haConfig,
  ValidationResult,
  IdentityModel,
  VerificationLevel,
  AvailabilityMode,
  Enforcement,
  OffHoursBehavior,
  PresentationMode,
  TrustLevel,
  TimeoutAction,
  Channel,
  Schedule,
  ScheduleWindow,
  Availability,
  PreTrustedEntity,
  Delegate,
} from './types';

// Loader functions
export {
  loadProfile,
  loadActiveProfile,
  loadHa2haConfig,
  listProfiles,
  saveProfile,
  deleteProfile,
  profileExists,
  getApproversDir,
  getTrustStoreDir,
} from './loader';

// Validator functions
export {
  validateProfile,
  domainMatches,
  canAuthorizeDomain,
  getTrustLevel,
} from './validator';
