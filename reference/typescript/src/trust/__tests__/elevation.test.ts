/**
 * Trust Elevation Tests
 * 
 * Verifies trust elevation requires human approval and respects cooldowns.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TrustEntry } from '../trust-entry';
import { TrustLevel, TransitionReason } from '../types';

describe('TrustEntry elevation', () => {
  let entry: TrustEntry;

  beforeEach(() => {
    vi.useFakeTimers();
    entry = TrustEntry.create('test-agent');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('new agents start at UNKNOWN level', () => {
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
  });

  it('canElevate returns true when not blocked, not at max, not in cooldown', () => {
    // Wait for initial cooldown to expire
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // 25 hours
    expect(entry.canElevate()).toBe(true);
  });

  it('canElevate returns false when blocked', () => {
    entry.block('Test block');
    expect(entry.canElevate()).toBe(false);
  });

  it('canElevate returns false when at VERIFIED level', () => {
    entry.setLevel(TrustLevel.VERIFIED, 'admin');
    // Wait for cooldown
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(entry.canElevate()).toBe(false);
  });

  it('canElevate returns false when in cooldown', () => {
    // Entry starts in cooldown
    expect(entry.isInCooldown).toBe(true);
    expect(entry.canElevate()).toBe(false);
  });

  it('elevate increases trust by one level', () => {
    vi.advanceTimersByTime(25 * 60 * 60 * 1000); // Past cooldown
    expect(entry.elevate('admin')).toBe(true);
    expect(entry.level).toBe(TrustLevel.PROVISIONAL);
  });

  it('elevate records approver in history', () => {
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    entry.elevate('ricardo@example.com');
    
    const history = entry.history;
    const lastEntry = history[history.length - 1];
    expect(lastEntry.approvedBy).toBe('ricardo@example.com');
    expect(lastEntry.reason).toBe(TransitionReason.HUMAN_APPROVAL);
  });

  it('elevate returns false if cannot elevate', () => {
    // In cooldown
    expect(entry.elevate('admin')).toBe(false);
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
  });

  it('elevate caps at VERIFIED level', () => {
    entry.setLevel(TrustLevel.TRUSTED, 'admin');
    vi.advanceTimersByTime(20 * 60 * 1000); // Past cooldown
    
    entry.elevate('admin');
    expect(entry.level).toBe(TrustLevel.VERIFIED);
    
    // Try to elevate again
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(entry.elevate('admin')).toBe(false);
    expect(entry.level).toBe(TrustLevel.VERIFIED);
  });

  it('setLevel allows direct trust adjustment', () => {
    entry.setLevel(TrustLevel.TRUSTED, 'admin', 'Direct promotion');
    expect(entry.level).toBe(TrustLevel.TRUSTED);
  });

  it('setLevel records transition reason', () => {
    entry.setLevel(TrustLevel.STANDARD, 'admin');
    expect(entry.context.transitionReason).toBe(TransitionReason.HUMAN_OVERRIDE);
  });
});

describe('TrustEntry with initial options', () => {
  it('can be created with custom initial level', () => {
    const entry = TrustEntry.create('premium-agent', {
      initialLevel: TrustLevel.STANDARD,
      reason: TransitionReason.ALLOWLIST_MIGRATION,
      createdBy: 'system',
    });

    expect(entry.level).toBe(TrustLevel.STANDARD);
    expect(entry.context.transitionReason).toBe(TransitionReason.ALLOWLIST_MIGRATION);
  });
});
