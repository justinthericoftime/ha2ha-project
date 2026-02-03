/**
 * HA2HA A2A Protocol Integration Types
 * 
 * Defines types for A2A Agent Cards, extensions, and HA2HA integration
 * per HA2HA Specification §4 (A2A Integration) and Appendix B (HTTP Transport).
 */

import type { JWSSignature } from '../identity/types';

// ============================================================================
// A2A Core Types (from A2A specification)
// ============================================================================

/**
 * A2A Agent Extension as defined in the A2A specification.
 * HA2HA uses this mechanism to declare protocol support.
 */
export interface A2AExtension {
  /** URI identifying the extension (e.g., "https://ha2haproject.org/spec/v1") */
  uri: string;
  /** Human-readable description */
  description: string;
  /** Whether this extension is required for communication */
  required: boolean;
  /** Extension-specific parameters */
  params?: Record<string, unknown>;
}

/**
 * A2A Agent Capabilities structure.
 */
export interface A2ACapabilities {
  /** Whether the agent supports streaming responses */
  streaming?: boolean;
  /** List of declared extensions */
  extensions?: A2AExtension[];
  /** Additional capability flags */
  [key: string]: unknown;
}

/**
 * A2A Agent Card - base structure without HA2HA extensions.
 */
export interface A2AAgentCard {
  /** Agent name */
  name: string;
  /** Optional description */
  description?: string;
  /** Agent version */
  version: string;
  /** Agent URL endpoint */
  url?: string;
  /** Agent capabilities */
  capabilities: A2ACapabilities;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// HA2HA Extension Types (§4.1-4.4)
// ============================================================================

/** HA2HA Extension URI - the canonical identifier */
export const HA2HA_EXTENSION_URI = 'https://ha2haproject.org/spec/v1';

/** Current HA2HA specification version */
export const HA2HA_SPEC_VERSION = '0.1.0';

/**
 * HA2HA extension parameters as declared in Agent Card.
 * Per §4.2 Extension Parameters.
 */
export interface Ha2haExtensionParams {
  /** HA2HA specification version (required) */
  version: string;
  /** Must be true for HA2HA compliance (required) */
  humanOversight: boolean;
  /** Minimum trust level required for communication (required, 1-5) */
  trustLevelRequired: number;
  /** URL for audit log submission (optional) */
  auditEndpoint?: string;
  /** Contact for human escalation (optional) */
  escalationContact?: string;
  /** Whether behavioral monitoring is enabled (optional) */
  behavioralMonitoring?: boolean;
  /** Comma-separated list of supported versions (optional, §4.6.3) */
  supportedVersions?: string;
}

/**
 * HA2HA metadata in Agent Card (§4.3).
 */
export interface Ha2haAgentMetadata {
  /** Operator information */
  operator?: {
    name: string;
    contact: string;
  };
  /** Attestation type and data */
  attestation?: {
    type: 'self-signed' | 'ca-signed';
    certificate?: string;
  };
}

/**
 * HA2HA cryptographic extensions added to Agent Card.
 * Contains public key and signature for verification.
 */
export interface Ha2haExtensions {
  /** Base64-encoded Ed25519 public key */
  publicKey: string;
  /** JWS signature over the card content */
  attestation: JWSSignature;
}

/**
 * Complete HA2HA-signed Agent Card.
 * Extends A2A Agent Card with cryptographic attestation.
 */
export interface Ha2haAgentCard extends A2AAgentCard {
  /** HA2HA cryptographic extensions */
  ha2ha: Ha2haExtensions;
}

// ============================================================================
// Task Metadata Types (§4.4)
// ============================================================================

/**
 * HA2HA task metadata extension for A2A tasks.
 * Per §4.4 Task Metadata Extensions.
 */
export interface Ha2haTaskMetadata {
  /** Agent ID making the request */
  requestingAgent: string;
  /** Human identifier associated with the request */
  requestingHuman: string;
  /** Current trust level of the requesting agent */
  trustLevel: number;
  /** Whether human approval is required */
  approvalRequired: boolean;
  /** ISO 8601 duration for approval timeout */
  approvalTimeout: string;
  /** Unique audit identifier for this request */
  auditId: string;
}

/**
 * Trust context communicated in task metadata (§5.5).
 */
export interface Ha2haTrustContext {
  /** Current trust level (0-5) */
  level: number;
  /** Human-readable level name */
  levelName: string;
  /** ISO 8601 timestamp of last transition */
  lastTransition: string;
  /** Reason for last change */
  transitionReason: string;
  /** Cumulative violations at current level */
  violationCount: number;
  /** ISO 8601 timestamp when cooldown ends (or null) */
  cooldownExpires: string | null;
  /** Pre-approved action categories (Level 3+) */
  preApprovalScope?: string[];
}

// ============================================================================
// Negotiation Types (§4.5-4.6)
// ============================================================================

/**
 * Result of extension negotiation between two agents.
 */
export interface NegotiationResult {
  /** Whether the agents are compatible */
  compatible: boolean;
  /** The effective version to use (highest mutually supported) */
  effectiveVersion: string | null;
  /** Required extensions that are missing from peer */
  missingRequired: string[];
  /** Warning messages for non-fatal issues */
  warnings: string[];
  /** Error message if incompatible */
  error?: string;
}

/**
 * Extension presence check result (§4.5.1).
 */
export type ExtensionPresence = 
  | 'missing'           // HA2HA extension URI not present
  | 'optional'          // Present but required: false
  | 'required';         // Present and required: true

/**
 * Parameter validation result (§4.5.2).
 */
export interface ParamValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** The validated params (with defaults applied) */
  params?: Ha2haExtensionParams;
}

// ============================================================================
// HTTP Transport Types (Appendix B)
// ============================================================================

/** HTTP Transport base path */
export const HA2HA_BASE_PATH = '/.well-known/ha2ha/v1';

/** Agent Card well-known path */
export const AGENT_CARD_PATH = '/.well-known/agent.json';

/**
 * Required HTTP headers for HA2HA requests (§B.3).
 */
export interface Ha2haRequestHeaders {
  /** HA2HA version */
  'X-HA2HA-Version': string;
  /** Requesting agent identifier */
  'X-HA2HA-Agent-Id': string;
  /** Unique request ID for idempotency */
  'X-HA2HA-Request-Id': string;
  /** ISO 8601 timestamp */
  'X-HA2HA-Timestamp': string;
  /** Request signature (recommended) */
  'X-HA2HA-Signature'?: string;
}

/**
 * Error codes for HA2HA HTTP responses (§B.4.1).
 */
export enum Ha2haErrorCode {
  APPROVAL_EXPIRED = -32001,
  TASK_ALREADY_REJECTED = -32002,
  TASK_ALREADY_APPROVED = -32003,
  TASK_NOT_FOUND = -32004,
  HASH_MISMATCH = -32005,
  APPROVER_NOT_QUALIFIED = -32006,
  TRUST_LEVEL_INSUFFICIENT = -32007,
  WORKFLOW_DEPTH_EXCEEDED = -32008,
  RATE_LIMIT_EXCEEDED = -32009,
  ATTESTATION_FAILED = -32010,
}

/**
 * HTTP status codes mapped to error codes.
 */
export const ERROR_CODE_HTTP_STATUS: Record<Ha2haErrorCode, number> = {
  [Ha2haErrorCode.APPROVAL_EXPIRED]: 410,
  [Ha2haErrorCode.TASK_ALREADY_REJECTED]: 409,
  [Ha2haErrorCode.TASK_ALREADY_APPROVED]: 409,
  [Ha2haErrorCode.TASK_NOT_FOUND]: 404,
  [Ha2haErrorCode.HASH_MISMATCH]: 400,
  [Ha2haErrorCode.APPROVER_NOT_QUALIFIED]: 403,
  [Ha2haErrorCode.TRUST_LEVEL_INSUFFICIENT]: 403,
  [Ha2haErrorCode.WORKFLOW_DEPTH_EXCEEDED]: 400,
  [Ha2haErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [Ha2haErrorCode.ATTESTATION_FAILED]: 401,
};

/**
 * JSON-RPC style error response.
 */
export interface Ha2haErrorResponse {
  error: {
    code: Ha2haErrorCode;
    message: string;
    data?: Record<string, unknown>;
  };
}

/**
 * Approve request body (§7.1).
 */
export interface ApproveRequestBody {
  taskId: string;
  approvedBy: string;
  approvalScope: 'single' | 'similar' | 'category';
  expiresAt?: string;
  payloadHash: string;
  approverSignature: string;
  conditions?: {
    maxCost?: number;
    allowedActions?: string[];
    custom?: Record<string, unknown>;
  };
}

/**
 * Approve response body.
 */
export interface ApproveResponseBody {
  taskId: string;
  status: 'approved';
  auditId: string;
  payloadHashVerified: boolean;
}

/**
 * Reject request body.
 */
export interface RejectRequestBody {
  taskId: string;
  rejectedBy: string;
  reason: string;
  trustAction: 'none' | 'reduce' | 'block';
  trustLevelNew?: number;
}

/**
 * Reject response body.
 */
export interface RejectResponseBody {
  taskId: string;
  status: 'rejected';
  auditId: string;
}

/**
 * Escalate request body.
 */
export interface EscalateRequestBody {
  type: 'task' | 'agent' | 'pattern';
  id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  requestedReviewer?: string;
}

/**
 * Escalate response body.
 */
export interface EscalateResponseBody {
  escalationId: string;
  status: 'escalated';
  auditId: string;
}

/**
 * Trust status response (GET /trust/:agentId).
 */
export interface TrustStatusResponse {
  agentId: string;
  trustLevel: number;
  trustLevelName: string;
  lastTransition: string;
  transitionReason: string;
  violationCount: number;
  cooldownExpires: string | null;
}

/**
 * Audit submit request body.
 */
export interface AuditSubmitRequest {
  entries: Array<{
    timestamp: string;
    eventType: string;
    taskId?: string;
    sourceAgentId: string;
    targetAgentId?: string;
    humanId?: string;
    trustLevel: number;
    outcome: string;
    hash: string;
    details?: Record<string, unknown>;
  }>;
}

/**
 * Audit submit response body.
 */
export interface AuditSubmitResponse {
  accepted: number;
  rejected: number;
  errors?: string[];
}

/**
 * Audit query parameters.
 */
export interface AuditQueryParams {
  taskId?: string;
  agentId?: string;
  eventType?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/**
 * Audit query response body.
 */
export interface AuditQueryResponse {
  entries: Array<{
    timestamp: string;
    eventType: string;
    taskId?: string;
    sourceAgentId: string;
    targetAgentId?: string;
    humanId?: string;
    trustLevel: number;
    outcome: string;
    hash: string;
  }>;
  total: number;
  hasMore: boolean;
}
