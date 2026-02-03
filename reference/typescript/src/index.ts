/**
 * HA2HA Protocol Reference Implementation
 * 
 * This package provides a TypeScript reference implementation of the HA2HA
 * (Human/Agent to Human/Agent) protocol for AI agent federation with human oversight.
 * 
 * @see https://ha2haproject.org
 * @license Apache-2.0
 */

// Re-export onboarding module (profile management)
export * from './onboarding';

// Re-export identity module (cryptographic identity)
export * from './identity';

// Re-export trust module with namespace to avoid conflicts
// Trust module has its own TrustLevel enum distinct from onboarding
export {
  TrustLevel,
  TrustEntry,
  TrustRegistry,
  ViolationSeverity,
  TransitionReason,
  TRUST_LEVEL_NAMES as TRUST_REGISTRY_LEVEL_NAMES,
  COOLDOWN_PERIODS,
  type TrustContext,
  type TrustEntryData,
  type TrustHistoryEntry,
} from './trust';

// Re-export approval module (human approval workflow)
export {
  // Types
  TaskState,
  ApprovalScope,
  ApprovalError,
  type PendingTaskData,
  type ApprovalRequestData,
  type ApprovalConditions,
  type RejectionData,
  type ApprovalResult,
  type RejectionResult,
  DEFAULT_TASK_TIMEOUT_MS,
  DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS,
  // Classes
  PendingTask,
  ApprovalRequest,
  ApprovalQueue,
  ApprovalValidator,
  TaskLifecycle,
  // Functions
  computePayloadHash,
  verifyPayloadHash,
  getCanonicalJson,
  createApprovalMessage,
  createRejectionMessage,
  createValidator,
  createTaskLifecycle,
  assertApprovalRequired,
  getDefaultQueueStorePath,
  // CLI
  runCli,
  parseArgs,
  formatTask,
  formatTaskTable,
  type CliConfig,
  type CliResult,
  type CreateTaskOptions,
  type CreateApprovalOptions,
  type ValidatorConfig,
  type ApprovalQueueConfig,
  type TaskLifecycleConfig,
  type SubmitResult,
  type ExecuteResult,
} from './approval';

// Re-export circuit breaker module for cascading failure prevention
export {
  CircuitState,
  CircuitBreaker,
  CircuitBreakerRegistry,
  WorkflowDepthTracker,
  WorkflowDepthExceededError,
  CIRCUIT_STATE_NAMES,
  DEFAULT_CIRCUIT_CONFIG,
  type CircuitBreakerConfig,
  type CircuitBreakerStatus,
  type CircuitCheckResult,
  type CircuitStateChangeEvent,
  type Ha2haTaskMetadata as CircuitBreakerTaskMetadata,
  type DepthCheckResult,
} from './circuit-breaker';

// Re-export profile enforcement module (§10 Human Onboarding runtime enforcement)
export {
  // Types
  type EnforcementResult,
  type FatigueStatus,
  type AvailabilityStatus,
  type PreTrustResult,
  type ProfileEnforcerConfig,
  type AvailabilityCheckOptions,
  type PreTrustResolveOptions,
  type ApprovalRecord,
  type WakingHoursConfig,
  DEFAULT_WAKING_HOURS,
  type ProfileEnforcementEvent,
  // Classes
  AvailabilityChecker,
  FatigueTracker,
  PreTrustResolver,
  ProfileEnforcer,
  // Factory functions
  createFatigueTracker,
  createPreTrustResolver,
  createProfileEnforcer,
  type FatigueTrackerConfig,
  type EnforcementEventCallback,
} from './profile';

// Re-export audit module (§8.9 Audit Log Integrity)
export {
  // Types
  AuditEventType,
  type AuditOutcome,
  type AuditEntry,
  type AuditEntryData,
  type AuditEntryInput,
  type ChainVerificationResult,
  type AuditQueryOptions,
  type AuditQueryResult,
  type AuditChainConfig,
  DEFAULT_AUDIT_CONFIG,
  EVENT_TYPE_NAMES,
  // Classes
  AuditChain,
  ChainCorruptedError,
  AuditQueryBuilder,
  // Entry functions
  createAuditEntry,
  createGenesisEntry,
  computeEntryHash,
  recomputeEntryHash,
  verifyEntryHash,
  verifyEntryLink,
  serializeEntry,
  deserializeEntry,
  summarizeEntry,
  compareEntries,
  // Chain functions
  createAuditChain,
  getDefaultAuditPath,
  // Verifier functions
  verifyChain,
  verifyEntry,
  verifyLink,
  detectTamperPoint,
  verifyRange,
  formatVerificationReport,
  getChainStats,
  // Query functions
  queryAuditLog,
  getTaskHistory,
  getAgentHistory,
  getHumanHistory,
  getEntriesInRange,
  getRecentEntries,
  countByEventType,
  countByOutcome,
  groupByDate,
  getSecurityEvents,
  getTrustEvents,
  searchDetails,
  createQueryBuilder,
} from './audit';

// Re-export A2A module (§4 A2A Integration, Appendix B HTTP Transport)
export {
  // Types
  type A2AExtension,
  type A2ACapabilities,
  type A2AAgentCard,
  type Ha2haExtensionParams,
  type Ha2haAgentMetadata,
  type Ha2haExtensions,
  type Ha2haAgentCard,
  type Ha2haTaskMetadata,
  type Ha2haTrustContext,
  type NegotiationResult,
  type ExtensionPresence,
  type ParamValidationResult,
  type Ha2haRequestHeaders,
  type Ha2haErrorResponse,
  type ApproveRequestBody,
  type ApproveResponseBody,
  type RejectRequestBody,
  type RejectResponseBody,
  type EscalateRequestBody,
  type EscalateResponseBody,
  type TrustStatusResponse,
  type AuditSubmitRequest,
  type AuditSubmitResponse,
  type AuditQueryParams,
  type AuditQueryResponse,
  type AgentCardConfig,
  type CapabilityNegotiationResult,
  type CreateTaskMetadataOptions,
  type CreateTrustContextOptions,
  type ServerCallbacks,
  type Ha2haServerConfig,
  type Ha2haClientConfig,
  // Constants
  HA2HA_EXTENSION_URI,
  HA2HA_SPEC_VERSION,
  HA2HA_BASE_PATH,
  AGENT_CARD_PATH,
  Ha2haErrorCode,
  ERROR_CODE_HTTP_STATUS,
  // Extension
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
  // Agent Card
  AgentCardBuilder,
  createAgentCard,
  verifyAgentCard,
  getAgentIdFromCard,
  serializeAgentCard,
  parseAgentCard,
  // Negotiation
  negotiate,
  negotiateVersion,
  checkVersionCompatibility,
  getSupportedVersions,
  negotiateTrustLevel,
  meetsTrustRequirement,
  negotiateCapabilities,
  // Task Metadata
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
  // Server
  createErrorResponse,
  sendError,
  validateRequestHeaders,
  createHeaderValidationMiddleware,
  createHa2haRouter,
  Ha2haServerError,
  serveAgentCard,
  generateRequestHeaders,
  createHa2haClient,
} from './a2a';
