/**
 * HA2HA Profile Validator
 * 
 * Validate approver profiles against the schema.
 */

import { ApproverProfile, ValidationResult } from './types';

const VALID_IDENTITY_MODELS = ['channel-based', 'multi-factor', 'token'] as const;
const VALID_VERIFICATION_LEVELS = ['simple', 'moderate', 'strict'] as const;
const VALID_AVAILABILITY_MODES = ['always', 'waking-hours', 'scheduled'] as const;
const VALID_PRESENTATION_MODES = ['inline', 'batched', 'both'] as const;
const VALID_DEFAULT_TRUST_LEVELS = ['blocked', 'unknown', 'provisional'] as const;
const VALID_PRE_TRUST_LEVELS = ['provisional', 'standard', 'trusted'] as const;
const VALID_TIMEOUT_ACTIONS = ['deny', 'escalate', 'hold'] as const;
const VALID_OFF_HOURS_BEHAVIORS = ['queue', 'deny', 'escalate'] as const;

/**
 * Validate an approver profile
 */
export function validateProfile(profile: unknown): ValidationResult {
  const errors: Array<{ path: string; message: string }> = [];
  
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: [{ path: '', message: 'Profile must be an object' }] };
  }
  
  const p = profile as Record<string, unknown>;
  
  // Validate approver section
  if (!p.approver || typeof p.approver !== 'object') {
    errors.push({ path: 'approver', message: 'Missing or invalid approver section' });
  } else {
    const approver = p.approver as Record<string, unknown>;
    if (!approver.name || typeof approver.name !== 'string') {
      errors.push({ path: 'approver.name', message: 'Name is required and must be a string' });
    }
    if (!approver.id || typeof approver.id !== 'string') {
      errors.push({ path: 'approver.id', message: 'ID is required and must be a string' });
    } else if (!/^[a-z0-9-]+$/.test(approver.id)) {
      errors.push({ path: 'approver.id', message: 'ID must be lowercase alphanumeric with hyphens' });
    }
    if (!approver.created || typeof approver.created !== 'string') {
      errors.push({ path: 'approver.created', message: 'Created timestamp is required' });
    }
  }
  
  // Validate identity section
  if (!p.identity || typeof p.identity !== 'object') {
    errors.push({ path: 'identity', message: 'Missing or invalid identity section' });
  } else {
    const identity = p.identity as Record<string, unknown>;
    if (!VALID_IDENTITY_MODELS.includes(identity.model as any)) {
      errors.push({ path: 'identity.model', message: `Model must be one of: ${VALID_IDENTITY_MODELS.join(', ')}` });
    }
    if (!VALID_VERIFICATION_LEVELS.includes(identity.verification as any)) {
      errors.push({ path: 'identity.verification', message: `Verification must be one of: ${VALID_VERIFICATION_LEVELS.join(', ')}` });
    }
  }
  
  // Validate authorization section
  if (!p.authorization || typeof p.authorization !== 'object') {
    errors.push({ path: 'authorization', message: 'Missing or invalid authorization section' });
  } else {
    const auth = p.authorization as Record<string, unknown>;
    if (!Array.isArray(auth.domains) || auth.domains.length === 0) {
      errors.push({ path: 'authorization.domains', message: 'Domains must be a non-empty array' });
    }
    if (!auth.availability || typeof auth.availability !== 'object') {
      errors.push({ path: 'authorization.availability', message: 'Availability is required' });
    } else {
      const avail = auth.availability as Record<string, unknown>;
      if (!VALID_AVAILABILITY_MODES.includes(avail.mode as any)) {
        errors.push({ path: 'authorization.availability.mode', message: `Mode must be one of: ${VALID_AVAILABILITY_MODES.join(', ')}` });
      }
    }
    if (auth.off_hours_behavior && !VALID_OFF_HOURS_BEHAVIORS.includes(auth.off_hours_behavior as any)) {
      errors.push({ path: 'authorization.off_hours_behavior', message: `Off-hours behavior must be one of: ${VALID_OFF_HOURS_BEHAVIORS.join(', ')}` });
    }
  }
  
  // Validate approval_preferences section
  if (!p.approval_preferences || typeof p.approval_preferences !== 'object') {
    errors.push({ path: 'approval_preferences', message: 'Missing or invalid approval_preferences section' });
  } else {
    const prefs = p.approval_preferences as Record<string, unknown>;
    if (!VALID_PRESENTATION_MODES.includes(prefs.presentation as any)) {
      errors.push({ path: 'approval_preferences.presentation', message: `Presentation must be one of: ${VALID_PRESENTATION_MODES.join(', ')}` });
    }
    if (prefs.fatigue_limit !== null && prefs.fatigue_limit !== undefined) {
      const limit = prefs.fatigue_limit as number;
      if (typeof limit !== 'number' || limit < 1 || limit > 100) {
        errors.push({ path: 'approval_preferences.fatigue_limit', message: 'Fatigue limit must be null or 1-100' });
      }
    }
  }
  
  // Validate trust_baseline section
  if (!p.trust_baseline || typeof p.trust_baseline !== 'object') {
    errors.push({ path: 'trust_baseline', message: 'Missing or invalid trust_baseline section' });
  } else {
    const trust = p.trust_baseline as Record<string, unknown>;
    if (!VALID_DEFAULT_TRUST_LEVELS.includes(trust.default_level as any)) {
      errors.push({ path: 'trust_baseline.default_level', message: `Default level must be one of: ${VALID_DEFAULT_TRUST_LEVELS.join(', ')}` });
    }
    if (trust.pre_trusted && Array.isArray(trust.pre_trusted)) {
      (trust.pre_trusted as Array<Record<string, unknown>>).forEach((pt, i) => {
        if (!pt.name || typeof pt.name !== 'string') {
          errors.push({ path: `trust_baseline.pre_trusted[${i}].name`, message: 'Name is required' });
        }
        if (!VALID_PRE_TRUST_LEVELS.includes(pt.level as any)) {
          errors.push({ path: `trust_baseline.pre_trusted[${i}].level`, message: `Level must be one of: ${VALID_PRE_TRUST_LEVELS.join(', ')}` });
        }
      });
    }
  }
  
  // Validate recovery section
  if (!p.recovery || typeof p.recovery !== 'object') {
    errors.push({ path: 'recovery', message: 'Missing or invalid recovery section' });
  } else {
    const recovery = p.recovery as Record<string, unknown>;
    if (typeof recovery.timeout_hours !== 'number' || recovery.timeout_hours < 0.5 || recovery.timeout_hours > 168) {
      errors.push({ path: 'recovery.timeout_hours', message: 'Timeout hours must be 0.5-168' });
    }
    if (!VALID_TIMEOUT_ACTIONS.includes(recovery.timeout_action as any)) {
      errors.push({ path: 'recovery.timeout_action', message: `Timeout action must be one of: ${VALID_TIMEOUT_ACTIONS.join(', ')}` });
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Check if a domain pattern matches a target domain
 */
export function domainMatches(pattern: string, target: string): boolean {
  if (pattern === '*') {
    return true;
  }
  
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);  // Remove *
    return target.startsWith(prefix) || target === pattern.slice(0, -2);
  }
  
  return pattern === target;
}

/**
 * Check if an approver can authorize a domain
 */
export function canAuthorizeDomain(profile: ApproverProfile, domain: string): boolean {
  return profile.authorization.domains.some(d => domainMatches(d, domain));
}

/**
 * Get the trust level for an entity
 */
export function getTrustLevel(profile: ApproverProfile, name: string, agentId?: string): number {
  // Check pre-trusted entities
  const preTrusted = profile.trust_baseline.pre_trusted.find(pt => 
    pt.name.toLowerCase() === name.toLowerCase() || 
    (agentId && pt.agent_id === agentId)
  );
  
  if (preTrusted) {
    // Map trust level names to numbers
    const levelMap = { provisional: 2, standard: 3, trusted: 4 };
    return levelMap[preTrusted.level];
  }
  
  // Return default level
  const defaultMap = { blocked: 0, unknown: 1, provisional: 2 };
  return defaultMap[profile.trust_baseline.default_level];
}
