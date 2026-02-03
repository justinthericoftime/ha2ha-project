/**
 * Tests for Agent Card builder and utilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentIdentity } from '../../identity';
import {
  AgentCardBuilder,
  createAgentCard,
  verifyAgentCard,
  getAgentIdFromCard,
  serializeAgentCard,
  parseAgentCard,
} from '../agent-card';
import { HA2HA_EXTENSION_URI, Ha2haAgentCard } from '../types';
import { extractHa2haExtension } from '../extension';

describe('AgentCardBuilder', () => {
  let identity: AgentIdentity;

  beforeEach(async () => {
    identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
  });

  describe('basic building', () => {
    it('should build a signed Agent Card', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .build();

      expect(card.name).toBe('My Agent');
      expect(card.version).toBe('1.0.0');
      expect(card.ha2ha).toBeDefined();
      expect(card.ha2ha.publicKey).toBeDefined();
      expect(card.ha2ha.attestation).toBeDefined();
    });

    it('should require name when identity has no displayName', async () => {
      // Create identity without display name
      const noNameIdentity = await AgentIdentity.create('no-name-agent.ha2ha');
      const builder = new AgentCardBuilder(noNameIdentity);
      // Don't set name, and identity has no displayName
      await expect(builder.setVersion('1.0.0').build()).rejects.toThrow('name');
    });

    it('should require version', async () => {
      const builder = new AgentCardBuilder(identity);
      await expect(builder.setName('Agent').build()).rejects.toThrow('version');
    });

    it('should use identity displayName as default name', async () => {
      const card = await new AgentCardBuilder(identity)
        .setVersion('1.0.0')
        .build();

      expect(card.name).toBe('Test Agent');
    });
  });

  describe('capabilities', () => {
    it('should add capabilities', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .addCapability('streaming', true)
        .addCapability('chat', true)
        .build();

      expect(card.capabilities.streaming).toBe(true);
      expect(card.capabilities.chat).toBe(true);
    });

    it('should include HA2HA extension in capabilities', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .build();

      const extension = extractHa2haExtension(card.capabilities.extensions);
      expect(extension).toBeDefined();
      expect(extension?.uri).toBe(HA2HA_EXTENSION_URI);
      expect(extension?.required).toBe(true);
    });
  });

  describe('HA2HA extension', () => {
    it('should configure HA2HA extension params', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .addHa2haExtension({
          trustLevelRequired: 3,
          auditEndpoint: 'https://example.com/audit',
          escalationContact: 'security@example.com',
        })
        .build();

      const extension = extractHa2haExtension(card.capabilities.extensions);
      expect(extension?.params?.trustLevelRequired).toBe(3);
      expect(extension?.params?.auditEndpoint).toBe('https://example.com/audit');
      expect(extension?.params?.escalationContact).toBe('security@example.com');
    });

    it('should provide shorthand setters', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .setTrustLevelRequired(2)
        .setAuditEndpoint('https://example.com/audit')
        .setEscalationContact('test@example.com')
        .build();

      const extension = extractHa2haExtension(card.capabilities.extensions);
      expect(extension?.params?.trustLevelRequired).toBe(2);
      expect(extension?.params?.auditEndpoint).toBe('https://example.com/audit');
      expect(extension?.params?.escalationContact).toBe('test@example.com');
    });
  });

  describe('optional fields', () => {
    it('should set description', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .setDescription('A test agent')
        .build();

      expect(card.description).toBe('A test agent');
    });

    it('should set URL', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .setUrl('https://my-agent.example.com')
        .build();

      expect(card.url).toBe('https://my-agent.example.com');
    });

    it('should set operator info', async () => {
      const card = await new AgentCardBuilder(identity)
        .setName('My Agent')
        .setVersion('1.0.0')
        .setOperator('Example Org', 'contact@example.com')
        .build();

      expect(card.metadata?.ha2ha).toBeDefined();
      const ha2haMeta = card.metadata?.ha2ha as { operator?: { name: string; contact: string } };
      expect(ha2haMeta.operator?.name).toBe('Example Org');
      expect(ha2haMeta.operator?.contact).toBe('contact@example.com');
    });
  });

  describe('buildFromConfig', () => {
    it('should build from config object', async () => {
      const card = await new AgentCardBuilder(identity).buildFromConfig({
        name: 'Config Agent',
        version: '2.0.0',
        description: 'Built from config',
        url: 'https://config-agent.example.com',
        operator: {
          name: 'Config Org',
          contact: 'config@example.com',
        },
      });

      expect(card.name).toBe('Config Agent');
      expect(card.version).toBe('2.0.0');
      expect(card.description).toBe('Built from config');
      expect(card.url).toBe('https://config-agent.example.com');
    });
  });
});

describe('createAgentCard', () => {
  let identity: AgentIdentity;

  beforeEach(async () => {
    identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
  });

  it('should create a signed card', async () => {
    const card = await createAgentCard(identity, {
      name: 'Quick Agent',
      version: '1.0.0',
    });

    expect(card.name).toBe('Quick Agent');
    expect(card.ha2ha).toBeDefined();
  });

  it('should accept HA2HA params', async () => {
    const card = await createAgentCard(
      identity,
      { name: 'Quick Agent', version: '1.0.0' },
      { trustLevelRequired: 4 }
    );

    const extension = extractHa2haExtension(card.capabilities.extensions);
    expect(extension?.params?.trustLevelRequired).toBe(4);
  });
});

describe('verifyAgentCard', () => {
  let identity: AgentIdentity;

  beforeEach(async () => {
    identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
  });

  it('should verify a valid signed card', async () => {
    const card = await new AgentCardBuilder(identity)
      .setName('My Agent')
      .setVersion('1.0.0')
      .build();

    const isValid = await verifyAgentCard(card);
    expect(isValid).toBe(true);
  });

  it('should reject a tampered card', async () => {
    const card = await new AgentCardBuilder(identity)
      .setName('My Agent')
      .setVersion('1.0.0')
      .build();

    // Tamper with the card
    card.name = 'Tampered Agent';

    const isValid = await verifyAgentCard(card);
    expect(isValid).toBe(false);
  });

  it('should reject card with wrong signature', async () => {
    const card = await new AgentCardBuilder(identity)
      .setName('My Agent')
      .setVersion('1.0.0')
      .build();

    // Create a different identity
    const otherIdentity = await AgentIdentity.create('other-agent.ha2ha');
    const otherCard = await new AgentCardBuilder(otherIdentity)
      .setName('Other Agent')
      .setVersion('1.0.0')
      .build();

    // Replace signature with wrong one
    card.ha2ha.attestation = otherCard.ha2ha.attestation;

    const isValid = await verifyAgentCard(card);
    expect(isValid).toBe(false);
  });
});

describe('getAgentIdFromCard', () => {
  let identity: AgentIdentity;

  beforeEach(async () => {
    identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
  });

  it('should extract agent ID from card', async () => {
    const card = await new AgentCardBuilder(identity)
      .setName('My Agent')
      .setVersion('1.0.0')
      .build();

    const agentId = getAgentIdFromCard(card);
    expect(agentId).toBe('test-agent.ha2ha');
  });
});

describe('serializeAgentCard / parseAgentCard', () => {
  let identity: AgentIdentity;
  let card: Ha2haAgentCard;

  beforeEach(async () => {
    identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
    card = await new AgentCardBuilder(identity)
      .setName('My Agent')
      .setVersion('1.0.0')
      .setDescription('Test description')
      .build();
  });

  it('should serialize card to JSON', () => {
    const json = serializeAgentCard(card);
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe('My Agent');
  });

  it('should parse serialized card', () => {
    const json = serializeAgentCard(card);
    const parsed = parseAgentCard(json);

    expect(parsed.name).toBe(card.name);
    expect(parsed.version).toBe(card.version);
    expect(parsed.ha2ha.publicKey).toBe(card.ha2ha.publicKey);
  });

  it('should throw on invalid JSON structure', () => {
    expect(() => parseAgentCard('{}')).toThrow('Invalid Agent Card structure');
    expect(() => parseAgentCard('{"name":"x","version":"1.0.0"}')).toThrow();
  });

  it('should throw on missing ha2ha extensions', () => {
    const incomplete = {
      name: 'Test',
      version: '1.0.0',
      capabilities: {},
      ha2ha: {},
    };
    expect(() => parseAgentCard(JSON.stringify(incomplete))).toThrow('ha2ha extensions');
  });
});
