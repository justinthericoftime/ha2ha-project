/**
 * HA2HA Agent Card Builder
 * 
 * Creates A2A-compliant Agent Cards with HA2HA extensions and
 * cryptographic attestation. Implements HA2HA Specification §4.1-4.3.
 * 
 * @example
 * ```typescript
 * import { AgentCardBuilder } from '@ha2ha/reference/a2a';
 * import { AgentIdentity } from '@ha2ha/reference/identity';
 * 
 * const identity = await AgentIdentity.loadOrCreate('./identity', 'my-agent', 'My Agent');
 * 
 * const card = await new AgentCardBuilder(identity)
 *   .setName('My Agent')
 *   .setVersion('1.0.0')
 *   .setUrl('https://my-agent.example.com')
 *   .addCapability('streaming', true)
 *   .addHa2haExtension({
 *     trustLevelRequired: 2,
 *     auditEndpoint: '/.well-known/ha2ha/v1/audit',
 *     escalationContact: 'security@example.com',
 *   })
 *   .build();
 * ```
 */

import { AgentIdentity, Signer, bytesToBase64 } from '../identity';
import type { JWSSignature } from '../identity/types';
import type {
  A2AAgentCard,
  A2ACapabilities,
  A2AExtension,
  Ha2haAgentCard,
  Ha2haExtensionParams,
  Ha2haAgentMetadata,
} from './types';
import { HA2HA_EXTENSION_URI, HA2HA_SPEC_VERSION } from './types';
import { createHa2haExtension, validateExtensionParams } from './extension';

/**
 * Configuration for building an Agent Card.
 */
export interface AgentCardConfig {
  name: string;
  version: string;
  description?: string;
  url?: string;
  operator?: {
    name: string;
    contact: string;
  };
}

/**
 * Builder for creating signed HA2HA Agent Cards.
 */
export class AgentCardBuilder {
  private identity: AgentIdentity;
  private name?: string;
  private version?: string;
  private description?: string;
  private url?: string;
  private capabilities: A2ACapabilities = {};
  private ha2haParams: Partial<Ha2haExtensionParams> = {};
  private operator?: { name: string; contact: string };
  private additionalExtensions: A2AExtension[] = [];

  /**
   * Create a new Agent Card builder.
   * 
   * @param identity - The agent's cryptographic identity
   */
  constructor(identity: AgentIdentity) {
    this.identity = identity;
    // Default name from identity
    this.name = identity.displayName;
  }

  /**
   * Set the agent name.
   */
  setName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Set the agent version.
   */
  setVersion(version: string): this {
    this.version = version;
    return this;
  }

  /**
   * Set the agent description.
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Set the agent URL endpoint.
   */
  setUrl(url: string): this {
    this.url = url;
    return this;
  }

  /**
   * Set operator information.
   */
  setOperator(name: string, contact: string): this {
    this.operator = { name, contact };
    return this;
  }

  /**
   * Add a capability to the agent card.
   * 
   * @param name - Capability name
   * @param value - Capability value
   */
  addCapability(name: string, value: unknown): this {
    this.capabilities[name] = value;
    return this;
  }

  /**
   * Add an A2A extension (non-HA2HA).
   * 
   * @param extension - The extension to add
   */
  addExtension(extension: A2AExtension): this {
    this.additionalExtensions.push(extension);
    return this;
  }

  /**
   * Configure HA2HA extension parameters.
   * 
   * @param params - HA2HA extension parameters
   */
  addHa2haExtension(params: Partial<Ha2haExtensionParams> = {}): this {
    this.ha2haParams = { ...this.ha2haParams, ...params };
    return this;
  }

  /**
   * Set the minimum trust level required.
   */
  setTrustLevelRequired(level: number): this {
    this.ha2haParams.trustLevelRequired = level;
    return this;
  }

  /**
   * Set the audit endpoint.
   */
  setAuditEndpoint(endpoint: string): this {
    this.ha2haParams.auditEndpoint = endpoint;
    return this;
  }

  /**
   * Set the escalation contact.
   */
  setEscalationContact(contact: string): this {
    this.ha2haParams.escalationContact = contact;
    return this;
  }

  /**
   * Build the signed Agent Card.
   * 
   * @returns Promise resolving to the signed card
   * @throws Error if required fields are missing or validation fails
   */
  async build(): Promise<Ha2haAgentCard> {
    // Validate required fields
    if (!this.name) {
      throw new Error('Agent name is required');
    }
    if (!this.version) {
      throw new Error('Agent version is required');
    }

    // Create HA2HA extension
    const ha2haExtension = createHa2haExtension(this.ha2haParams);

    // Build extensions array
    const extensions: A2AExtension[] = [
      ha2haExtension,
      ...this.additionalExtensions,
    ];

    // Build the card content (without ha2ha section - that's added after signing)
    const cardContent: A2AAgentCard = {
      name: this.name,
      version: this.version,
      capabilities: {
        ...this.capabilities,
        extensions,
      },
    };

    if (this.description) {
      cardContent.description = this.description;
    }

    if (this.url) {
      cardContent.url = this.url;
    }

    // Add metadata if operator is set
    if (this.operator) {
      cardContent.metadata = {
        ha2ha: {
          operator: this.operator,
          attestation: {
            type: 'self-signed',
          },
        } as Ha2haAgentMetadata,
      };
    }

    // Sign the card
    const signer = new Signer(this.identity.keyPair, this.identity.agentId);
    const signedCard = await signer.signAgentCard(cardContent);

    return signedCard;
  }

  /**
   * Build the Agent Card from a configuration object.
   * 
   * @param config - Card configuration
   * @returns Promise resolving to the signed card
   */
  async buildFromConfig(config: AgentCardConfig): Promise<Ha2haAgentCard> {
    this.setName(config.name);
    this.setVersion(config.version);
    
    if (config.description) {
      this.setDescription(config.description);
    }
    if (config.url) {
      this.setUrl(config.url);
    }
    if (config.operator) {
      this.setOperator(config.operator.name, config.operator.contact);
    }

    return this.build();
  }
}

/**
 * Create a signed Agent Card with HA2HA extension.
 * 
 * @param identity - Agent identity for signing
 * @param config - Card configuration
 * @param ha2haParams - HA2HA extension parameters
 * @returns Promise resolving to the signed card
 */
export async function createAgentCard(
  identity: AgentIdentity,
  config: AgentCardConfig,
  ha2haParams: Partial<Ha2haExtensionParams> = {}
): Promise<Ha2haAgentCard> {
  const builder = new AgentCardBuilder(identity);
  
  builder
    .setName(config.name)
    .setVersion(config.version)
    .addHa2haExtension(ha2haParams);

  if (config.description) {
    builder.setDescription(config.description);
  }
  if (config.url) {
    builder.setUrl(config.url);
  }
  if (config.operator) {
    builder.setOperator(config.operator.name, config.operator.contact);
  }

  return builder.build();
}

/**
 * Verify an Agent Card's signature.
 * 
 * @param card - The Agent Card to verify
 * @returns True if signature is valid
 */
export async function verifyAgentCard(card: Ha2haAgentCard): Promise<boolean> {
  // Import verifier - using identity module's verification
  const { Verifier } = await import('../identity/index.js');
  
  // Use the verifier's built-in Agent Card verification
  // Note: Only name, version, capabilities, url are signed (per identity module)
  // Description and metadata are NOT included in the signature
  const result = await Verifier.verifyAgentCard(
    {
      name: card.name,
      version: card.version,
      capabilities: card.capabilities as Record<string, unknown>,
      url: card.url,
      ha2ha: card.ha2ha,
    },
    card.ha2ha.publicKey
  );

  return result.valid;
}

/**
 * Extract the agent ID from a signed card's attestation.
 * 
 * @param card - The Agent Card
 * @returns The agent ID from the signature's key ID, or undefined
 */
export function getAgentIdFromCard(card: Ha2haAgentCard): string | undefined {
  try {
    // Decode the base64url-encoded protected header
    const protectedHeader = card.ha2ha.attestation.protected;
    // Base64url decode
    const padded = protectedHeader
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padding = padded.length % 4;
    const paddedFull = padding ? padded + '='.repeat(4 - padding) : padded;
    const decoded = Buffer.from(paddedFull, 'base64').toString('utf-8');
    const header = JSON.parse(decoded);
    return header.kid;
  } catch {
    return undefined;
  }
}

/**
 * Serialize an Agent Card for transport.
 * 
 * @param card - The Agent Card
 * @returns JSON string
 */
export function serializeAgentCard(card: Ha2haAgentCard): string {
  return JSON.stringify(card, null, 2);
}

/**
 * Parse a serialized Agent Card.
 * 
 * @param json - JSON string
 * @returns Parsed Agent Card
 * @throws Error if parsing fails
 */
export function parseAgentCard(json: string): Ha2haAgentCard {
  const card = JSON.parse(json) as Ha2haAgentCard;
  
  // Basic structure validation
  if (!card.name || !card.version || !card.capabilities || !card.ha2ha) {
    throw new Error('Invalid Agent Card structure');
  }
  if (!card.ha2ha.publicKey || !card.ha2ha.attestation) {
    throw new Error('Invalid Agent Card: missing ha2ha extensions');
  }

  return card;
}
