/**
 * Tests for HA2HA extension negotiation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentIdentity } from '../../identity';
import { AgentCardBuilder } from '../agent-card';
import {
  negotiate,
  negotiateVersion,
  checkVersionCompatibility,
  getSupportedVersions,
  negotiateTrustLevel,
  meetsTrustRequirement,
  negotiateCapabilities,
} from '../negotiation';
import type { Ha2haAgentCard, Ha2haExtensionParams } from '../types';
import { HA2HA_EXTENSION_URI } from '../types';

describe('negotiate', () => {
  let ourIdentity: AgentIdentity;
  let theirIdentity: AgentIdentity;
  let ourCard: Ha2haAgentCard;

  beforeEach(async () => {
    ourIdentity = await AgentIdentity.create('our-agent.ha2ha', 'Our Agent');
    theirIdentity = await AgentIdentity.create('their-agent.ha2ha', 'Their Agent');

    ourCard = await new AgentCardBuilder(ourIdentity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();
  });

  it('should succeed with compatible cards', async () => {
    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 1 })
      .build();

    const result = negotiate(ourCard, theirCard);

    expect(result.compatible).toBe(true);
    expect(result.effectiveVersion).toBe('0.1.0');
    expect(result.missingRequired).toHaveLength(0);
  });

  it('should fail when peer lacks HA2HA extension', async () => {
    const theirCard: Ha2haAgentCard = {
      name: 'Non-HA2HA Agent',
      version: '1.0.0',
      capabilities: {},
      ha2ha: {
        publicKey: 'fake',
        attestation: { protected: '', signature: '' },
      },
    };

    const result = negotiate(ourCard, theirCard);

    expect(result.compatible).toBe(false);
    expect(result.missingRequired).toContain(HA2HA_EXTENSION_URI);
    expect(result.error).toContain('Trust Level 0');
  });

  it('should warn when peer has optional HA2HA', async () => {
    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .build();

    // Manually modify to be optional
    const ext = theirCard.capabilities.extensions?.find(e => e.uri === HA2HA_EXTENSION_URI);
    if (ext) ext.required = false;

    const result = negotiate(ourCard, theirCard);

    expect(result.compatible).toBe(true);
    expect(result.warnings.some(w => w.includes('optional'))).toBe(true);
  });

  it('should fail when peer has humanOversight = false', async () => {
    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .build();

    // Manually modify to have humanOversight = false
    const ext = theirCard.capabilities.extensions?.find(e => e.uri === HA2HA_EXTENSION_URI);
    if (ext?.params) {
      (ext.params as unknown as Ha2haExtensionParams).humanOversight = false;
    }

    const result = negotiate(ourCard, theirCard);

    expect(result.compatible).toBe(false);
    // Validation catches humanOversight = false as invalid params
    expect(result.error).toContain('humanOversight');
  });

  it('should fail on major version mismatch', async () => {
    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .build();

    // Manually modify URI to different major version
    // Note: When URI changes, checkExtensionPresence returns 'missing' 
    // because it looks for the exact HA2HA_EXTENSION_URI
    const ext = theirCard.capabilities.extensions?.find(e => e.uri === HA2HA_EXTENSION_URI);
    if (ext) ext.uri = 'https://ha2haproject.org/spec/v2';

    const result = negotiate(ourCard, theirCard);

    expect(result.compatible).toBe(false);
    // Extension is treated as missing since URI doesn't match
    expect(result.missingRequired).toContain(HA2HA_EXTENSION_URI);
  });
});

describe('negotiateVersion', () => {
  it('should return same version when both match', () => {
    const ourParams: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
    };
    const theirParams: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
    };

    const version = negotiateVersion(ourParams, theirParams);
    expect(version).toBe('0.1.0');
  });

  it('should negotiate to lower minor version', () => {
    const ourParams: Ha2haExtensionParams = {
      version: '0.2.0',
      humanOversight: true,
      trustLevelRequired: 1,
    };
    const theirParams: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
    };

    const version = negotiateVersion(ourParams, theirParams);
    expect(version).toBe('0.1.0');
  });

  it('should use supportedVersions for negotiation', () => {
    const ourParams: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
      supportedVersions: '0.1.0,0.2.0',
    };
    const theirParams: Ha2haExtensionParams = {
      version: '0.2.0',
      humanOversight: true,
      trustLevelRequired: 1,
      supportedVersions: '0.2.0',
    };

    const version = negotiateVersion(ourParams, theirParams);
    expect(version).toBe('0.2.0');
  });
});

describe('checkVersionCompatibility', () => {
  it('should be compatible for same version', () => {
    const result = checkVersionCompatibility('0.1.0', '0.1.0');
    expect(result.compatible).toBe(true);
    expect(result.effectiveVersion).toBe('0.1.0');
  });

  it('should negotiate to lower minor', () => {
    const result = checkVersionCompatibility('0.2.0', '0.1.5');
    expect(result.compatible).toBe(true);
    expect(result.effectiveVersion).toBe('0.1.5');
  });

  it('should be incompatible for different major', () => {
    const result = checkVersionCompatibility('1.0.0', '2.0.0');
    expect(result.compatible).toBe(false);
    expect(result.reason).toContain('Major version mismatch');
  });

  it('should negotiate patch versions', () => {
    const result = checkVersionCompatibility('0.1.5', '0.1.2');
    expect(result.compatible).toBe(true);
    expect(result.effectiveVersion).toBe('0.1.2');
  });
});

describe('getSupportedVersions', () => {
  it('should return primary version when no supportedVersions', () => {
    const params: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
    };

    const versions = getSupportedVersions(params);
    expect(versions).toEqual(['0.1.0']);
  });

  it('should include supportedVersions', () => {
    const params: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
      supportedVersions: '0.1.0,0.2.0,0.3.0',
    };

    const versions = getSupportedVersions(params);
    expect(versions).toContain('0.1.0');
    expect(versions).toContain('0.2.0');
    expect(versions).toContain('0.3.0');
  });

  it('should not duplicate versions', () => {
    const params: Ha2haExtensionParams = {
      version: '0.1.0',
      humanOversight: true,
      trustLevelRequired: 1,
      supportedVersions: '0.1.0,0.2.0',
    };

    const versions = getSupportedVersions(params);
    const count = versions.filter(v => v === '0.1.0').length;
    expect(count).toBe(1);
  });
});

describe('negotiateTrustLevel', () => {
  it('should return lower of two trust levels', () => {
    expect(negotiateTrustLevel(3, 5)).toBe(3);
    expect(negotiateTrustLevel(5, 3)).toBe(3);
    expect(negotiateTrustLevel(4, 4)).toBe(4);
    expect(negotiateTrustLevel(1, 5)).toBe(1);
  });
});

describe('meetsTrustRequirement', () => {
  it('should return true when trust meets requirement', () => {
    expect(meetsTrustRequirement(3, 3)).toBe(true);
    expect(meetsTrustRequirement(5, 3)).toBe(true);
    expect(meetsTrustRequirement(2, 1)).toBe(true);
  });

  it('should return false when trust does not meet requirement', () => {
    expect(meetsTrustRequirement(2, 3)).toBe(false);
    expect(meetsTrustRequirement(1, 5)).toBe(false);
  });
});

describe('negotiateCapabilities', () => {
  let ourIdentity: AgentIdentity;
  let theirIdentity: AgentIdentity;

  beforeEach(async () => {
    ourIdentity = await AgentIdentity.create('our-agent.ha2ha', 'Our Agent');
    theirIdentity = await AgentIdentity.create('their-agent.ha2ha', 'Their Agent');
  });

  it('should negotiate full capabilities', async () => {
    const ourCard = await new AgentCardBuilder(ourIdentity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .addCapability('streaming', true)
      .addCapability('chat', true)
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();

    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .addCapability('streaming', true)
      .addCapability('search', true)
      .addHa2haExtension({ trustLevelRequired: 2 })
      .build();

    // ourTrustForPeer = 3, theirRequired = 2, effective = min(3, 2) = 2
    const result = negotiateCapabilities(ourCard, theirCard, 3);

    expect(result.compatible).toBe(true);
    expect(result.streamingSupported).toBe(true);
    expect(result.effectiveTrustLevel).toBe(2);
  });

  it('should fail when trust level insufficient', async () => {
    const ourCard = await new AgentCardBuilder(ourIdentity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 1 })
      .build();

    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .addHa2haExtension({ trustLevelRequired: 4 })
      .build();

    const result = negotiateCapabilities(ourCard, theirCard, 2);

    expect(result.compatible).toBe(false);
    expect(result.error).toContain('Trust level');
  });

  it('should correctly detect no streaming support', async () => {
    const ourCard = await new AgentCardBuilder(ourIdentity)
      .setName('Our Agent')
      .setVersion('1.0.0')
      .addCapability('streaming', false)
      .build();

    const theirCard = await new AgentCardBuilder(theirIdentity)
      .setName('Their Agent')
      .setVersion('1.0.0')
      .addCapability('streaming', true)
      .build();

    const result = negotiateCapabilities(ourCard, theirCard, 3);

    expect(result.streamingSupported).toBe(false);
  });
});
