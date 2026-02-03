/**
 * Pre-Trust Resolver
 * 
 * Resolves pre-trusted entities from the approver profile.
 * Maps names/IDs to initial trust levels based on profile configuration.
 */

import { TrustLevel } from '../trust';
import { PreTrustedEntity, TrustLevelName } from '../onboarding';
import { PreTrustResult, PreTrustResolveOptions } from './types';

/**
 * Maps profile trust level names to TrustLevel enum values.
 */
const TRUST_LEVEL_MAP: Record<Extract<TrustLevelName, 'provisional' | 'standard' | 'trusted'>, TrustLevel> = {
  provisional: TrustLevel.PROVISIONAL,
  standard: TrustLevel.STANDARD,
  trusted: TrustLevel.TRUSTED,
};

/**
 * Normalize a name for fuzzy matching.
 * Converts to lowercase, removes extra whitespace, handles common variations.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, ''); // Remove punctuation
}

/**
 * Check if a domain matches a pattern.
 * Supports wildcards (*) and hierarchical patterns (e.g., "technical/*").
 */
function domainMatches(pattern: string, domain: string): boolean {
  // Wildcard matches everything
  if (pattern === '*') {
    return true;
  }
  
  // Exact match
  if (pattern === domain) {
    return true;
  }
  
  // Hierarchical wildcard (e.g., "technical/*" matches "technical/review")
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return domain.startsWith(prefix + '/') || domain === prefix;
  }
  
  // Prefix wildcard (e.g., "*/review" matches "technical/review")
  if (pattern.startsWith('*/')) {
    const suffix = pattern.slice(2);
    return domain.endsWith('/' + suffix) || domain === suffix;
  }
  
  return false;
}

/**
 * Resolves pre-trusted entities from profile configuration.
 */
export class PreTrustResolver {
  private preTrusted: PreTrustedEntity[];
  private resolvedEntities: Map<string, PreTrustedEntity> = new Map();

  constructor(preTrusted: PreTrustedEntity[]) {
    this.preTrusted = preTrusted;
  }

  /**
   * Resolve a pre-trusted entity by name or agent ID.
   */
  resolve(options: PreTrustResolveOptions): PreTrustResult {
    const { agentId, name, domain } = options;

    // First, check if we've already resolved this entity
    if (agentId && this.resolvedEntities.has(agentId)) {
      const entity = this.resolvedEntities.get(agentId)!;
      return this.createResult(entity, domain);
    }

    // Try to match by agent_id first (exact match)
    if (agentId) {
      const byId = this.preTrusted.find(e => e.agent_id === agentId);
      if (byId) {
        this.resolvedEntities.set(agentId, byId);
        return this.createResult(byId, domain);
      }
    }

    // Try to match by name (fuzzy match)
    if (name) {
      const normalizedInput = normalizeName(name);
      
      for (const entity of this.preTrusted) {
        const normalizedEntity = normalizeName(entity.name);
        
        // Exact match after normalization
        if (normalizedEntity === normalizedInput) {
          if (agentId) {
            this.resolvedEntities.set(agentId, entity);
          }
          return this.createResult(entity, domain);
        }
        
        // Check if input contains the entity name or vice versa
        // This handles cases like "Mic" matching "Michael" or "Mic (brother)"
        if (normalizedInput.includes(normalizedEntity) || normalizedEntity.includes(normalizedInput)) {
          if (agentId) {
            this.resolvedEntities.set(agentId, entity);
          }
          return this.createResult(entity, domain);
        }
      }
    }

    // No match found
    return { matched: false };
  }

  /**
   * Check if an entity is pre-trusted for a specific domain.
   */
  isTrustedForDomain(options: PreTrustResolveOptions & { domain: string }): boolean {
    const result = this.resolve(options);
    return result.matched && (result.domains?.includes('*') || result.domains?.some(d => domainMatches(d, options.domain)) || false);
  }

  /**
   * Get the trust level for a pre-trusted entity.
   */
  getTrustLevel(options: PreTrustResolveOptions): TrustLevel | null {
    const result = this.resolve(options);
    return result.matched ? (result.trustLevel ?? null) : null;
  }

  /**
   * Get all pre-trusted entity configurations.
   */
  getPreTrustedEntities(): PreTrustedEntity[] {
    return [...this.preTrusted];
  }

  /**
   * Get all resolved entity mappings (agent ID -> entity).
   */
  getResolvedMappings(): Map<string, PreTrustedEntity> {
    return new Map(this.resolvedEntities);
  }

  /**
   * Manually bind an agent ID to a pre-trusted entity.
   * Useful when the user confirms an entity's identity.
   */
  bindAgentId(agentId: string, entityName: string): boolean {
    const normalizedInput = normalizeName(entityName);
    
    for (const entity of this.preTrusted) {
      const normalizedEntity = normalizeName(entity.name);
      if (normalizedEntity === normalizedInput || 
          normalizedInput.includes(normalizedEntity) || 
          normalizedEntity.includes(normalizedInput)) {
        this.resolvedEntities.set(agentId, entity);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Clear resolved mappings (e.g., on profile reload).
   */
  clearResolved(): void {
    this.resolvedEntities.clear();
  }

  /**
   * Create a PreTrustResult from a matched entity.
   */
  private createResult(entity: PreTrustedEntity, domain?: string): PreTrustResult {
    // Check domain if specified
    if (domain) {
      const domainAllowed = entity.domains.some(d => domainMatches(d, domain));
      if (!domainAllowed) {
        return {
          matched: true,
          trustLevel: TrustLevel.UNKNOWN, // Pre-trusted but not for this domain
          entity,
          domains: entity.domains,
        };
      }
    }

    return {
      matched: true,
      trustLevel: TRUST_LEVEL_MAP[entity.level as keyof typeof TRUST_LEVEL_MAP] ?? TrustLevel.PROVISIONAL,
      entity,
      domains: entity.domains,
    };
  }
}

/**
 * Create a pre-trust resolver from an approver profile's trust baseline.
 */
export function createPreTrustResolver(preTrusted: PreTrustedEntity[]): PreTrustResolver {
  return new PreTrustResolver(preTrusted);
}
