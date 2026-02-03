/**
 * HA2HA Onboarding Types
 * 
 * Type definitions for approver profiles and related structures.
 */

export type IdentityModel = 'channel-based' | 'multi-factor' | 'token';
export type VerificationLevel = 'simple' | 'moderate' | 'strict';
export type AvailabilityMode = 'always' | 'waking-hours' | 'scheduled';
export type Enforcement = 'soft' | 'strict';
export type OffHoursBehavior = 'queue' | 'deny' | 'escalate';
export type PresentationMode = 'inline' | 'batched' | 'both';
export type TrustLevel = 'blocked' | 'unknown' | 'provisional' | 'standard' | 'trusted' | 'verified';
export type TimeoutAction = 'deny' | 'escalate' | 'hold';

export interface Channel {
  type: string;
  authenticated: boolean;
  identifier?: string;
}

export interface ScheduleWindow {
  days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  start: string;  // HH:MM
  end: string;    // HH:MM
}

export interface Schedule {
  timezone: string;
  windows: ScheduleWindow[];
}

export interface Availability {
  mode: AvailabilityMode;
  enforcement: Enforcement;
  schedule?: Schedule;
}

export interface PreTrustedEntity {
  name: string;
  relationship?: string;
  level: Extract<TrustLevel, 'provisional' | 'standard' | 'trusted'>;
  domains: string[];
  agent_id?: string;
}

export interface Delegate {
  name: string;
  contact?: string;
  domains?: string[];
}

export interface ApproverProfile {
  approver: {
    name: string;
    id: string;
    created: string;
  };
  identity: {
    model: IdentityModel;
    verification: VerificationLevel;
    channels?: Channel[];
  };
  authorization: {
    domains: string[];
    availability: Availability;
    off_hours_behavior: OffHoursBehavior;
  };
  approval_preferences: {
    presentation: PresentationMode;
    fatigue_limit: number | null;
    batching: boolean;
    batch_max_size?: number;
  };
  trust_baseline: {
    default_level: Extract<TrustLevel, 'blocked' | 'unknown' | 'provisional'>;
    pre_trusted: PreTrustedEntity[];
  };
  recovery: {
    delegation: Delegate[] | null;
    timeout_hours: number;
    timeout_action: TimeoutAction;
  };
}

export interface Ha2haConfig {
  enabled: boolean;
  profile?: string;
  trustStore?: string;
  enforcement?: {
    mode: 'strict' | 'permissive' | 'audit-only';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  federation?: {
    allowInbound: boolean;
    allowOutbound: boolean;
    knownAgents?: Array<{
      id: string;
      endpoint: string;
      trustLevel?: number;
    }>;
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
  }>;
}
