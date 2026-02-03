/**
 * Tests for AvailabilityChecker
 */

import { describe, it, expect } from 'vitest';
import { AvailabilityChecker } from '../availability';
import { Availability } from '../../onboarding';

describe('AvailabilityChecker', () => {
  describe('always mode', () => {
    const availability: Availability = {
      mode: 'always',
      enforcement: 'soft',
    };

    it('should always be available', () => {
      const checker = new AvailabilityChecker(availability);
      expect(checker.isAvailable()).toBe(true);
    });

    it('should return correct status', () => {
      const checker = new AvailabilityChecker(availability);
      const status = checker.getStatus();
      expect(status.available).toBe(true);
      expect(status.mode).toBe('always');
      expect(status.nextAvailableAt).toBeUndefined();
    });
  });

  describe('waking-hours mode', () => {
    const availability: Availability = {
      mode: 'waking-hours',
      enforcement: 'soft',
    };

    it('should be available during waking hours (10 AM)', () => {
      // Create a fixed time: 10:00 AM local time
      const fixedDate = new Date();
      fixedDate.setHours(10, 0, 0, 0);
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
        wakingHours: {
          wakeTime: '08:00',
          sleepTime: '23:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      
      expect(checker.isAvailable()).toBe(true);
      expect(checker.isWakingHours()).toBe(true);
    });

    it('should be unavailable outside waking hours (3 AM)', () => {
      // Create a fixed time: 3:00 AM local time
      const fixedDate = new Date();
      fixedDate.setHours(3, 0, 0, 0);
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
        wakingHours: {
          wakeTime: '08:00',
          sleepTime: '23:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      
      expect(checker.isAvailable()).toBe(false);
      expect(checker.isWakingHours()).toBe(false);
    });

    it('should provide next available time when unavailable', () => {
      // Create a fixed time: 3:00 AM local time
      const fixedDate = new Date();
      fixedDate.setHours(3, 0, 0, 0);
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
        wakingHours: {
          wakeTime: '08:00',
          sleepTime: '23:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      
      const status = checker.getStatus();
      expect(status.available).toBe(false);
      expect(status.reason).toBe('Outside waking hours');
      expect(status.nextAvailableAt).toBeDefined();
      expect(status.nextAvailableAt!.getHours()).toBe(8);
    });

    it('should handle late night availability (11 PM)', () => {
      // Create a fixed time: 11:00 PM local time
      const fixedDate = new Date();
      fixedDate.setHours(23, 0, 0, 0);
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
        wakingHours: {
          wakeTime: '08:00',
          sleepTime: '23:00',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      
      // 23:00 is exactly at sleep time, should be unavailable
      expect(checker.isAvailable()).toBe(false);
    });
  });

  describe('scheduled mode', () => {
    const availability: Availability = {
      mode: 'scheduled',
      enforcement: 'strict',
      schedule: {
        timezone: 'UTC',
        windows: [
          { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '17:00' },
        ],
      },
    };

    it('should be available during scheduled window', () => {
      // Monday at 12:00 UTC
      const fixedDate = new Date('2026-02-02T12:00:00Z'); // This is a Monday
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
      });
      
      expect(checker.isAvailable()).toBe(true);
    });

    it('should be unavailable outside scheduled window', () => {
      // Monday at 20:00 UTC (8 PM)
      const fixedDate = new Date('2026-02-02T20:00:00Z');
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
      });
      
      expect(checker.isAvailable()).toBe(false);
    });

    it('should be unavailable on weekends', () => {
      // Saturday at 12:00 UTC
      const fixedDate = new Date('2026-02-07T12:00:00Z'); // This is a Saturday
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
      });
      
      expect(checker.isAvailable()).toBe(false);
    });

    it('should return strict enforcement in status', () => {
      const fixedDate = new Date('2026-02-07T12:00:00Z');
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
      });
      
      const status = checker.getStatus();
      expect(status.enforcement).toBe('strict');
    });
  });

  describe('enforcement modes', () => {
    it('should report soft enforcement correctly', () => {
      const availability: Availability = {
        mode: 'waking-hours',
        enforcement: 'soft',
      };
      
      const fixedDate = new Date();
      fixedDate.setHours(3, 0, 0, 0);
      
      const checker = new AvailabilityChecker(availability, {
        now: () => fixedDate,
      });
      
      const status = checker.getStatus();
      expect(status.enforcement).toBe('soft');
    });

    it('should report strict enforcement correctly', () => {
      const availability: Availability = {
        mode: 'scheduled',
        enforcement: 'strict',
        schedule: {
          timezone: 'UTC',
          windows: [],
        },
      };
      
      const checker = new AvailabilityChecker(availability);
      const status = checker.getStatus();
      expect(status.enforcement).toBe('strict');
    });
  });
});
