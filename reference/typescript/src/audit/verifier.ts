/**
 * Chain Verifier
 * 
 * Provides integrity verification for hash-chained audit logs.
 * Detects tampering by verifying:
 * 1. Each entry's hash is correct
 * 2. Each entry's prevHash matches the previous entry's hash
 * 
 * @see HA2HA Specification §8.9.2 (Integrity Verification)
 */

import {
  AuditEntry,
  ChainVerificationResult,
} from './types';
import {
  verifyEntryHash,
  verifyEntryLink,
  recomputeEntryHash,
} from './audit-entry';

/**
 * Verify the integrity of an entire audit chain.
 * 
 * @param entries - Array of audit entries to verify
 * @returns Verification result with details on any failures
 * 
 * @example
 * ```typescript
 * const result = verifyChain(chain.getEntries());
 * if (!result.valid) {
 *   console.error(`Chain broken at entry ${result.brokenAt}: ${result.errorMessage}`);
 * }
 * ```
 */
export function verifyChain(entries: AuditEntry[]): ChainVerificationResult {
  const verifiedAt = new Date().toISOString();
  
  if (entries.length === 0) {
    return {
      valid: true,
      entriesVerified: 0,
      verifiedAt,
    };
  }
  
  // Verify genesis entry
  const genesis = entries[0];
  if (genesis.prevHash !== null) {
    return {
      valid: false,
      entriesVerified: 0,
      brokenAt: 0,
      errorType: 'prev_hash_mismatch',
      errorMessage: 'Genesis entry must have null prevHash',
      evidence: [genesis],
      verifiedAt,
    };
  }
  
  if (!verifyEntryHash(genesis)) {
    const expected = recomputeEntryHash(genesis);
    return {
      valid: false,
      entriesVerified: 0,
      brokenAt: 0,
      errorType: 'hash_mismatch',
      errorMessage: `Genesis entry hash mismatch. Expected: ${expected.slice(0, 16)}..., Got: ${genesis.hash.slice(0, 16)}...`,
      evidence: [genesis],
      verifiedAt,
    };
  }
  
  // Verify each subsequent entry
  for (let i = 1; i < entries.length; i++) {
    const current = entries[i];
    const previous = entries[i - 1];
    
    // Verify the entry's own hash
    if (!verifyEntryHash(current)) {
      const expected = recomputeEntryHash(current);
      return {
        valid: false,
        entriesVerified: i,
        brokenAt: i,
        errorType: 'hash_mismatch',
        errorMessage: `Entry ${i} hash mismatch. Expected: ${expected.slice(0, 16)}..., Got: ${current.hash.slice(0, 16)}...`,
        evidence: getEvidence(entries, i),
        verifiedAt,
      };
    }
    
    // Verify the link to the previous entry
    if (!verifyEntryLink(current, previous)) {
      return {
        valid: false,
        entriesVerified: i,
        brokenAt: i,
        errorType: 'prev_hash_mismatch',
        errorMessage: `Entry ${i} prevHash doesn't match entry ${i - 1} hash. Expected: ${previous.hash.slice(0, 16)}..., Got: ${current.prevHash?.slice(0, 16) ?? 'null'}...`,
        evidence: getEvidence(entries, i),
        verifiedAt,
      };
    }
  }
  
  return {
    valid: true,
    entriesVerified: entries.length,
    verifiedAt,
  };
}

/**
 * Verify a single entry in isolation (just its hash, not chain linkage).
 * 
 * @param entry - Entry to verify
 * @returns True if entry's hash is valid
 */
export function verifyEntry(entry: AuditEntry): boolean {
  return verifyEntryHash(entry);
}

/**
 * Verify that two consecutive entries are properly linked.
 * 
 * @param current - The current entry
 * @param previous - The previous entry (or null for genesis)
 * @returns True if properly linked
 */
export function verifyLink(
  current: AuditEntry,
  previous: AuditEntry | null
): boolean {
  return verifyEntryLink(current, previous);
}

/**
 * Find the exact point where tampering occurred.
 * Provides detailed forensic information.
 * 
 * @param entries - Array of audit entries
 * @returns Index of first corrupted entry, or -1 if chain is valid
 */
export function detectTamperPoint(entries: AuditEntry[]): number {
  const result = verifyChain(entries);
  return result.valid ? -1 : (result.brokenAt ?? 0);
}

/**
 * Verify a partial chain (range of entries).
 * Useful for incremental verification of long chains.
 * 
 * @param entries - All entries in the chain
 * @param startIndex - Start of range to verify (inclusive)
 * @param endIndex - End of range to verify (exclusive)
 * @returns Verification result for the range
 */
export function verifyRange(
  entries: AuditEntry[],
  startIndex: number,
  endIndex: number
): ChainVerificationResult {
  const verifiedAt = new Date().toISOString();
  
  if (startIndex < 0 || endIndex > entries.length || startIndex >= endIndex) {
    return {
      valid: false,
      entriesVerified: 0,
      brokenAt: startIndex,
      errorType: 'invalid_format',
      errorMessage: 'Invalid range specified',
      verifiedAt,
    };
  }
  
  const rangeEntries = entries.slice(startIndex, endIndex);
  
  // If starting at 0, use normal verification
  if (startIndex === 0) {
    return verifyChain(rangeEntries);
  }
  
  // Otherwise, verify the first entry links to the entry before the range
  const firstInRange = rangeEntries[0];
  const beforeRange = entries[startIndex - 1];
  
  if (!verifyEntryLink(firstInRange, beforeRange)) {
    return {
      valid: false,
      entriesVerified: 0,
      brokenAt: startIndex,
      errorType: 'prev_hash_mismatch',
      errorMessage: `Entry ${startIndex} doesn't link to entry ${startIndex - 1}`,
      evidence: [beforeRange, firstInRange],
      verifiedAt,
    };
  }
  
  // Verify each entry in the range
  for (let i = 0; i < rangeEntries.length; i++) {
    const entry = rangeEntries[i];
    const globalIndex = startIndex + i;
    
    if (!verifyEntryHash(entry)) {
      return {
        valid: false,
        entriesVerified: i,
        brokenAt: globalIndex,
        errorType: 'hash_mismatch',
        errorMessage: `Entry ${globalIndex} hash mismatch`,
        evidence: getEvidence(entries, globalIndex),
        verifiedAt,
      };
    }
    
    if (i > 0 && !verifyEntryLink(entry, rangeEntries[i - 1])) {
      return {
        valid: false,
        entriesVerified: i,
        brokenAt: globalIndex,
        errorType: 'prev_hash_mismatch',
        errorMessage: `Entry ${globalIndex} link mismatch`,
        evidence: getEvidence(entries, globalIndex),
        verifiedAt,
      };
    }
  }
  
  return {
    valid: true,
    entriesVerified: rangeEntries.length,
    verifiedAt,
  };
}

/**
 * Get evidence entries around a break point.
 * Returns up to 3 entries: before, at, and after the break.
 */
function getEvidence(entries: AuditEntry[], breakIndex: number): AuditEntry[] {
  const evidence: AuditEntry[] = [];
  
  if (breakIndex > 0) {
    evidence.push(entries[breakIndex - 1]);
  }
  evidence.push(entries[breakIndex]);
  if (breakIndex < entries.length - 1) {
    evidence.push(entries[breakIndex + 1]);
  }
  
  return evidence;
}

/**
 * Generate a verification report for display.
 * 
 * @param result - Verification result
 * @returns Human-readable report
 */
export function formatVerificationReport(result: ChainVerificationResult): string {
  const lines: string[] = [];
  
  lines.push('=== Audit Chain Verification Report ===');
  lines.push(`Verified at: ${result.verifiedAt}`);
  lines.push(`Status: ${result.valid ? 'VALID ✓' : 'CORRUPTED ✗'}`);
  lines.push(`Entries verified: ${result.entriesVerified}`);
  
  if (!result.valid) {
    lines.push('');
    lines.push('--- Corruption Details ---');
    lines.push(`Broken at entry: ${result.brokenAt}`);
    lines.push(`Error type: ${result.errorType}`);
    lines.push(`Message: ${result.errorMessage}`);
    
    if (result.evidence && result.evidence.length > 0) {
      lines.push('');
      lines.push('--- Evidence ---');
      for (const entry of result.evidence) {
        lines.push(`  Entry ${entry.entryId.slice(0, 8)}...:`);
        lines.push(`    Timestamp: ${entry.timestamp}`);
        lines.push(`    Event: ${entry.eventType}`);
        lines.push(`    Hash: ${entry.hash.slice(0, 16)}...`);
        lines.push(`    PrevHash: ${entry.prevHash?.slice(0, 16) ?? 'null'}...`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Calculate chain statistics.
 * 
 * @param entries - Audit entries
 * @returns Statistics about the chain
 */
export function getChainStats(entries: AuditEntry[]): {
  totalEntries: number;
  firstEntryTime: string | null;
  lastEntryTime: string | null;
  eventTypeCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
} {
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      firstEntryTime: null,
      lastEntryTime: null,
      eventTypeCounts: {},
      outcomeCounts: {},
    };
  }
  
  const eventTypeCounts: Record<string, number> = {};
  const outcomeCounts: Record<string, number> = {};
  
  for (const entry of entries) {
    eventTypeCounts[entry.eventType] = (eventTypeCounts[entry.eventType] || 0) + 1;
    outcomeCounts[entry.outcome] = (outcomeCounts[entry.outcome] || 0) + 1;
  }
  
  return {
    totalEntries: entries.length,
    firstEntryTime: entries[0].timestamp,
    lastEntryTime: entries[entries.length - 1].timestamp,
    eventTypeCounts,
    outcomeCounts,
  };
}
