/**
 * Availability Checker
 * 
 * Implements availability checking based on approver profile settings.
 * Supports "always", "waking-hours", and "scheduled" modes.
 */

import { Availability, Schedule, ScheduleWindow } from '../onboarding';
import {
  AvailabilityStatus,
  AvailabilityCheckOptions,
  WakingHoursConfig,
  DEFAULT_WAKING_HOURS,
} from './types';

/**
 * Day of week mapping for schedule windows.
 */
const DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Parses a time string (HH:MM) to hours and minutes.
 */
function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Gets the current time in a specific timezone.
 */
function getTimeInTimezone(date: Date, timezone: string): { hours: number; minutes: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  
  const parts = formatter.formatToParts(date);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const weekday = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() ?? 'sun';
  const dayOfWeek = DAY_MAP[weekday] ?? 0;
  
  return { hours, minutes, dayOfWeek };
}

/**
 * Checks if a time is within a schedule window.
 */
function isInWindow(
  hours: number,
  minutes: number,
  dayOfWeek: number,
  window: ScheduleWindow
): boolean {
  // Check if the day matches
  const dayName = Object.keys(DAY_MAP).find(k => DAY_MAP[k] === dayOfWeek) as keyof typeof DAY_MAP;
  if (!window.days.includes(dayName as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')) {
    return false;
  }
  
  const start = parseTime(window.start);
  const end = parseTime(window.end);
  
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  
  // Handle overnight windows (e.g., 22:00 to 06:00)
  if (endMinutes < startMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Checks if a time is within waking hours.
 */
function isInWakingHours(
  hours: number,
  minutes: number,
  config: WakingHoursConfig
): boolean {
  const wake = parseTime(config.wakeTime ?? DEFAULT_WAKING_HOURS.wakeTime);
  const sleep = parseTime(config.sleepTime ?? DEFAULT_WAKING_HOURS.sleepTime);
  
  const currentMinutes = hours * 60 + minutes;
  const wakeMinutes = wake.hours * 60 + wake.minutes;
  const sleepMinutes = sleep.hours * 60 + sleep.minutes;
  
  // Handle overnight sleep (e.g., wake at 08:00, sleep at 23:00)
  if (sleepMinutes > wakeMinutes) {
    return currentMinutes >= wakeMinutes && currentMinutes < sleepMinutes;
  }
  
  // Handle daytime sleep (rare, but possible for night shift)
  return currentMinutes >= wakeMinutes || currentMinutes < sleepMinutes;
}

/**
 * Calculate the next available time for scheduled availability.
 */
function getNextAvailableTimeForSchedule(
  date: Date,
  schedule: Schedule
): Date | undefined {
  if (schedule.windows.length === 0) {
    return undefined;
  }

  const { hours, minutes, dayOfWeek } = getTimeInTimezone(date, schedule.timezone);
  const currentMinutes = hours * 60 + minutes;
  
  // Check each day starting from today, up to 7 days ahead
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayName = Object.keys(DAY_MAP).find(k => DAY_MAP[k] === checkDay) as 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
    
    for (const window of schedule.windows) {
      if (!window.days.includes(dayName)) {
        continue;
      }
      
      const start = parseTime(window.start);
      const startMinutes = start.hours * 60 + start.minutes;
      
      // If this is today, only consider windows that haven't started yet
      if (dayOffset === 0 && startMinutes <= currentMinutes) {
        continue;
      }
      
      // Found the next available window
      const nextAvailable = new Date(date);
      nextAvailable.setDate(nextAvailable.getDate() + dayOffset);
      nextAvailable.setHours(start.hours, start.minutes, 0, 0);
      return nextAvailable;
    }
  }
  
  return undefined;
}

/**
 * Calculate the next available time for waking hours.
 */
function getNextAvailableTimeForWakingHours(
  date: Date,
  config: WakingHoursConfig
): Date | undefined {
  const timezone = config.timezone ?? DEFAULT_WAKING_HOURS.timezone;
  const wake = parseTime(config.wakeTime ?? DEFAULT_WAKING_HOURS.wakeTime);
  const { hours, minutes } = getTimeInTimezone(date, timezone);
  
  const currentMinutes = hours * 60 + minutes;
  const wakeMinutes = wake.hours * 60 + wake.minutes;
  
  // If before wake time, next available is wake time today
  if (currentMinutes < wakeMinutes) {
    const nextAvailable = new Date(date);
    nextAvailable.setHours(wake.hours, wake.minutes, 0, 0);
    return nextAvailable;
  }
  
  // Otherwise, next available is wake time tomorrow
  const nextAvailable = new Date(date);
  nextAvailable.setDate(nextAvailable.getDate() + 1);
  nextAvailable.setHours(wake.hours, wake.minutes, 0, 0);
  return nextAvailable;
}

/**
 * Checks approver availability based on profile settings.
 */
export class AvailabilityChecker {
  private availability: Availability;
  private wakingHoursConfig: WakingHoursConfig;
  private nowFn: () => Date;

  constructor(
    availability: Availability,
    options: { wakingHours?: WakingHoursConfig; now?: () => Date } = {}
  ) {
    this.availability = availability;
    this.wakingHoursConfig = options.wakingHours ?? DEFAULT_WAKING_HOURS;
    this.nowFn = options.now ?? (() => new Date());
  }

  /**
   * Check if the approver is currently available.
   */
  isAvailable(options: AvailabilityCheckOptions = {}): boolean {
    const now = options.at ?? this.nowFn();
    return this.checkAvailability(now).available;
  }

  /**
   * Get detailed availability status.
   */
  getStatus(options: AvailabilityCheckOptions = {}): AvailabilityStatus {
    const now = options.at ?? this.nowFn();
    return this.checkAvailability(now);
  }

  /**
   * Check if currently within waking hours.
   * This is a judgment-based check - soft enforcement.
   */
  isWakingHours(at?: Date): boolean {
    const now = at ?? this.nowFn();
    const timezone = this.availability.schedule?.timezone ?? this.wakingHoursConfig.timezone ?? DEFAULT_WAKING_HOURS.timezone;
    const { hours, minutes } = getTimeInTimezone(now, timezone);
    return isInWakingHours(hours, minutes, this.wakingHoursConfig);
  }

  /**
   * Get the next available time (if not currently available).
   */
  getNextAvailableTime(at?: Date): Date | undefined {
    const now = at ?? this.nowFn();
    const status = this.checkAvailability(now);
    return status.nextAvailableAt;
  }

  /**
   * Internal availability check implementation.
   */
  private checkAvailability(now: Date): AvailabilityStatus {
    const mode = this.availability.mode;
    const enforcement = this.availability.enforcement;

    // "always" mode - always available
    if (mode === 'always') {
      return {
        available: true,
        mode,
        enforcement,
      };
    }

    // "waking-hours" mode - soft/judgment-based schedule
    if (mode === 'waking-hours') {
      const timezone = this.availability.schedule?.timezone ?? this.wakingHoursConfig.timezone ?? DEFAULT_WAKING_HOURS.timezone;
      const { hours, minutes } = getTimeInTimezone(now, timezone);
      const inWakingHours = isInWakingHours(hours, minutes, this.wakingHoursConfig);

      if (inWakingHours) {
        return {
          available: true,
          mode,
          enforcement,
        };
      }

      return {
        available: false,
        mode,
        enforcement,
        reason: 'Outside waking hours',
        nextAvailableAt: getNextAvailableTimeForWakingHours(now, {
          ...this.wakingHoursConfig,
          timezone,
        }),
      };
    }

    // "scheduled" mode - strict schedule windows
    if (mode === 'scheduled' && this.availability.schedule) {
      const schedule = this.availability.schedule;
      const { hours, minutes, dayOfWeek } = getTimeInTimezone(now, schedule.timezone);

      // Check if current time is in any window
      for (const window of schedule.windows) {
        if (isInWindow(hours, minutes, dayOfWeek, window)) {
          return {
            available: true,
            mode,
            enforcement,
          };
        }
      }

      return {
        available: false,
        mode,
        enforcement,
        reason: 'Outside scheduled availability windows',
        nextAvailableAt: getNextAvailableTimeForSchedule(now, schedule),
      };
    }

    // Default: available (fail-open for availability)
    return {
      available: true,
      mode,
      enforcement,
    };
  }
}
