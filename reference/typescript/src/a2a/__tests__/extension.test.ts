/**
 * Tests for HA2HA extension module.
 */

import { describe, it, expect } from 'vitest';
import {
  createHa2haExtension,
  validateExtensionParams,
  checkExtensionPresence,
  extractHa2haExtension,
  extractExtensionParams,
  getMajorVersionFromUri,
  buildExtensionUri,
  parseVersion,
  compareVersions,
  DEFAULT_EXTENSION_PARAMS,
} from '../extension';
import { HA2HA_EXTENSION_URI, HA2HA_SPEC_VERSION, A2AExtension } from '../types';

describe('createHa2haExtension', () => {
  it('should create extension with defaults', () => {
    const extension = createHa2haExtension();

    expect(extension.uri).toBe(HA2HA_EXTENSION_URI);
    expect(extension.required).toBe(true);
    expect(extension.description).toBe('Human/Agent to Human/Agent oversight protocol');
    expect(extension.params).toBeDefined();
    expect(extension.params?.version).toBe(HA2HA_SPEC_VERSION);
    expect(extension.params?.humanOversight).toBe(true);
    expect(extension.params?.trustLevelRequired).toBe(1);
  });

  it('should merge custom params with defaults', () => {
    const extension = createHa2haExtension({
      trustLevelRequired: 3,
      auditEndpoint: 'https://example.com/audit',
    });

    expect(extension.params?.trustLevelRequired).toBe(3);
    expect(extension.params?.auditEndpoint).toBe('https://example.com/audit');
    expect(extension.params?.version).toBe(HA2HA_SPEC_VERSION);
    expect(extension.params?.humanOversight).toBe(true);
  });

  it('should throw on invalid params', () => {
    expect(() => createHa2haExtension({ humanOversight: false })).toThrow();
    expect(() => createHa2haExtension({ trustLevelRequired: 10 })).toThrow();
  });
});

describe('validateExtensionParams', () => {
  it('should validate correct params', () => {
    const result = validateExtensionParams({
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 2,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.params).toBeDefined();
  });

  it('should reject missing version', () => {
    const result = validateExtensionParams({
      version: '',
      humanOversight: true,
      trustLevelRequired: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('version is required');
  });

  it('should reject invalid semver', () => {
    const result = validateExtensionParams({
      version: 'invalid',
      humanOversight: true,
      trustLevelRequired: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('semver'))).toBe(true);
  });

  it('should reject humanOversight = false', () => {
    const result = validateExtensionParams({
      version: '0.1.0',
      humanOversight: false,
      trustLevelRequired: 1,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('humanOversight'))).toBe(true);
  });

  it('should reject trust level out of range', () => {
    const result1 = validateExtensionParams({
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 0,
    });
    expect(result1.valid).toBe(false);

    const result2 = validateExtensionParams({
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 6,
    });
    expect(result2.valid).toBe(false);
  });

  it('should warn on invalid audit endpoint URL', () => {
    const result = validateExtensionParams({
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
      auditEndpoint: 'not-a-url',
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('auditEndpoint'))).toBe(true);
  });

  it('should warn on invalid escalation contact', () => {
    const result = validateExtensionParams({
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
      escalationContact: 'not-an-email',
    });

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('escalationContact'))).toBe(true);
  });
});

describe('checkExtensionPresence', () => {
  it('should return "missing" for empty extensions', () => {
    expect(checkExtensionPresence(undefined)).toBe('missing');
    expect(checkExtensionPresence([])).toBe('missing');
  });

  it('should return "missing" when HA2HA not present', () => {
    const extensions: A2AExtension[] = [
      { uri: 'https://other.extension', description: 'Other', required: true },
    ];
    expect(checkExtensionPresence(extensions)).toBe('missing');
  });

  it('should return "required" when HA2HA is required', () => {
    const extensions: A2AExtension[] = [
      { uri: HA2HA_EXTENSION_URI, description: 'HA2HA', required: true },
    ];
    expect(checkExtensionPresence(extensions)).toBe('required');
  });

  it('should return "optional" when HA2HA is not required', () => {
    const extensions: A2AExtension[] = [
      { uri: HA2HA_EXTENSION_URI, description: 'HA2HA', required: false },
    ];
    expect(checkExtensionPresence(extensions)).toBe('optional');
  });
});

describe('extractHa2haExtension', () => {
  it('should extract HA2HA extension', () => {
    const ha2ha: A2AExtension = {
      uri: HA2HA_EXTENSION_URI,
      description: 'HA2HA',
      required: true,
      params: { version: '0.1.0', humanOversight: true, trustLevelRequired: 1 },
    };
    const extensions = [ha2ha];

    expect(extractHa2haExtension(extensions)).toEqual(ha2ha);
  });

  it('should return undefined when not present', () => {
    expect(extractHa2haExtension(undefined)).toBeUndefined();
    expect(extractHa2haExtension([])).toBeUndefined();
  });
});

describe('extractExtensionParams', () => {
  it('should extract and validate params', () => {
    const extension: A2AExtension = {
      uri: HA2HA_EXTENSION_URI,
      description: 'HA2HA',
      required: true,
      params: { version: '0.1.0', humanOversight: true, trustLevelRequired: 2 },
    };

    const result = extractExtensionParams(extension);
    expect(result.valid).toBe(true);
    expect(result.params?.trustLevelRequired).toBe(2);
  });

  it('should return invalid for missing params', () => {
    const extension: A2AExtension = {
      uri: HA2HA_EXTENSION_URI,
      description: 'HA2HA',
      required: true,
    };

    const result = extractExtensionParams(extension);
    expect(result.valid).toBe(false);
  });
});

describe('getMajorVersionFromUri', () => {
  it('should extract major version from URI', () => {
    expect(getMajorVersionFromUri('https://ha2haproject.org/spec/v1')).toBe(1);
    expect(getMajorVersionFromUri('https://ha2haproject.org/spec/v2')).toBe(2);
    expect(getMajorVersionFromUri('https://ha2haproject.org/spec/v10')).toBe(10);
  });

  it('should return null for invalid URIs', () => {
    expect(getMajorVersionFromUri('https://ha2haproject.org/spec')).toBeNull();
    expect(getMajorVersionFromUri('invalid')).toBeNull();
  });
});

describe('buildExtensionUri', () => {
  it('should build URI from major version', () => {
    expect(buildExtensionUri(1)).toBe('https://ha2haproject.org/spec/v1');
    expect(buildExtensionUri(2)).toBe('https://ha2haproject.org/spec/v2');
  });
});

describe('parseVersion', () => {
  it('should parse valid semver', () => {
    expect(parseVersion('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it('should return null for invalid versions', () => {
    expect(parseVersion('invalid')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('should compare versions correctly', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1);
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('0.1.1', '0.1.0')).toBe(1);
  });

  it('should throw for invalid versions', () => {
    expect(() => compareVersions('invalid', '0.1.0')).toThrow();
    expect(() => compareVersions('0.1.0', 'invalid')).toThrow();
  });
});
