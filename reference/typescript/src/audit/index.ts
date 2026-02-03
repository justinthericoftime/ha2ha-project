/**
 * HA2HA Audit Module
 * 
 * Hash-chained audit logging for tamper-evident audit trails.
 * Implements HA2HA Specification §8.9 (Audit Log Integrity).
 * 
 * @example
 * ```typescript
 * import {
 *   AuditChain,
 *   AuditEventType,
 *   verifyChain,
 *   queryAuditLog,
 * } from '@ha2ha/audit';
 * 
 * // Create and load audit chain
 * const chain = new AuditChain({
 *   storePath: './audit.jsonl',
 *   agentId: 'my-agent',
 * });
 * await chain.load();
 * 
 * // Append events
 * await chain.append({
 *   eventType: AuditEventType.TASK_APPROVED,
 *   sourceAgentId: 'alice',
 *   targetAgentId: 'bob',
 *   trustLevel: 3,
 *   outcome: 'success',
 * });
 * 
 * // Verify chain integrity
 * const result = chain.verify();
 * if (!result.valid) {
 *   console.error('Chain corrupted at entry', result.brokenAt);
 * }
 * 
 * // Query entries
 * const approved = queryAuditLog(chain.getEntries(), {
 *   eventTypes: [AuditEventType.TASK_APPROVED],
 *   limit: 10,
 * });
 * ```
 * 
 * @packageDocumentation
 */

// Types
export {
  AuditEventType,
  AuditOutcome,
  AuditEntry,
  AuditEntryData,
  AuditEntryInput,
  ChainVerificationResult,
  AuditQueryOptions,
  AuditQueryResult,
  AuditChainConfig,
  DEFAULT_AUDIT_CONFIG,
  EVENT_TYPE_NAMES,
} from './types';

// Audit Entry
export {
  createAuditEntry,
  createGenesisEntry,
  computeEntryHash,
  recomputeEntryHash,
  verifyEntryHash,
  verifyEntryLink,
  serializeEntry,
  deserializeEntry,
  summarizeEntry,
  compareEntries,
} from './audit-entry';

// Audit Chain
export {
  AuditChain,
  ChainCorruptedError,
  createAuditChain,
  getDefaultAuditPath,
} from './audit-chain';

// Verifier
export {
  verifyChain,
  verifyEntry,
  verifyLink,
  detectTamperPoint,
  verifyRange,
  formatVerificationReport,
  getChainStats,
} from './verifier';

// Query
export {
  queryAuditLog,
  getTaskHistory,
  getAgentHistory,
  getHumanHistory,
  getEntriesInRange,
  getRecentEntries,
  countByEventType,
  countByOutcome,
  groupByDate,
  getSecurityEvents,
  getTrustEvents,
  searchDetails,
  createQueryBuilder,
  AuditQueryBuilder,
} from './query';
