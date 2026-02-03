/**
 * Trust Levels Tests
 * 
 * Verifies all 6 trust levels have correct metadata and semantics.
 */

import { describe, it, expect } from 'vitest';
import {
  TrustLevel,
  TRUST_LEVEL_NAMES,
  COOLDOWN_PERIODS,
  VIOLATION_PENALTIES,
  ViolationSeverity,
} from '../types';

describe('TrustLevel enum', () => {
  it('has 6 distinct levels from 0 to 5', () => {
    expect(TrustLevel.BLOCKED).toBe(0);
    expect(TrustLevel.UNKNOWN).toBe(1);
    expect(TrustLevel.PROVISIONAL).toBe(2);
    expect(TrustLevel.STANDARD).toBe(3);
    expect(TrustLevel.TRUSTED).toBe(4);
    expect(TrustLevel.VERIFIED).toBe(5);
  });

  it('levels are ordered from least to most trusted', () => {
    expect(TrustLevel.BLOCKED).toBeLessThan(TrustLevel.UNKNOWN);
    expect(TrustLevel.UNKNOWN).toBeLessThan(TrustLevel.PROVISIONAL);
    expect(TrustLevel.PROVISIONAL).toBeLessThan(TrustLevel.STANDARD);
    expect(TrustLevel.STANDARD).toBeLessThan(TrustLevel.TRUSTED);
    expect(TrustLevel.TRUSTED).toBeLessThan(TrustLevel.VERIFIED);
  });
});

describe('TRUST_LEVEL_NAMES', () => {
  it('has human-readable names for all levels', () => {
    expect(TRUST_LEVEL_NAMES[TrustLevel.BLOCKED]).toBe('BLOCKED');
    expect(TRUST_LEVEL_NAMES[TrustLevel.UNKNOWN]).toBe('UNKNOWN');
    expect(TRUST_LEVEL_NAMES[TrustLevel.PROVISIONAL]).toBe('PROVISIONAL');
    expect(TRUST_LEVEL_NAMES[TrustLevel.STANDARD]).toBe('STANDARD');
    expect(TRUST_LEVEL_NAMES[TrustLevel.TRUSTED]).toBe('TRUSTED');
    expect(TRUST_LEVEL_NAMES[TrustLevel.VERIFIED]).toBe('VERIFIED');
  });
});

describe('COOLDOWN_PERIODS', () => {
  it('BLOCKED has infinite cooldown (requires human intervention)', () => {
    expect(COOLDOWN_PERIODS[TrustLevel.BLOCKED]).toBe(Infinity);
  });

  it('higher trust levels have shorter cooldowns', () => {
    expect(COOLDOWN_PERIODS[TrustLevel.UNKNOWN]).toBeGreaterThan(
      COOLDOWN_PERIODS[TrustLevel.PROVISIONAL]
    );
    expect(COOLDOWN_PERIODS[TrustLevel.PROVISIONAL]).toBeGreaterThan(
      COOLDOWN_PERIODS[TrustLevel.STANDARD]
    );
    expect(COOLDOWN_PERIODS[TrustLevel.STANDARD]).toBeGreaterThan(
      COOLDOWN_PERIODS[TrustLevel.TRUSTED]
    );
    expect(COOLDOWN_PERIODS[TrustLevel.TRUSTED]).toBeGreaterThan(
      COOLDOWN_PERIODS[TrustLevel.VERIFIED]
    );
  });

  it('cooldown values match spec', () => {
    expect(COOLDOWN_PERIODS[TrustLevel.UNKNOWN]).toBe(24 * 60 * 60 * 1000);     // 24h
    expect(COOLDOWN_PERIODS[TrustLevel.PROVISIONAL]).toBe(4 * 60 * 60 * 1000);  // 4h
    expect(COOLDOWN_PERIODS[TrustLevel.STANDARD]).toBe(1 * 60 * 60 * 1000);     // 1h
    expect(COOLDOWN_PERIODS[TrustLevel.TRUSTED]).toBe(15 * 60 * 1000);          // 15m
    expect(COOLDOWN_PERIODS[TrustLevel.VERIFIED]).toBe(5 * 60 * 1000);          // 5m
  });
});

describe('VIOLATION_PENALTIES', () => {
  it('LOW violation has no penalty', () => {
    expect(VIOLATION_PENALTIES[ViolationSeverity.LOW]).toBe(0);
  });

  it('MEDIUM violation drops one level', () => {
    expect(VIOLATION_PENALTIES[ViolationSeverity.MEDIUM]).toBe(1);
  });

  it('HIGH violation drops two levels', () => {
    expect(VIOLATION_PENALTIES[ViolationSeverity.HIGH]).toBe(2);
  });

  it('CRITICAL violation drops to blocked', () => {
    expect(VIOLATION_PENALTIES[ViolationSeverity.CRITICAL]).toBe(5);
  });
});
