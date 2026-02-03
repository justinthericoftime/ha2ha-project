/**
 * Tests for hash utilities
 */

import { describe, it, expect } from 'vitest';
import {
  computePayloadHash,
  verifyPayloadHash,
  getCanonicalJson,
  createApprovalMessage,
  createRejectionMessage,
} from '../hash';

describe('computePayloadHash', () => {
  it('should compute SHA-256 hash of payload', () => {
    const payload = { action: 'read', path: '/tmp/file.txt' };
    const hash = computePayloadHash(payload);

    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
    expect(hash).toMatch(/^[a-f0-9]+$/); // Only hex chars
  });

  it('should produce consistent hashes for same payload', () => {
    const payload = { action: 'read', path: '/tmp/file.txt' };
    const hash1 = computePayloadHash(payload);
    const hash2 = computePayloadHash(payload);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different payloads', () => {
    const payload1 = { action: 'read', path: '/tmp/file.txt' };
    const payload2 = { action: 'write', path: '/tmp/file.txt' };

    const hash1 = computePayloadHash(payload1);
    const hash2 = computePayloadHash(payload2);

    expect(hash1).not.toBe(hash2);
  });

  it('should canonicalize object key order', () => {
    const payload1 = { a: 1, b: 2 };
    const payload2 = { b: 2, a: 1 };

    const hash1 = computePayloadHash(payload1);
    const hash2 = computePayloadHash(payload2);

    // Same content, different key order should produce same hash
    expect(hash1).toBe(hash2);
  });

  it('should handle nested objects', () => {
    const payload = {
      action: 'execute',
      params: {
        command: 'ls',
        args: ['-la', '/tmp'],
      },
    };

    const hash = computePayloadHash(payload);
    expect(hash).toHaveLength(64);
  });

  it('should handle arrays', () => {
    const payload = [1, 2, 3, 'a', 'b', 'c'];
    const hash = computePayloadHash(payload);
    expect(hash).toHaveLength(64);
  });

  it('should handle primitive types', () => {
    expect(computePayloadHash('string')).toHaveLength(64);
    expect(computePayloadHash(42)).toHaveLength(64);
    expect(computePayloadHash(true)).toHaveLength(64);
    expect(computePayloadHash(null)).toHaveLength(64);
  });

  it('should handle empty objects and arrays', () => {
    expect(computePayloadHash({})).toHaveLength(64);
    expect(computePayloadHash([])).toHaveLength(64);
  });

  it('should produce different hashes for empty object vs array', () => {
    const hashObj = computePayloadHash({});
    const hashArr = computePayloadHash([]);

    expect(hashObj).not.toBe(hashArr);
  });
});

describe('verifyPayloadHash', () => {
  it('should return true for matching hash', () => {
    const payload = { action: 'read', path: '/tmp/file.txt' };
    const hash = computePayloadHash(payload);

    expect(verifyPayloadHash(payload, hash)).toBe(true);
  });

  it('should return false for non-matching hash', () => {
    const payload = { action: 'read', path: '/tmp/file.txt' };
    const wrongHash = 'a'.repeat(64);

    expect(verifyPayloadHash(payload, wrongHash)).toBe(false);
  });

  it('should return false when payload is modified', () => {
    const originalPayload = { action: 'read', path: '/tmp/file.txt' };
    const hash = computePayloadHash(originalPayload);

    const modifiedPayload = { action: 'write', path: '/tmp/file.txt' };
    expect(verifyPayloadHash(modifiedPayload, hash)).toBe(false);
  });

  it('should detect subtle modifications', () => {
    const payload = { count: 100 };
    const hash = computePayloadHash(payload);

    const modified = { count: 101 };
    expect(verifyPayloadHash(modified, hash)).toBe(false);
  });
});

describe('getCanonicalJson', () => {
  it('should return canonical JSON string', () => {
    const payload = { b: 2, a: 1 };
    const canonical = getCanonicalJson(payload);

    // Keys should be sorted alphabetically
    expect(canonical).toBe('{"a":1,"b":2}');
  });

  it('should handle nested objects', () => {
    const payload = { outer: { b: 2, a: 1 } };
    const canonical = getCanonicalJson(payload);

    expect(canonical).toBe('{"outer":{"a":1,"b":2}}');
  });

  it('should handle arrays', () => {
    const payload = [3, 1, 2];
    const canonical = getCanonicalJson(payload);

    // Arrays maintain order
    expect(canonical).toBe('[3,1,2]');
  });
});

describe('createApprovalMessage', () => {
  it('should create approval message in expected format', () => {
    const message = createApprovalMessage('task-123', 'hash-abc', 'single');

    expect(message).toBe('ha2ha/approve:task-123:hash-abc:single');
  });
});

describe('createRejectionMessage', () => {
  it('should create rejection message in expected format', () => {
    const message = createRejectionMessage('task-123', 'Not authorized');

    expect(message).toBe('ha2ha/reject:task-123:Not authorized');
  });
});
