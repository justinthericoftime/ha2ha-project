/**
 * HA2HA Extension Negotiation
 * 
 * Handles version and capability negotiation between HA2HA agents.
 * Implements HA2HA Specification §4.5-4.7.
 */

import type {
  A2AExtension,
  Ha2haAgentCard,
  Ha2haExtensionParams,
  NegotiationResult,
  ExtensionPresence,
} from './types';
import { HA2HA_EXTENSION_URI } from './types';
import {
  checkExtensionPresence,
  extractHa2haExtension,
  extractExtensionParams,
  getMajorVersionFromUri,
  parseVersion,
  compareVersions,
} from './extension';

/**
 * Negotiate HA2HA compatibility between two agents.
 * 
 * @param ourCard - Our agent's card
 * @param theirCard - Peer agent's card
 * @returns Negotiation result with compatibility info
 * 
 * @example
 * ```typescript
 * const result = negotiate(ourCard, theirCard);
 * if (!result.compatible) {
 *   console.error('Incompatible:', result.error);
 *   console.error('Missing:', result.missingRequired);
 * } else {
 *   console.log('Using version:', result.effectiveVersion);
 * }
 * ```
 */
export function negotiate(
  ourCard: Ha2haAgentCard,
  theirCard: Ha2haAgentCard
): NegotiationResult {
  const warnings: string[] = [];
  const missingRequired: string[] = [];

  // Step 1: Check extension presence (§4.5.1)
  const theirExtensions = theirCard.capabilities?.extensions;
  const presence = checkExtensionPresence(theirExtensions);

  if (presence === 'missing') {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [HA2HA_EXTENSION_URI],
      warnings: [],
      error: 'Peer does not declare HA2HA extension - treat as Trust Level 0 (Blocked)',
    };
  }

  if (presence === 'optional') {
    warnings.push('Peer declares HA2HA as optional (required: false) - treating with maximum scrutiny');
  }

  // Step 2: Extract and validate params (§4.5.2)
  const theirExtension = extractHa2haExtension(theirExtensions);
  if (!theirExtension) {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [HA2HA_EXTENSION_URI],
      warnings: [],
      error: 'Failed to extract HA2HA extension',
    };
  }

  const theirValidation = extractExtensionParams(theirExtension);
  if (!theirValidation.valid) {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [],
      warnings: theirValidation.warnings,
      error: `Invalid extension params: ${theirValidation.errors.join(', ')}`,
    };
  }

  const theirParams = theirValidation.params!;

  // Critical check: humanOversight must be true
  if (!theirParams.humanOversight) {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [],
      warnings: ['humanOversight is false - potential spoofing attempt'],
      error: 'Peer does not have humanOversight enabled - treat as Level 0 (Blocked)',
    };
  }

  // Step 3: Version negotiation (§4.6)
  const ourExtension = extractHa2haExtension(ourCard.capabilities?.extensions);
  if (!ourExtension) {
    throw new Error('Our card must have HA2HA extension');
  }

  const ourValidation = extractExtensionParams(ourExtension);
  if (!ourValidation.valid) {
    throw new Error(`Our card has invalid params: ${ourValidation.errors.join(', ')}`);
  }

  const ourParams = ourValidation.params!;

  // Check major version compatibility via URI
  const ourMajor = getMajorVersionFromUri(ourExtension.uri);
  const theirMajor = getMajorVersionFromUri(theirExtension.uri);

  if (ourMajor !== theirMajor) {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [],
      warnings: [],
      error: `Major version mismatch: v${ourMajor} vs v${theirMajor} - MUST reject`,
    };
  }

  // Determine effective version
  const effectiveVersion = negotiateVersion(ourParams, theirParams);
  if (!effectiveVersion) {
    return {
      compatible: false,
      effectiveVersion: null,
      missingRequired: [],
      warnings: [],
      error: 'No mutually supported version found',
    };
  }

  // Add any warnings from their validation
  warnings.push(...theirValidation.warnings);

  return {
    compatible: true,
    effectiveVersion,
    missingRequired,
    warnings,
  };
}

/**
 * Negotiate the effective version to use.
 * 
 * Per §4.6.2:
 * - Same major, higher minor on peer: SHOULD accept (backward compatible)
 * - Same major, lower minor on peer: MUST negotiate to lower version
 * - Unknown patch version: MUST accept (bug fixes only)
 * 
 * @param ourParams - Our extension params
 * @param theirParams - Peer's extension params
 * @returns The effective version to use, or null if incompatible
 */
export function negotiateVersion(
  ourParams: Ha2haExtensionParams,
  theirParams: Ha2haExtensionParams
): string | null {
  // Get all our supported versions
  const ourVersions = getSupportedVersions(ourParams);
  const theirVersions = getSupportedVersions(theirParams);

  // Find highest mutually supported version
  const mutual = ourVersions.filter(v => theirVersions.some(tv => isSameMajorMinor(v, tv)));
  
  if (mutual.length === 0) {
    // Fall back to comparing primary versions
    const comparison = checkVersionCompatibility(ourParams.version, theirParams.version);
    if (comparison.compatible) {
      return comparison.effectiveVersion;
    }
    return null;
  }

  // Sort descending and return highest
  mutual.sort((a, b) => -compareVersions(a, b));
  return mutual[0];
}

/**
 * Check if two versions are compatible (§4.6.2).
 * 
 * @param ourVersion - Our version string
 * @param theirVersion - Peer's version string
 * @returns Compatibility result
 */
export function checkVersionCompatibility(
  ourVersion: string,
  theirVersion: string
): { compatible: boolean; effectiveVersion: string; reason?: string } {
  const ours = parseVersion(ourVersion);
  const theirs = parseVersion(theirVersion);

  if (!ours || !theirs) {
    return { compatible: false, effectiveVersion: '', reason: 'Invalid version format' };
  }

  // Different major versions are incompatible (handled by URI check, but double-check)
  if (ours.major !== theirs.major) {
    return { 
      compatible: false, 
      effectiveVersion: '', 
      reason: `Major version mismatch: ${ours.major} vs ${theirs.major}` 
    };
  }

  // Same major version - negotiate to lower minor
  const effectiveMinor = Math.min(ours.minor, theirs.minor);
  const effectivePatch = ours.minor === theirs.minor 
    ? Math.min(ours.patch, theirs.patch)
    : (effectiveMinor === ours.minor ? ours.patch : theirs.patch);

  const effectiveVersion = `${ours.major}.${effectiveMinor}.${effectivePatch}`;

  return { compatible: true, effectiveVersion };
}

/**
 * Get list of supported versions from params.
 * 
 * @param params - Extension params
 * @returns Array of supported version strings
 */
export function getSupportedVersions(params: Ha2haExtensionParams): string[] {
  const versions: string[] = [params.version];
  
  if (params.supportedVersions) {
    const additional = params.supportedVersions.split(',').map(v => v.trim());
    for (const v of additional) {
      if (!versions.includes(v)) {
        versions.push(v);
      }
    }
  }

  return versions;
}

/**
 * Check if two versions have the same major.minor.
 */
function isSameMajorMinor(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return false;
  return va.major === vb.major && va.minor === vb.minor;
}

/**
 * Determine effective trust level between two agents.
 * 
 * Per §5.5.2: Both agents use the LOWER of the two trust levels (fail-secure).
 * 
 * @param ourTrustLevel - Our trust level for the peer
 * @param theirTrustLevel - Their required trust level
 * @returns The effective trust level
 */
export function negotiateTrustLevel(
  ourTrustLevel: number,
  theirTrustLevel: number
): number {
  return Math.min(ourTrustLevel, theirTrustLevel);
}

/**
 * Check if our trust level meets peer's requirements.
 * 
 * @param ourTrustLevel - Our trust level for the peer
 * @param theirRequired - Their minimum required trust level
 * @returns Whether we meet their requirements
 */
export function meetsTrustRequirement(
  ourTrustLevel: number,
  theirRequired: number
): boolean {
  return ourTrustLevel >= theirRequired;
}

/**
 * Result of full capability negotiation.
 */
export interface CapabilityNegotiationResult extends NegotiationResult {
  /** Effective trust level */
  effectiveTrustLevel: number;
  /** Whether streaming is supported by both */
  streamingSupported: boolean;
  /** Additional shared capabilities */
  sharedCapabilities: string[];
}

/**
 * Negotiate full capabilities between two agents.
 * 
 * @param ourCard - Our agent card
 * @param theirCard - Peer's agent card
 * @param ourTrustForPeer - Our current trust level for the peer
 * @returns Full capability negotiation result
 */
export function negotiateCapabilities(
  ourCard: Ha2haAgentCard,
  theirCard: Ha2haAgentCard,
  ourTrustForPeer: number
): CapabilityNegotiationResult {
  // First do extension negotiation
  const baseResult = negotiate(ourCard, theirCard);
  
  if (!baseResult.compatible) {
    return {
      ...baseResult,
      effectiveTrustLevel: 0,
      streamingSupported: false,
      sharedCapabilities: [],
    };
  }

  // Get their trust level requirement
  const theirExtension = extractHa2haExtension(theirCard.capabilities?.extensions);
  const theirParams = theirExtension?.params as Ha2haExtensionParams | undefined;
  const theirRequired = theirParams?.trustLevelRequired ?? 1;

  // Check trust requirement
  if (!meetsTrustRequirement(ourTrustForPeer, theirRequired)) {
    return {
      ...baseResult,
      compatible: false,
      effectiveTrustLevel: ourTrustForPeer,
      streamingSupported: false,
      sharedCapabilities: [],
      error: `Trust level ${ourTrustForPeer} does not meet required ${theirRequired}`,
    };
  }

  // Negotiate streaming
  const ourStreaming = ourCard.capabilities?.streaming ?? false;
  const theirStreaming = theirCard.capabilities?.streaming ?? false;
  const streamingSupported = ourStreaming && theirStreaming;

  // Find shared capabilities (excluding extensions and streaming)
  const sharedCapabilities: string[] = [];
  const ourCaps = ourCard.capabilities || {};
  const theirCaps = theirCard.capabilities || {};
  
  for (const key of Object.keys(ourCaps)) {
    if (key === 'extensions' || key === 'streaming') continue;
    if (key in theirCaps && ourCaps[key] && theirCaps[key]) {
      sharedCapabilities.push(key);
    }
  }

  return {
    ...baseResult,
    effectiveTrustLevel: negotiateTrustLevel(ourTrustForPeer, theirRequired),
    streamingSupported,
    sharedCapabilities,
  };
}
