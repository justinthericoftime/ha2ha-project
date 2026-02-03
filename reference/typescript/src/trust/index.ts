/**
 * Trust Module
 * 
 * Implements §5 Trust Model from HA2HA specification.
 * Provides graduated trust levels with human oversight.
 */

// Types
export {
  TrustLevel,
  TrustContext,
  TrustEntryData,
  TrustEntryOptions,
  TrustHistoryEntry,
  TrustStoreData,
  TransitionReason,
  ViolationSeverity,
  TRUST_LEVEL_NAMES,
  COOLDOWN_PERIODS,
  VIOLATION_PENALTIES,
} from './types';

// Trust Entry
export { TrustEntry } from './trust-entry';

// Violations
export {
  calculateTrustReduction,
  violationToTransitionReason,
  createViolationRecord,
  requiresNotification,
  triggersImmediateBlock,
  getViolationSeverity,
  VIOLATION_TYPES,
  type ViolationType,
  type ViolationRecord,
} from './violations';

// Persistence
export {
  loadTrustStore,
  saveTrustStore,
  loadTrustStoreSync,
  saveTrustStoreSync,
  getDefaultStorePath,
  createEmptyStore,
} from './persistence';

// Registry
export {
  TrustRegistry,
  type TrustRegistryOptions,
  type TrustRegistryStats,
} from './trust-registry';
