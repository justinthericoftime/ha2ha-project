/**
 * Cooldown Tests
 * 
 * Verifies cooldown periods are enforced correctly.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TrustEntry } from '../trust-entry';
import { TrustLevel, COOLDOWN_PERIODS } from '../types';

describe('TrustEntry cooldown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('new entry starts in cooldown', () => {
    const entry = TrustEntry.create('test-agent');
    expect(entry.isInCooldown).toBe(true);
  });

  it('cooldown expires after configured period', () => {
    const entry = TrustEntry.create('test-agent');
    
    // UNKNOWN cooldown is 24 hours
    expect(entry.isInCooldown).toBe(true);
    
    // Advance 23 hours - still in cooldown
    vi.advanceTimersByTime(23 * 60 * 60 * 1000);
    expect(entry.isInCooldown).toBe(true);
    
    // Advance another 2 hours - cooldown expired
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(entry.isInCooldown).toBe(false);
  });

  it('cooldownRemaining returns correct value', () => {
    const entry = TrustEntry.create('test-agent');
    
    // Should be close to 24 hours initially
    const remaining = entry.cooldownRemaining;
    expect(remaining).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(remaining).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    
    // Advance 12 hours
    vi.advanceTimersByTime(12 * 60 * 60 * 1000);
    expect(entry.cooldownRemaining).toBeGreaterThan(11 * 60 * 60 * 1000);
    expect(entry.cooldownRemaining).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });

  it('cooldownRemaining returns 0 after expiry', () => {
    const entry = TrustEntry.create('test-agent');
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(entry.cooldownRemaining).toBe(0);
  });

  it('trust transition sets new cooldown', () => {
    const entry = TrustEntry.create('test-agent', {
      initialLevel: TrustLevel.PROVISIONAL,
    });
    
    // PROVISIONAL cooldown is 4 hours
    vi.advanceTimersByTime(5 * 60 * 60 * 1000); // Past 4 hours
    expect(entry.isInCooldown).toBe(false);
    
    // Elevate to STANDARD (1 hour cooldown)
    entry.elevate('admin');
    expect(entry.isInCooldown).toBe(true);
    
    // STANDARD cooldown is 1 hour
    vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes
    expect(entry.isInCooldown).toBe(true);
    
    vi.advanceTimersByTime(31 * 60 * 1000); // Another 31 minutes
    expect(entry.isInCooldown).toBe(false);
  });

  it('BLOCKED level has no cooldown (infinite)', () => {
    const entry = TrustEntry.create('test-agent');
    entry.block('Test');
    
    // cooldownExpires should be null for blocked
    expect(entry.context.cooldownExpires).toBeNull();
    
    // Cannot elevate even after long time
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); // 1 year
    expect(entry.canElevate()).toBe(false);
  });

  it('clearCooldown bypasses waiting period', () => {
    const entry = TrustEntry.create('test-agent');
    expect(entry.isInCooldown).toBe(true);
    
    entry.clearCooldown();
    expect(entry.isInCooldown).toBe(false);
    expect(entry.canElevate()).toBe(true);
  });

  it('cooldown periods match spec for each level', () => {
    expect(COOLDOWN_PERIODS[TrustLevel.BLOCKED]).toBe(Infinity);
    expect(COOLDOWN_PERIODS[TrustLevel.UNKNOWN]).toBe(24 * 60 * 60 * 1000);     // 24h
    expect(COOLDOWN_PERIODS[TrustLevel.PROVISIONAL]).toBe(4 * 60 * 60 * 1000);  // 4h
    expect(COOLDOWN_PERIODS[TrustLevel.STANDARD]).toBe(1 * 60 * 60 * 1000);     // 1h
    expect(COOLDOWN_PERIODS[TrustLevel.TRUSTED]).toBe(15 * 60 * 1000);          // 15m
    expect(COOLDOWN_PERIODS[TrustLevel.VERIFIED]).toBe(5 * 60 * 1000);          // 5m
  });

  it('higher trust levels have shorter cooldowns', () => {
    // Create entries at each non-blocked level and verify cooldown durations
    const levels = [
      TrustLevel.UNKNOWN,
      TrustLevel.PROVISIONAL,
      TrustLevel.STANDARD,
      TrustLevel.TRUSTED,
      TrustLevel.VERIFIED,
    ];

    for (let i = 0; i < levels.length - 1; i++) {
      const currentCooldown = COOLDOWN_PERIODS[levels[i]];
      const nextCooldown = COOLDOWN_PERIODS[levels[i + 1]];
      expect(currentCooldown).toBeGreaterThan(nextCooldown);
    }
  });
});
