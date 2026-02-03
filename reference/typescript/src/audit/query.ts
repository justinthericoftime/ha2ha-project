/**
 * Audit Query
 * 
 * Provides filtering and pagination for audit log queries.
 * Supports filtering by event type, agent, time range, and more.
 * 
 * @see HA2HA Specification §7.5 (ha2ha/audit Query)
 */

import {
  AuditEntry,
  AuditQueryOptions,
  AuditQueryResult,
  AuditEventType,
} from './types';
import { compareEntries } from './audit-entry';

/**
 * Query audit entries with filtering and pagination.
 * 
 * @param entries - All entries to search
 * @param options - Query options (filters, pagination, sorting)
 * @returns Query result with matching entries and metadata
 * 
 * @example
 * ```typescript
 * const result = queryAuditLog(chain.getEntries(), {
 *   eventTypes: [AuditEventType.TASK_APPROVED, AuditEventType.TASK_REJECTED],
 *   sourceAgentId: 'alice',
 *   startTime: '2026-01-01T00:00:00Z',
 *   limit: 10,
 *   order: 'desc',
 * });
 * 
 * console.log(`Found ${result.totalCount} entries`);
 * for (const entry of result.entries) {
 *   console.log(entry.eventType, entry.timestamp);
 * }
 * ```
 */
export function queryAuditLog(
  entries: AuditEntry[],
  options: AuditQueryOptions = {}
): AuditQueryResult {
  const queriedAt = new Date().toISOString();
  
  // Apply filters
  let filtered = entries.filter(entry => matchesFilters(entry, options));
  
  // Apply sorting
  const order = options.order ?? 'asc';
  if (order === 'desc') {
    filtered = [...filtered].sort((a, b) => compareEntries(b, a));
  } else {
    filtered = [...filtered].sort(compareEntries);
  }
  
  const totalCount = filtered.length;
  
  // Apply pagination
  const offset = options.offset ?? 0;
  const limit = options.limit ?? filtered.length;
  const paginated = filtered.slice(offset, offset + limit);
  
  const hasMore = offset + paginated.length < totalCount;
  
  return {
    entries: paginated,
    totalCount,
    hasMore,
    queriedAt,
  };
}

/**
 * Check if an entry matches all specified filters.
 */
function matchesFilters(entry: AuditEntry, options: AuditQueryOptions): boolean {
  // Event type filter
  if (options.eventTypes && options.eventTypes.length > 0) {
    if (!options.eventTypes.includes(entry.eventType)) {
      return false;
    }
  }
  
  // Task ID filter
  if (options.taskId !== undefined) {
    if (entry.taskId !== options.taskId) {
      return false;
    }
  }
  
  // Source agent filter
  if (options.sourceAgentId !== undefined) {
    if (entry.sourceAgentId !== options.sourceAgentId) {
      return false;
    }
  }
  
  // Target agent filter
  if (options.targetAgentId !== undefined) {
    if (entry.targetAgentId !== options.targetAgentId) {
      return false;
    }
  }
  
  // Human ID filter
  if (options.humanId !== undefined) {
    if (entry.humanId !== options.humanId) {
      return false;
    }
  }
  
  // Outcome filter
  if (options.outcome !== undefined) {
    if (entry.outcome !== options.outcome) {
      return false;
    }
  }
  
  // Time range filters
  if (options.startTime !== undefined) {
    const entryTime = new Date(entry.timestamp).getTime();
    const startTime = new Date(options.startTime).getTime();
    if (entryTime < startTime) {
      return false;
    }
  }
  
  if (options.endTime !== undefined) {
    const entryTime = new Date(entry.timestamp).getTime();
    const endTime = new Date(options.endTime).getTime();
    if (entryTime >= endTime) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get entries for a specific task.
 * 
 * @param entries - All entries
 * @param taskId - Task ID to search for
 * @returns All entries related to the task, in chronological order
 */
export function getTaskHistory(entries: AuditEntry[], taskId: string): AuditEntry[] {
  return queryAuditLog(entries, { taskId, order: 'asc' }).entries;
}

/**
 * Get entries for a specific agent (as source or target).
 * 
 * @param entries - All entries
 * @param agentId - Agent ID to search for
 * @returns All entries involving the agent
 */
export function getAgentHistory(entries: AuditEntry[], agentId: string): AuditEntry[] {
  return entries.filter(
    entry => entry.sourceAgentId === agentId || entry.targetAgentId === agentId
  ).sort(compareEntries);
}

/**
 * Get entries for a specific human approver.
 * 
 * @param entries - All entries
 * @param humanId - Human ID to search for
 * @returns All entries involving the human
 */
export function getHumanHistory(entries: AuditEntry[], humanId: string): AuditEntry[] {
  return queryAuditLog(entries, { humanId, order: 'asc' }).entries;
}

/**
 * Get entries within a time range.
 * 
 * @param entries - All entries
 * @param startTime - Start of range (inclusive)
 * @param endTime - End of range (exclusive)
 * @returns Entries within the range
 */
export function getEntriesInRange(
  entries: AuditEntry[],
  startTime: string,
  endTime: string
): AuditEntry[] {
  return queryAuditLog(entries, { startTime, endTime, order: 'asc' }).entries;
}

/**
 * Get the most recent entries.
 * 
 * @param entries - All entries
 * @param count - Number of entries to return
 * @returns Most recent entries, newest first
 */
export function getRecentEntries(entries: AuditEntry[], count: number): AuditEntry[] {
  return queryAuditLog(entries, { limit: count, order: 'desc' }).entries;
}

/**
 * Count entries by event type.
 * 
 * @param entries - All entries
 * @returns Map of event type to count
 */
export function countByEventType(entries: AuditEntry[]): Map<AuditEventType, number> {
  const counts = new Map<AuditEventType, number>();
  
  for (const entry of entries) {
    const current = counts.get(entry.eventType) ?? 0;
    counts.set(entry.eventType, current + 1);
  }
  
  return counts;
}

/**
 * Count entries by outcome.
 * 
 * @param entries - All entries
 * @returns Map of outcome to count
 */
export function countByOutcome(entries: AuditEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const entry of entries) {
    const current = counts.get(entry.outcome) ?? 0;
    counts.set(entry.outcome, current + 1);
  }
  
  return counts;
}

/**
 * Group entries by date (YYYY-MM-DD).
 * 
 * @param entries - All entries
 * @returns Map of date string to entries
 */
export function groupByDate(entries: AuditEntry[]): Map<string, AuditEntry[]> {
  const groups = new Map<string, AuditEntry[]>();
  
  for (const entry of entries) {
    const date = entry.timestamp.slice(0, 10); // YYYY-MM-DD
    const existing = groups.get(date) ?? [];
    existing.push(entry);
    groups.set(date, existing);
  }
  
  return groups;
}

/**
 * Find security-related events (alerts, violations, circuit breaker changes).
 * 
 * @param entries - All entries
 * @returns Security-related entries
 */
export function getSecurityEvents(entries: AuditEntry[]): AuditEntry[] {
  const securityTypes: AuditEventType[] = [
    AuditEventType.SECURITY_ALERT,
    AuditEventType.SECURITY_CIRCUIT_OPEN,
    AuditEventType.SECURITY_CIRCUIT_CLOSE,
    AuditEventType.TRUST_VIOLATION,
    AuditEventType.TRUST_REVOKED,
    AuditEventType.CHAIN_TAMPER_DETECTED,
  ];
  
  return queryAuditLog(entries, { eventTypes: securityTypes, order: 'desc' }).entries;
}

/**
 * Find trust-related events.
 * 
 * @param entries - All entries
 * @returns Trust-related entries
 */
export function getTrustEvents(entries: AuditEntry[]): AuditEntry[] {
  const trustTypes: AuditEventType[] = [
    AuditEventType.TRUST_ESTABLISHED,
    AuditEventType.TRUST_ELEVATED,
    AuditEventType.TRUST_REDUCED,
    AuditEventType.TRUST_REVOKED,
    AuditEventType.TRUST_VIOLATION,
  ];
  
  return queryAuditLog(entries, { eventTypes: trustTypes, order: 'desc' }).entries;
}

/**
 * Search entries by details content (simple text search).
 * 
 * @param entries - All entries
 * @param searchText - Text to search for in details
 * @returns Matching entries
 */
export function searchDetails(entries: AuditEntry[], searchText: string): AuditEntry[] {
  const lowerSearch = searchText.toLowerCase();
  
  return entries.filter(entry => {
    const detailsJson = JSON.stringify(entry.details).toLowerCase();
    return detailsJson.includes(lowerSearch);
  });
}

/**
 * Create a query builder for fluent queries.
 * 
 * @param entries - All entries to query
 * @returns Query builder
 * 
 * @example
 * ```typescript
 * const result = createQueryBuilder(entries)
 *   .eventTypes([AuditEventType.TASK_APPROVED])
 *   .sourceAgent('alice')
 *   .since('2026-01-01')
 *   .limit(10)
 *   .descending()
 *   .execute();
 * ```
 */
export function createQueryBuilder(entries: AuditEntry[]): AuditQueryBuilder {
  return new AuditQueryBuilder(entries);
}

/**
 * Fluent query builder for audit entries.
 */
export class AuditQueryBuilder {
  private readonly allEntries: AuditEntry[];
  private options: AuditQueryOptions = {};
  
  constructor(entries: AuditEntry[]) {
    this.allEntries = entries;
  }
  
  eventTypes(types: AuditEventType[]): this {
    this.options.eventTypes = types;
    return this;
  }
  
  taskId(id: string): this {
    this.options.taskId = id;
    return this;
  }
  
  sourceAgent(id: string): this {
    this.options.sourceAgentId = id;
    return this;
  }
  
  targetAgent(id: string): this {
    this.options.targetAgentId = id;
    return this;
  }
  
  human(id: string): this {
    this.options.humanId = id;
    return this;
  }
  
  outcome(o: 'success' | 'rejected' | 'error' | 'pending'): this {
    this.options.outcome = o;
    return this;
  }
  
  since(time: string): this {
    this.options.startTime = time;
    return this;
  }
  
  until(time: string): this {
    this.options.endTime = time;
    return this;
  }
  
  between(start: string, end: string): this {
    this.options.startTime = start;
    this.options.endTime = end;
    return this;
  }
  
  limit(n: number): this {
    this.options.limit = n;
    return this;
  }
  
  offset(n: number): this {
    this.options.offset = n;
    return this;
  }
  
  ascending(): this {
    this.options.order = 'asc';
    return this;
  }
  
  descending(): this {
    this.options.order = 'desc';
    return this;
  }
  
  execute(): AuditQueryResult {
    return queryAuditLog(this.allEntries, this.options);
  }
}
