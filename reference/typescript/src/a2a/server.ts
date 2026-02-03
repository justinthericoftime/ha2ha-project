/**
 * HA2HA HTTP Server
 * 
 * Express-based HTTP endpoints for HA2HA protocol operations.
 * Implements HA2HA Specification Appendix B (HTTP Transport Binding).
 * 
 * @example
 * ```typescript
 * import { createHa2haServer, serveAgentCard } from '@ha2ha/reference/a2a';
 * import { TaskLifecycle } from '@ha2ha/reference/approval';
 * import { AuditChain } from '@ha2ha/reference/audit';
 * 
 * const app = createHa2haServer({
 *   agentCard: mySignedCard,
 *   taskLifecycle: myLifecycle,
 *   auditChain: myAuditChain,
 * });
 * 
 * app.listen(3000, () => {
 *   console.log('HA2HA server running on port 3000');
 * });
 * ```
 */

import type {
  Ha2haAgentCard,
  Ha2haRequestHeaders,
  Ha2haErrorCode,
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
import {
  HA2HA_BASE_PATH,
  AGENT_CARD_PATH,
  HA2HA_SPEC_VERSION,
  ERROR_CODE_HTTP_STATUS,
  Ha2haErrorCode as ErrorCode,
} from './types';
import { serializeAgentCard } from './agent-card';

// Type definitions for express-like interfaces
// This allows the module to work without requiring express as a hard dependency

export interface Request {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  method: string;
  path: string;
}

export interface Response {
  status(code: number): Response;
  json(body: unknown): Response;
  set(header: string, value: string): Response;
  send(body?: string | Buffer): Response;
}

export interface NextFunction {
  (err?: unknown): void;
}

export interface Router {
  get(path: string, ...handlers: Array<(req: Request, res: Response, next: NextFunction) => void>): Router;
  post(path: string, ...handlers: Array<(req: Request, res: Response, next: NextFunction) => void>): Router;
  use(handler: (req: Request, res: Response, next: NextFunction) => void): Router;
  use(path: string, handler: (req: Request, res: Response, next: NextFunction) => void): Router;
}

export interface Express extends Router {
  listen(port: number, callback?: () => void): unknown;
}

/**
 * Callback interfaces for server operations.
 */
export interface ServerCallbacks {
  /** Called when an approve request is received */
  onApprove?: (req: ApproveRequestBody) => Promise<ApproveResponseBody>;
  /** Called when a reject request is received */
  onReject?: (req: RejectRequestBody) => Promise<RejectResponseBody>;
  /** Called when an escalate request is received */
  onEscalate?: (req: EscalateRequestBody) => Promise<EscalateResponseBody>;
  /** Called to get trust status for an agent */
  getTrustStatus?: (agentId: string) => Promise<TrustStatusResponse | null>;
  /** Called when audit entries are submitted */
  onAuditSubmit?: (req: AuditSubmitRequest) => Promise<AuditSubmitResponse>;
  /** Called when audit is queried */
  onAuditQuery?: (params: AuditQueryParams) => Promise<AuditQueryResponse>;
}

/**
 * Configuration for the HA2HA server.
 */
export interface Ha2haServerConfig {
  /** The signed Agent Card to serve */
  agentCard: Ha2haAgentCard;
  /** Operation callbacks */
  callbacks?: ServerCallbacks;
  /** Whether to validate request headers (default: true) */
  validateHeaders?: boolean;
  /** Clock skew tolerance in seconds (default: 60) */
  clockSkewTolerance?: number;
}

/**
 * Create an HA2HA error response.
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  data?: Record<string, unknown>
): Ha2haErrorResponse {
  return {
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * Send an error response with appropriate HTTP status.
 */
export function sendError(
  res: Response,
  code: ErrorCode,
  message: string,
  data?: Record<string, unknown>
): Response {
  const httpStatus = ERROR_CODE_HTTP_STATUS[code] ?? 500;
  return res.status(httpStatus).json(createErrorResponse(code, message, data));
}

/**
 * Validate HA2HA request headers.
 * 
 * @param headers - Request headers
 * @param clockSkewTolerance - Allowed clock skew in seconds
 * @returns Validation result
 */
export function validateRequestHeaders(
  headers: Record<string, string | string[] | undefined>,
  clockSkewTolerance: number = 60
): { valid: boolean; error?: string; parsedHeaders?: Ha2haRequestHeaders } {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name.toLowerCase()] ?? headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const version = getHeader('X-HA2HA-Version');
  const agentId = getHeader('X-HA2HA-Agent-Id');
  const requestId = getHeader('X-HA2HA-Request-Id');
  const timestamp = getHeader('X-HA2HA-Timestamp');

  if (!version) {
    return { valid: false, error: 'Missing X-HA2HA-Version header' };
  }
  if (!agentId) {
    return { valid: false, error: 'Missing X-HA2HA-Agent-Id header' };
  }
  if (!requestId) {
    return { valid: false, error: 'Missing X-HA2HA-Request-Id header' };
  }
  if (!timestamp) {
    return { valid: false, error: 'Missing X-HA2HA-Timestamp header' };
  }

  // Validate timestamp is within clock skew tolerance
  const requestTime = new Date(timestamp);
  if (isNaN(requestTime.getTime())) {
    return { valid: false, error: 'Invalid X-HA2HA-Timestamp format' };
  }

  const now = new Date();
  const skew = Math.abs(now.getTime() - requestTime.getTime()) / 1000;
  if (skew > clockSkewTolerance) {
    return { 
      valid: false, 
      error: `Timestamp outside tolerance: ${skew}s > ${clockSkewTolerance}s` 
    };
  }

  // Reject timestamps in the future (beyond tolerance)
  if (requestTime.getTime() > now.getTime() + clockSkewTolerance * 1000) {
    return { valid: false, error: 'Timestamp in the future' };
  }

  return {
    valid: true,
    parsedHeaders: {
      'X-HA2HA-Version': version,
      'X-HA2HA-Agent-Id': agentId,
      'X-HA2HA-Request-Id': requestId,
      'X-HA2HA-Timestamp': timestamp,
      'X-HA2HA-Signature': getHeader('X-HA2HA-Signature'),
    },
  };
}

/**
 * Create middleware for header validation.
 */
export function createHeaderValidationMiddleware(
  clockSkewTolerance: number = 60
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const validation = validateRequestHeaders(req.headers, clockSkewTolerance);
    if (!validation.valid) {
      sendError(res, ErrorCode.ATTESTATION_FAILED, validation.error!);
      return;
    }
    next();
  };
}

/**
 * Create HA2HA router with all endpoints.
 * 
 * @param config - Server configuration
 * @param routerFactory - Factory function to create a router (e.g., express.Router)
 * @returns Configured router
 */
export function createHa2haRouter(
  config: Ha2haServerConfig,
  routerFactory: () => Router
): Router {
  const router = routerFactory();
  const { agentCard, callbacks = {}, validateHeaders = true, clockSkewTolerance = 60 } = config;

  // Header validation middleware for protected routes
  const validateHeadersMiddleware = createHeaderValidationMiddleware(clockSkewTolerance);

  // GET /.well-known/agent.json - Serve Agent Card
  router.get(AGENT_CARD_PATH, (req: Request, res: Response) => {
    res
      .set('Content-Type', 'application/json')
      .set('Cache-Control', 'public, max-age=3600')
      .send(serializeAgentCard(agentCard));
  });

  // POST /.well-known/ha2ha/v1/approve
  router.post(
    `${HA2HA_BASE_PATH}/approve`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.onApprove) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Approve endpoint not implemented');
        return;
      }

      try {
        const body = req.body as ApproveRequestBody;
        const result = await callbacks.onApprove(body);
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  // POST /.well-known/ha2ha/v1/reject
  router.post(
    `${HA2HA_BASE_PATH}/reject`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.onReject) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Reject endpoint not implemented');
        return;
      }

      try {
        const body = req.body as RejectRequestBody;
        const result = await callbacks.onReject(body);
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  // POST /.well-known/ha2ha/v1/escalate
  router.post(
    `${HA2HA_BASE_PATH}/escalate`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.onEscalate) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Escalate endpoint not implemented');
        return;
      }

      try {
        const body = req.body as EscalateRequestBody;
        const result = await callbacks.onEscalate(body);
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  // GET /.well-known/ha2ha/v1/trust/:agentId
  router.get(
    `${HA2HA_BASE_PATH}/trust/:agentId`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.getTrustStatus) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Trust endpoint not implemented');
        return;
      }

      try {
        const agentId = req.params.agentId;
        const result = await callbacks.getTrustStatus(agentId);
        if (!result) {
          sendError(res, ErrorCode.TASK_NOT_FOUND, `Agent not found: ${agentId}`);
          return;
        }
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  // POST /.well-known/ha2ha/v1/audit
  router.post(
    `${HA2HA_BASE_PATH}/audit`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.onAuditSubmit) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Audit submit endpoint not implemented');
        return;
      }

      try {
        const body = req.body as AuditSubmitRequest;
        const result = await callbacks.onAuditSubmit(body);
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  // GET /.well-known/ha2ha/v1/audit
  router.get(
    `${HA2HA_BASE_PATH}/audit`,
    ...(validateHeaders ? [validateHeadersMiddleware] : []),
    async (req: Request, res: Response) => {
      if (!callbacks.onAuditQuery) {
        sendError(res, ErrorCode.TASK_NOT_FOUND, 'Audit query endpoint not implemented');
        return;
      }

      try {
        const params: AuditQueryParams = {
          taskId: req.query.taskId as string | undefined,
          agentId: req.query.agentId as string | undefined,
          eventType: req.query.eventType as string | undefined,
          from: req.query.from as string | undefined,
          to: req.query.to as string | undefined,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        };
        const result = await callbacks.onAuditQuery(params);
        res.status(200).json(result);
      } catch (error) {
        handleCallbackError(res, error);
      }
    }
  );

  return router;
}

/**
 * Handle errors from callbacks.
 */
function handleCallbackError(res: Response, error: unknown): void {
  if (error instanceof Ha2haServerError) {
    sendError(res, error.code, error.message, error.data);
    return;
  }

  const message = error instanceof Error ? error.message : 'Internal server error';
  res.status(500).json(createErrorResponse(-32000 as ErrorCode, message));
}

/**
 * Custom error class for HA2HA server errors.
 */
export class Ha2haServerError extends Error {
  code: ErrorCode;
  data?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'Ha2haServerError';
    this.code = code;
    this.data = data;
  }
}

/**
 * Serve just the Agent Card endpoint.
 * Useful for minimal deployments.
 * 
 * @param agentCard - The signed Agent Card
 * @returns Express-compatible request handler
 */
export function serveAgentCard(
  agentCard: Ha2haAgentCard
): (req: Request, res: Response) => void {
  const cardJson = serializeAgentCard(agentCard);
  
  return (req: Request, res: Response) => {
    res
      .set('Content-Type', 'application/json')
      .set('Cache-Control', 'public, max-age=3600')
      .send(cardJson);
  };
}

/**
 * Generate request headers for HA2HA requests.
 * 
 * @param agentId - The requesting agent's ID
 * @param requestId - Unique request ID (auto-generated if not provided)
 * @returns Headers object
 */
export function generateRequestHeaders(
  agentId: string,
  requestId?: string
): Ha2haRequestHeaders {
  return {
    'X-HA2HA-Version': HA2HA_SPEC_VERSION,
    'X-HA2HA-Agent-Id': agentId,
    'X-HA2HA-Request-Id': requestId ?? generateRequestId(),
    'X-HA2HA-Timestamp': new Date().toISOString(),
  };
}

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
  const hex = '0123456789abcdef';
  let id = 'req-';
  for (let i = 0; i < 16; i++) {
    id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}

/**
 * HTTP client helper for making HA2HA requests.
 */
export interface Ha2haClientConfig {
  /** Base URL of the target agent */
  baseUrl: string;
  /** Our agent ID */
  agentId: string;
  /** Optional fetch implementation (for testing or Node.js) */
  fetch?: typeof globalThis.fetch;
}

/**
 * Create an HA2HA HTTP client.
 * 
 * @param config - Client configuration
 * @returns Client object with request methods
 */
export function createHa2haClient(config: Ha2haClientConfig) {
  const { baseUrl, agentId, fetch: fetchFn = globalThis.fetch } = config;

  const makeRequest = async <T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> => {
    const headers = generateRequestHeaders(agentId);
    const url = `${baseUrl}${path}`;

    const response = await fetchFn(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as T | Ha2haErrorResponse;

    if (!response.ok) {
      const errorResponse = data as Ha2haErrorResponse;
      throw new Ha2haServerError(
        errorResponse.error.code,
        errorResponse.error.message,
        errorResponse.error.data
      );
    }

    return data as T;
  };

  return {
    /**
     * Fetch the agent's card.
     */
    async getAgentCard(): Promise<Ha2haAgentCard> {
      return makeRequest('GET', AGENT_CARD_PATH);
    },

    /**
     * Submit an approval.
     */
    async approve(body: ApproveRequestBody): Promise<ApproveResponseBody> {
      return makeRequest('POST', `${HA2HA_BASE_PATH}/approve`, body);
    },

    /**
     * Submit a rejection.
     */
    async reject(body: RejectRequestBody): Promise<RejectResponseBody> {
      return makeRequest('POST', `${HA2HA_BASE_PATH}/reject`, body);
    },

    /**
     * Submit an escalation.
     */
    async escalate(body: EscalateRequestBody): Promise<EscalateResponseBody> {
      return makeRequest('POST', `${HA2HA_BASE_PATH}/escalate`, body);
    },

    /**
     * Get trust status for an agent.
     */
    async getTrustStatus(targetAgentId: string): Promise<TrustStatusResponse> {
      return makeRequest('GET', `${HA2HA_BASE_PATH}/trust/${encodeURIComponent(targetAgentId)}`);
    },

    /**
     * Submit audit entries.
     */
    async submitAudit(body: AuditSubmitRequest): Promise<AuditSubmitResponse> {
      return makeRequest('POST', `${HA2HA_BASE_PATH}/audit`, body);
    },

    /**
     * Query audit log.
     */
    async queryAudit(params: AuditQueryParams): Promise<AuditQueryResponse> {
      const queryString = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join('&');
      const path = queryString ? `${HA2HA_BASE_PATH}/audit?${queryString}` : `${HA2HA_BASE_PATH}/audit`;
      return makeRequest('GET', path);
    },
  };
}
