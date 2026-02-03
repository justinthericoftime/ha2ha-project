/**
 * Audit Entry
 * 
 * Provides creation and hash computation for individual audit log entries.
 * Each entry includes a SHA-256 hash of its content and the hash of the
 * previous entry, creating a tamper-evident chain.
 * 
 * @see HA2HA Specification §8.9.1 (Hash Chaining)
 */

import { createHash, randomUUID } from 'crypto';
import { canonicalize } from 'json-canonicalize';
import {
  AuditEntry,
  AuditEntryData,
  AuditEntryInput,
  AuditEventType,
} from './types';

/**
 * Create a new audit entry with computed hash.
 * 
 * @param input - Entry data (event type, agents, outcome, etc.)
 * @param prevHash - Hash of the previous entry (null for genesis)
 * @returns Complete audit entry with computed hash
 * 
 * @example
 * ```typescript
 * const entry = createAuditEntry({
 *   eventType: AuditEventType.TASK_APPROVED,
 *   sourceAgentId: 'agent-alice',
 *   targetAgentId: 'agent-bob',
 *   taskId: 'task-123',
 *   humanId: 'human-carol',
 *   trustLevel: 3,
 *   outcome: 'success',
 *   details: { approvalScope: 'single' },
 * }, previousEntry.hash);
 * ```
 */
export function createAuditEntry(
  input: AuditEntryInput,
  prevHash: string | null
): AuditEntry {
  const entryData: AuditEntryData = {
    timestamp: new Date().toISOString(),
    entryId: randomUUID(),
    eventType: input.eventType,
    taskId: input.taskId,
    sourceAgentId: input.sourceAgentId,
    targetAgentId: input.targetAgentId,
    humanId: input.humanId,
    trustLevel: input.trustLevel,
    outcome: input.outcome,
    details: input.details ?? {},
    prevHash,
  };
  
  const hash = computeEntryHash(entryData);
  
  return {
    ...entryData,
    hash,
  };
}

/**
 * Create a genesis (first) entry for a new audit chain.
 * 
 * @param agentId - ID of the agent creating the chain
 * @returns Genesis audit entry
 * 
 * @example
 * ```typescript
 * const genesis = createGenesisEntry('my-agent-id');
 * // genesis.prevHash === null
 * // genesis.eventType === AuditEventType.CHAIN_GENESIS
 * ```
 */
export function createGenesisEntry(agentId: string): AuditEntry {
  return createAuditEntry({
    eventType: AuditEventType.CHAIN_GENESIS,
    sourceAgentId: agentId,
    targetAgentId: agentId,
    trustLevel: 0,
    outcome: 'success',
    details: {
      message: 'Audit chain initialized',
      version: '1.0.0',
    },
  }, null);
}

/**
 * Compute the SHA-256 hash of an audit entry's data.
 * Uses canonical JSON (RFC 8785) for consistent serialization.
 * 
 * @param entryData - Entry data without hash field
 * @returns Hex-encoded SHA-256 hash
 * 
 * @remarks
 * The hash covers:
 * - timestamp
 * - entryId
 * - eventType
 * - taskId
 * - sourceAgentId
 * - targetAgentId
 * - humanId
 * - trustLevel
 * - outcome
 * - details
 * - prevHash
 * 
 * This ensures any modification to any field will change the hash.
 */
export function computeEntryHash(entryData: AuditEntryData): string {
  const canonical = canonicalize(entryData);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Recompute the hash of an existing entry to verify integrity.
 * 
 * @param entry - The entry to verify
 * @returns The recomputed hash
 */
export function recomputeEntryHash(entry: AuditEntry): string {
  // Extract everything except the hash field
  const { hash: _hash, ...entryData } = entry;
  return computeEntryHash(entryData);
}

/**
 * Verify that an entry's hash is correct.
 * 
 * @param entry - The entry to verify
 * @returns True if the hash is valid
 * 
 * @example
 * ```typescript
 * if (!verifyEntryHash(entry)) {
 *   throw new Error('Entry has been tampered with');
 * }
 * ```
 */
export function verifyEntryHash(entry: AuditEntry): boolean {
  return entry.hash === recomputeEntryHash(entry);
}

/**
 * Verify that two consecutive entries are properly linked.
 * 
 * @param current - The current entry
 * @param previous - The previous entry (or null for genesis)
 * @returns True if current.prevHash matches previous.hash
 * 
 * @example
 * ```typescript
 * if (!verifyEntryLink(entries[i], entries[i-1])) {
 *   throw new Error(`Chain break at entry ${i}`);
 * }
 * ```
 */
export function verifyEntryLink(
  current: AuditEntry,
  previous: AuditEntry | null
): boolean {
  if (previous === null) {
    return current.prevHash === null;
  }
  return current.prevHash === previous.hash;
}

/**
 * Serialize an audit entry to a JSON line (for JSONL storage).
 * 
 * @param entry - The entry to serialize
 * @returns JSON string (no trailing newline)
 */
export function serializeEntry(entry: AuditEntry): string {
  return JSON.stringify(entry);
}

/**
 * Deserialize an audit entry from a JSON line.
 * 
 * @param line - JSON string
 * @returns Parsed audit entry
 * @throws Error if the JSON is malformed or missing required fields
 */
export function deserializeEntry(line: string): AuditEntry {
  const parsed = JSON.parse(line);
  
  // Validate required fields
  const required = [
    'timestamp',
    'entryId',
    'eventType',
    'sourceAgentId',
    'targetAgentId',
    'trustLevel',
    'outcome',
    'details',
    'hash',
  ];
  
  for (const field of required) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // prevHash can be null, but must be present
  if (!('prevHash' in parsed)) {
    throw new Error('Missing required field: prevHash');
  }
  
  return parsed as AuditEntry;
}

/**
 * Get a summary of an audit entry for display.
 * 
 * @param entry - The entry to summarize
 * @returns Human-readable summary
 */
export function summarizeEntry(entry: AuditEntry): string {
  const time = new Date(entry.timestamp).toLocaleString();
  const task = entry.taskId ? ` [${entry.taskId.slice(0, 8)}...]` : '';
  const human = entry.humanId ? ` by ${entry.humanId}` : '';
  
  return `${time}: ${entry.eventType}${task}${human} (${entry.outcome})`;
}

/**
 * Compare two entries by timestamp.
 * 
 * @param a - First entry
 * @param b - Second entry
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export function compareEntries(a: AuditEntry, b: AuditEntry): number {
  return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
}
