/**
 * HA2HA Extension Declaration
 * 
 * Creates and validates HA2HA extensions for A2A Agent Cards.
 * Implements HA2HA Specification §4.1-4.2.
 */

import {
  A2AExtension,
  Ha2haExtensionParams,
  ParamValidationResult,
  ExtensionPresence,
  HA2HA_EXTENSION_URI,
  HA2HA_SPEC_VERSION,
} from './types';

/**
 * Default HA2HA extension parameters.
 */
export const DEFAULT_EXTENSION_PARAMS: Omit<Ha2haExtensionParams, 'auditEndpoint' | 'escalationContact'> = {
  version: HA2HA_SPEC_VERSION,
  humanOversight: true,
  trustLevelRequired: 1,
  behavioralMonitoring: true,
};

/**
 * Create an HA2HA extension for inclusion in an Agent Card.
 * 
 * @param params - Extension parameters (merged with defaults)
 * @returns A2A extension object
 * 
 * @example
 * ```typescript
 * const extension = createHa2haExtension({
 *   trustLevelRequired: 2,
 *   auditEndpoint: 'https://agent.example.com/.well-known/ha2ha/v1/audit',
 *   escalationContact: 'security@example.com',
 * });
 * ```
 */
export function createHa2haExtension(params: Partial<Ha2haExtensionParams> = {}): A2AExtension {
  const mergedParams: Ha2haExtensionParams = {
    ...DEFAULT_EXTENSION_PARAMS,
    ...params,
  };

  // Validation
  const validation = validateExtensionParams(mergedParams);
  if (!validation.valid) {
    throw new Error(`Invalid HA2HA extension params: ${validation.errors.join(', ')}`);
  }

  return {
    uri: HA2HA_EXTENSION_URI,
    description: 'Human/Agent to Human/Agent oversight protocol',
    required: true,
    params: mergedParams as unknown as Record<string, unknown>,
  };
}

/**
 * Validate HA2HA extension parameters.
 * 
 * @param params - Parameters to validate
 * @returns Validation result with errors and warnings
 */
export function validateExtensionParams(params: Ha2haExtensionParams): ParamValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required: version
  if (!params.version) {
    errors.push('version is required');
  } else if (!isValidSemver(params.version)) {
    errors.push(`version must be valid semver: ${params.version}`);
  }

  // Required: humanOversight must be true
  if (params.humanOversight !== true) {
    errors.push('humanOversight must be true for HA2HA compliance');
  }

  // Required: trustLevelRequired (1-5)
  if (typeof params.trustLevelRequired !== 'number') {
    errors.push('trustLevelRequired is required');
  } else if (params.trustLevelRequired < 1 || params.trustLevelRequired > 5) {
    errors.push('trustLevelRequired must be between 1 and 5');
  }

  // Optional: auditEndpoint should be valid URL if present
  if (params.auditEndpoint && !isValidUrl(params.auditEndpoint)) {
    warnings.push(`auditEndpoint should be a valid URL: ${params.auditEndpoint}`);
  }

  // Optional: escalationContact format check
  if (params.escalationContact && !params.escalationContact.includes('@')) {
    warnings.push('escalationContact should be an email address');
  }

  // Optional: supportedVersions format
  if (params.supportedVersions) {
    const versions = params.supportedVersions.split(',').map(v => v.trim());
    for (const v of versions) {
      if (!isValidSemver(v)) {
        warnings.push(`Invalid version in supportedVersions: ${v}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    params: errors.length === 0 ? params : undefined,
  };
}

/**
 * Check if a card declares the HA2HA extension (§4.5.1).
 * 
 * @param extensions - Extensions array from Agent Card capabilities
 * @returns Extension presence status
 */
export function checkExtensionPresence(extensions?: A2AExtension[]): ExtensionPresence {
  if (!extensions || extensions.length === 0) {
    return 'missing';
  }

  const ha2ha = extensions.find(ext => ext.uri === HA2HA_EXTENSION_URI);
  
  if (!ha2ha) {
    return 'missing';
  }

  return ha2ha.required ? 'required' : 'optional';
}

/**
 * Extract HA2HA extension from an extensions array.
 * 
 * @param extensions - Extensions array from Agent Card capabilities
 * @returns The HA2HA extension or undefined
 */
export function extractHa2haExtension(extensions?: A2AExtension[]): A2AExtension | undefined {
  if (!extensions) return undefined;
  return extensions.find(ext => ext.uri === HA2HA_EXTENSION_URI);
}

/**
 * Extract and validate HA2HA params from an extension.
 * 
 * @param extension - The A2A extension to extract params from
 * @returns Validated params or undefined if invalid
 */
export function extractExtensionParams(extension: A2AExtension): ParamValidationResult {
  if (!extension.params) {
    return {
      valid: false,
      errors: ['Extension params missing'],
      warnings: [],
    };
  }

  const params = extension.params as unknown as Ha2haExtensionParams;
  return validateExtensionParams(params);
}

/**
 * Get the major version from an HA2HA extension URI.
 * 
 * @param uri - Extension URI (e.g., "https://ha2haproject.org/spec/v1")
 * @returns Major version number or null if invalid
 */
export function getMajorVersionFromUri(uri: string): number | null {
  const match = uri.match(/\/spec\/v(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Build an extension URI for a given major version.
 * 
 * @param majorVersion - Major version number
 * @returns Extension URI
 */
export function buildExtensionUri(majorVersion: number): string {
  return `https://ha2haproject.org/spec/v${majorVersion}`;
}

/**
 * Check if a string is valid semver.
 */
function isValidSemver(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
  return semverRegex.test(version);
}

/**
 * Check if a string is a valid URL.
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a version string into components.
 * 
 * @param version - Semver string (e.g., "0.1.0")
 * @returns Version components or null if invalid
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semver versions.
 * 
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  
  if (!va || !vb) {
    throw new Error(`Invalid version format: ${!va ? a : b}`);
  }

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1;
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1;
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1;
  return 0;
}
