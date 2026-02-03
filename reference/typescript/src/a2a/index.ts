/**
 * HA2HA A2A Protocol Integration Module
 * 
 * Implements A2A Agent Card extensions, HTTP transport binding, and
 * federation negotiation per HA2HA Specification §4 and Appendix B.
 * 
 * @example
 * ```typescript
 * import {
 *   AgentCardBuilder,
 *   createHa2haExtension,
 *   negotiate,
 *   createHa2haRouter,
 *   createTaskMetadata,
 * } from '@ha2ha/reference/a2a';
 * import { AgentIdentity } from '@ha2ha/reference/identity';
 * 
 * // Create agent identity
 * const identity = await AgentIdentity.loadOrCreate('./identity', 'my-agent', 'My Agent');
 * 
 * // Build signed Agent Card
 * const card = await new AgentCardBuilder(identity)
 *   .setName('My Agent')
 *   .setVersion('1.0.0')
 *   .setUrl('https://my-agent.example.com')
 *   .addHa2haExtension({
 *     trustLevelRequired: 2,
 *     auditEndpoint: '/.well-known/ha2ha/v1/audit',
 *   })
 *   .build();
 * 
 * // Negotiate with peer
 * const result = negotiate(card, peerCard);
 * if (result.compatible) {
 *   console.log('Compatible! Using version:', result.effectiveVersion);
 * }
 * 
 * // Create task metadata
 * const metadata = createTaskMetadata({
 *   requestingAgent: identity.agentId,
 *   requestingHuman: 'ricardo@example.com',
 *   trustLevel: 3,
 * });
 * ```
 * 
 * @packageDocumentation
 */

// Types
export type {
  // A2A Core Types
  A2AExtension,
  A2ACapabilities,
  A2AAgentCard,
  // HA2HA Extension Types
  Ha2haExtensionParams,
  Ha2haAgentMetadata,
  Ha2haExtensions,
  Ha2haAgentCard,
  // Task Metadata Types
  Ha2haTaskMetadata,
  Ha2haTrustContext,
  // Negotiation Types
  NegotiationResult,
  ExtensionPresence,
  ParamValidationResult,
  // HTTP Transport Types
  Ha2haRequestHeaders,
  Ha2haErrorResponse,
  ApproveRequestBody,
  ApproveResponseBody,
  RejectRequestBody,
  RejectResponseBody,
  EscalateRequestBody,
  EscalateResponseBody,
  TrustStatusResponse,
  AuditSubmitRequest,
  AuditSubmitResponse,
  AuditQueryParams,
  AuditQueryResponse,
} from './types';

// Constants
export {
  HA2HA_EXTENSION_URI,
  HA2HA_SPEC_VERSION,
  HA2HA_BASE_PATH,
  AGENT_CARD_PATH,
  Ha2haErrorCode,
  ERROR_CODE_HTTP_STATUS,
} from './types';

// Extension module
export {
  DEFAULT_EXTENSION_PARAMS,
  createHa2haExtension,
  validateExtensionParams,
  checkExtensionPresence,
  extractHa2haExtension,
  extractExtensionParams,
  getMajorVersionFromUri,
  buildExtensionUri,
  parseVersion,
  compareVersions,
} from './extension';

// Agent Card module
export {
  AgentCardBuilder,
  createAgentCard,
  verifyAgentCard,
  getAgentIdFromCard,
  serializeAgentCard,
  parseAgentCard,
} from './agent-card';
export type { AgentCardConfig } from './agent-card';

// Negotiation module
export {
  negotiate,
  negotiateVersion,
  checkVersionCompatibility,
  getSupportedVersions,
  negotiateTrustLevel,
  meetsTrustRequirement,
  negotiateCapabilities,
} from './negotiation';
export type { CapabilityNegotiationResult } from './negotiation';

// Task Metadata module
export {
  DEFAULT_APPROVAL_TIMEOUT,
  TRUST_LEVEL_NAMES,
  createTaskMetadata,
  createTrustContext,
  validateTaskMetadata,
  validateTrustContext,
  extractHa2haMetadata,
  extractTrustContext,
  injectMetadata,
  injectMetadataWithTrust,
  parseDurationToMs,
  msToDuration,
  isApprovalTimedOut,
  calculateApprovalExpiry,
} from './task-metadata';
export type {
  CreateTaskMetadataOptions,
  CreateTrustContextOptions,
} from './task-metadata';

// Server module
export {
  createErrorResponse,
  sendError,
  validateRequestHeaders,
  createHeaderValidationMiddleware,
  createHa2haRouter,
  Ha2haServerError,
  serveAgentCard,
  generateRequestHeaders,
  createHa2haClient,
} from './server';
export type {
  Request,
  Response,
  NextFunction,
  Router,
  Express,
  ServerCallbacks,
  Ha2haServerConfig,
  Ha2haClientConfig,
} from './server';
