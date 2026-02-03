/**
 * Tests for PreTrustResolver
 */

import { describe, it, expect } from 'vitest';
import { PreTrustResolver, createPreTrustResolver } from '../pre-trust';
import { TrustLevel } from '../../trust';
import { PreTrustedEntity } from '../../onboarding';

describe('PreTrustResolver', () => {
  const preTrusted: PreTrustedEntity[] = [
    {
      name: 'Mic',
      relationship: 'brother',
      level: 'provisional',
      domains: ['technical/*'],
    },
    {
      name: 'JD',
      relationship: 'friend/mentor',
      level: 'provisional',
      domains: ['*'],
    },
    {
      name: 'Alice Smith',
      relationship: 'colleague',
      level: 'standard',
      domains: ['work/*'],
      agent_id: 'alice-agent-123',
    },
  ];

  describe('resolve by name', () => {
    it('should resolve exact name match', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Mic' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
      expect(result.entity?.name).toBe('Mic');
    });

    it('should resolve case-insensitive name match', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'mic' });
      
      expect(result.matched).toBe(true);
      expect(result.entity?.name).toBe('Mic');
    });

    it('should resolve name with extra whitespace', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: '  Mic  ' });
      
      expect(result.matched).toBe(true);
    });

    it('should not match unknown names', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Unknown Person' });
      
      expect(result.matched).toBe(false);
    });

    it('should handle partial name matches', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      // "Alice" should match "Alice Smith"
      const result = resolver.resolve({ name: 'Alice' });
      
      expect(result.matched).toBe(true);
      expect(result.entity?.name).toBe('Alice Smith');
    });
  });

  describe('resolve by agent ID', () => {
    it('should resolve by exact agent_id', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ agentId: 'alice-agent-123' });
      
      expect(result.matched).toBe(true);
      expect(result.entity?.name).toBe('Alice Smith');
    });

    it('should not match unknown agent IDs', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ agentId: 'unknown-agent' });
      
      expect(result.matched).toBe(false);
    });

    it('should cache resolved agent ID to entity mappings', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      // First resolution by name, providing agent ID
      resolver.resolve({ name: 'JD', agentId: 'jd-agent-456' });
      
      // Second resolution by agent ID only
      const result = resolver.resolve({ agentId: 'jd-agent-456' });
      
      expect(result.matched).toBe(true);
      expect(result.entity?.name).toBe('JD');
    });
  });

  describe('domain filtering', () => {
    it('should match wildcard domain', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'JD', domain: 'anything/at/all' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
    });

    it('should match hierarchical domain pattern', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Mic', domain: 'technical/review' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
    });

    it('should return UNKNOWN for domain not in pre-trust list', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      // Mic is only trusted for technical/*, not financial
      const result = resolver.resolve({ name: 'Mic', domain: 'financial/budget' });
      
      expect(result.matched).toBe(true);
      expect(result.trustLevel).toBe(TrustLevel.UNKNOWN); // Pre-trusted but not for this domain
    });
  });

  describe('trust levels', () => {
    it('should return correct trust level for provisional', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Mic' });
      
      expect(result.trustLevel).toBe(TrustLevel.PROVISIONAL);
    });

    it('should return correct trust level for standard', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Alice Smith' });
      
      expect(result.trustLevel).toBe(TrustLevel.STANDARD);
    });

    it('should provide getTrustLevel helper', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      expect(resolver.getTrustLevel({ name: 'Mic' })).toBe(TrustLevel.PROVISIONAL);
      expect(resolver.getTrustLevel({ name: 'Unknown' })).toBeNull();
    });
  });

  describe('isTrustedForDomain', () => {
    it('should return true for trusted domain', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      expect(resolver.isTrustedForDomain({ name: 'Mic', domain: 'technical/code' })).toBe(true);
    });

    it('should return false for untrusted domain', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      expect(resolver.isTrustedForDomain({ name: 'Mic', domain: 'financial/budget' })).toBe(false);
    });

    it('should return true for wildcard domain trust', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      expect(resolver.isTrustedForDomain({ name: 'JD', domain: 'anything' })).toBe(true);
    });
  });

  describe('bindAgentId', () => {
    it('should manually bind agent ID to entity', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const success = resolver.bindAgentId('mic-agent-789', 'Mic');
      expect(success).toBe(true);
      
      const result = resolver.resolve({ agentId: 'mic-agent-789' });
      expect(result.matched).toBe(true);
      expect(result.entity?.name).toBe('Mic');
    });

    it('should return false for unknown entity name', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const success = resolver.bindAgentId('unknown-agent', 'Unknown Person');
      expect(success).toBe(false);
    });
  });

  describe('clearResolved', () => {
    it('should clear resolved mappings', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      resolver.resolve({ name: 'JD', agentId: 'jd-agent-456' });
      expect(resolver.getResolvedMappings().size).toBe(1);
      
      resolver.clearResolved();
      expect(resolver.getResolvedMappings().size).toBe(0);
    });
  });

  describe('getPreTrustedEntities', () => {
    it('should return all pre-trusted entities', () => {
      const resolver = new PreTrustResolver(preTrusted);
      
      const entities = resolver.getPreTrustedEntities();
      expect(entities.length).toBe(3);
      expect(entities[0].name).toBe('Mic');
    });
  });

  describe('createPreTrustResolver factory', () => {
    it('should create resolver from array', () => {
      const resolver = createPreTrustResolver(preTrusted);
      
      const result = resolver.resolve({ name: 'Mic' });
      expect(result.matched).toBe(true);
    });
  });
});
