/**
 * Payload Hashing
 * 
 * Provides canonical JSON serialization and SHA-256 hashing for
 * task payloads. Uses RFC 8785 (JSON Canonicalization Scheme) to
 * ensure consistent hashing across implementations.
 */

import { createHash } from 'crypto';
import { canonicalize } from 'json-canonicalize';

/**
 * Compute the SHA-256 hash of a payload using canonical JSON.
 * 
 * The payload is first serialized to canonical JSON (RFC 8785),
 * then hashed with SHA-256, returning a hex string.
 * 
 * @param payload - Any JSON-serializable value
 * @returns Hex-encoded SHA-256 hash
 * 
 * @example
 * ```typescript
 * const hash = computePayloadHash({ action: 'read', path: '/tmp/file.txt' });
 * // Returns: "abc123..." (64 character hex string)
 * ```
 */
export function computePayloadHash(payload: unknown): string {
  const canonical = canonicalize(payload);
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verify that a payload matches an expected hash.
 * 
 * @param payload - The payload to verify
 * @param expectedHash - The expected SHA-256 hash (hex)
 * @returns True if the computed hash matches the expected hash
 * 
 * @example
 * ```typescript
 * const isValid = verifyPayloadHash(payload, storedHash);
 * if (!isValid) {
 *   throw new Error('Payload has been tampered with');
 * }
 * ```
 */
export function verifyPayloadHash(payload: unknown, expectedHash: string): boolean {
  return computePayloadHash(payload) === expectedHash;
}

/**
 * Get the canonical JSON representation of a payload.
 * Useful for debugging and logging.
 * 
 * @param payload - Any JSON-serializable value
 * @returns Canonical JSON string
 */
export function getCanonicalJson(payload: unknown): string {
  return canonicalize(payload);
}

/**
 * Create a hash commitment message for signing.
 * This is the message that gets signed in an approval.
 * 
 * @param taskId - The task being approved
 * @param payloadHash - The payload hash being committed to
 * @param scope - The approval scope
 * @returns Message string to be signed
 */
export function createApprovalMessage(
  taskId: string,
  payloadHash: string,
  scope: string
): string {
  return `ha2ha/approve:${taskId}:${payloadHash}:${scope}`;
}

/**
 * Create a rejection message for signing.
 * 
 * @param taskId - The task being rejected
 * @param reason - The rejection reason
 * @returns Message string to be signed
 */
export function createRejectionMessage(
  taskId: string,
  reason: string
): string {
  return `ha2ha/reject:${taskId}:${reason}`;
}
