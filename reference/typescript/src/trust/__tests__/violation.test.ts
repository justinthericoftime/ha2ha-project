/**
 * Violation Tests
 * 
 * Verifies violations reduce trust based on severity.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TrustEntry } from '../trust-entry';
import { TrustLevel, ViolationSeverity, TransitionReason } from '../types';
import {
  calculateTrustReduction,
  violationToTransitionReason,
  requiresNotification,
  triggersImmediateBlock,
  VIOLATION_TYPES,
  getViolationSeverity,
} from '../violations';

describe('calculateTrustReduction', () => {
  it('LOW severity has no reduction', () => {
    expect(calculateTrustReduction(ViolationSeverity.LOW)).toBe(0);
  });

  it('MEDIUM severity drops one level', () => {
    expect(calculateTrustReduction(ViolationSeverity.MEDIUM)).toBe(1);
  });

  it('HIGH severity drops two levels', () => {
    expect(calculateTrustReduction(ViolationSeverity.HIGH)).toBe(2);
  });

  it('CRITICAL severity drops to blocked (5 levels)', () => {
    expect(calculateTrustReduction(ViolationSeverity.CRITICAL)).toBe(5);
  });
});

describe('violationToTransitionReason', () => {
  it('maps severity to correct transition reason', () => {
    expect(violationToTransitionReason(ViolationSeverity.LOW)).toBe(TransitionReason.VIOLATION_LOW);
    expect(violationToTransitionReason(ViolationSeverity.MEDIUM)).toBe(TransitionReason.VIOLATION_MEDIUM);
    expect(violationToTransitionReason(ViolationSeverity.HIGH)).toBe(TransitionReason.VIOLATION_HIGH);
    expect(violationToTransitionReason(ViolationSeverity.CRITICAL)).toBe(TransitionReason.VIOLATION_CRITICAL);
  });
});

describe('TrustEntry violation handling', () => {
  let entry: TrustEntry;

  beforeEach(() => {
    entry = TrustEntry.create('test-agent', {
      initialLevel: TrustLevel.TRUSTED,
    });
  });

  it('LOW violation increments count but does not reduce trust', () => {
    entry.recordViolation(ViolationSeverity.LOW, 'Minor issue');
    expect(entry.level).toBe(TrustLevel.TRUSTED);
    expect(entry.violationCount).toBe(1);
  });

  it('MEDIUM violation drops trust by one level', () => {
    entry.recordViolation(ViolationSeverity.MEDIUM, 'Moderate issue');
    expect(entry.level).toBe(TrustLevel.STANDARD);
    expect(entry.violationCount).toBe(1);
  });

  it('HIGH violation drops trust by two levels', () => {
    entry.recordViolation(ViolationSeverity.HIGH, 'Serious issue');
    expect(entry.level).toBe(TrustLevel.PROVISIONAL);
    expect(entry.violationCount).toBe(1);
  });

  it('CRITICAL violation drops trust to BLOCKED', () => {
    entry.recordViolation(ViolationSeverity.CRITICAL, 'Critical issue');
    expect(entry.level).toBe(TrustLevel.BLOCKED);
    expect(entry.isBlocked).toBe(true);
    expect(entry.violationCount).toBe(1);
  });

  it('trust cannot go below BLOCKED', () => {
    entry.setLevel(TrustLevel.UNKNOWN, 'test');
    entry.recordViolation(ViolationSeverity.CRITICAL, 'Test');
    expect(entry.level).toBe(TrustLevel.BLOCKED);
  });

  it('multiple violations accumulate', () => {
    entry.recordViolation(ViolationSeverity.LOW, 'First');
    entry.recordViolation(ViolationSeverity.LOW, 'Second');
    entry.recordViolation(ViolationSeverity.LOW, 'Third');
    expect(entry.violationCount).toBe(3);
    expect(entry.level).toBe(TrustLevel.TRUSTED); // Still trusted, just warnings
  });

  it('violation records details in history', () => {
    entry.recordViolation(ViolationSeverity.MEDIUM, 'Rate limit exceeded');
    
    const history = entry.history;
    const lastEntry = history[history.length - 1];
    expect(lastEntry.details).toBe('Rate limit exceeded');
    expect(lastEntry.reason).toBe(TransitionReason.VIOLATION_MEDIUM);
  });
});

describe('TrustEntry block/unblock', () => {
  let entry: TrustEntry;

  beforeEach(() => {
    entry = TrustEntry.create('test-agent', {
      initialLevel: TrustLevel.STANDARD,
    });
  });

  it('block sets trust to BLOCKED', () => {
    entry.block('Suspicious activity', 'security-bot');
    expect(entry.level).toBe(TrustLevel.BLOCKED);
    expect(entry.isBlocked).toBe(true);
  });

  it('unblock sets trust to UNKNOWN', () => {
    entry.block('Test');
    entry.unblock('admin', 'Issue resolved');
    expect(entry.level).toBe(TrustLevel.UNKNOWN);
    expect(entry.isBlocked).toBe(false);
  });

  it('unblock does nothing if not blocked', () => {
    entry.unblock('admin');
    expect(entry.level).toBe(TrustLevel.STANDARD);
  });
});

describe('violation helpers', () => {
  it('requiresNotification returns true for HIGH and CRITICAL', () => {
    expect(requiresNotification(ViolationSeverity.LOW)).toBe(false);
    expect(requiresNotification(ViolationSeverity.MEDIUM)).toBe(false);
    expect(requiresNotification(ViolationSeverity.HIGH)).toBe(true);
    expect(requiresNotification(ViolationSeverity.CRITICAL)).toBe(true);
  });

  it('triggersImmediateBlock returns true only for CRITICAL', () => {
    expect(triggersImmediateBlock(ViolationSeverity.LOW)).toBe(false);
    expect(triggersImmediateBlock(ViolationSeverity.MEDIUM)).toBe(false);
    expect(triggersImmediateBlock(ViolationSeverity.HIGH)).toBe(false);
    expect(triggersImmediateBlock(ViolationSeverity.CRITICAL)).toBe(true);
  });

  it('VIOLATION_TYPES has correct severities', () => {
    expect(getViolationSeverity('INVALID_CREDENTIALS')).toBe(ViolationSeverity.CRITICAL);
    expect(getViolationSeverity('EXPIRED_TOKEN')).toBe(ViolationSeverity.LOW);
    expect(getViolationSeverity('SCOPE_EXCEEDED')).toBe(ViolationSeverity.MEDIUM);
    expect(getViolationSeverity('UNAUTHORIZED_ACTION')).toBe(ViolationSeverity.HIGH);
  });
});
