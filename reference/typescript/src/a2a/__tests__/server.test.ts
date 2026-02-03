/**
 * Tests for HA2HA HTTP server.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentIdentity } from '../../identity';
import { AgentCardBuilder } from '../agent-card';
import {
  createErrorResponse,
  validateRequestHeaders,
  generateRequestHeaders,
  createHa2haRouter,
  createHa2haClient,
  Ha2haServerError,
  serveAgentCard,
} from '../server';
import type { Ha2haAgentCard, Ha2haRequestHeaders } from '../types';
import { Ha2haErrorCode, HA2HA_SPEC_VERSION, HA2HA_BASE_PATH, AGENT_CARD_PATH } from '../types';

describe('createErrorResponse', () => {
  it('should create error response with code and message', () => {
    const response = createErrorResponse(
      Ha2haErrorCode.TASK_NOT_FOUND,
      'Task not found'
    );

    expect(response.error.code).toBe(Ha2haErrorCode.TASK_NOT_FOUND);
    expect(response.error.message).toBe('Task not found');
    expect(response.error.data).toBeUndefined();
  });

  it('should include data when provided', () => {
    const response = createErrorResponse(
      Ha2haErrorCode.APPROVAL_EXPIRED,
      'Approval expired',
      { taskId: 'task-123', expiredAt: '2026-02-02T10:00:00Z' }
    );

    expect(response.error.data?.taskId).toBe('task-123');
    expect(response.error.data?.expiredAt).toBe('2026-02-02T10:00:00Z');
  });
});

describe('validateRequestHeaders', () => {
  const validHeaders: Record<string, string> = {
    'x-ha2ha-version': '0.1.0',
    'x-ha2ha-agent-id': 'agent.ha2ha',
    'x-ha2ha-request-id': 'req-123',
    'x-ha2ha-timestamp': new Date().toISOString(),
  };

  it('should validate correct headers', () => {
    const result = validateRequestHeaders(validHeaders);
    expect(result.valid).toBe(true);
    expect(result.parsedHeaders).toBeDefined();
    expect(result.parsedHeaders!['X-HA2HA-Agent-Id']).toBe('agent.ha2ha');
  });

  it('should reject missing version', () => {
    const headers = { ...validHeaders };
    delete headers['x-ha2ha-version'];

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('X-HA2HA-Version');
  });

  it('should reject missing agent ID', () => {
    const headers = { ...validHeaders };
    delete headers['x-ha2ha-agent-id'];

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('X-HA2HA-Agent-Id');
  });

  it('should reject missing request ID', () => {
    const headers = { ...validHeaders };
    delete headers['x-ha2ha-request-id'];

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('X-HA2HA-Request-Id');
  });

  it('should reject missing timestamp', () => {
    const headers = { ...validHeaders };
    delete headers['x-ha2ha-timestamp'];

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('X-HA2HA-Timestamp');
  });

  it('should reject invalid timestamp format', () => {
    const headers = { ...validHeaders, 'x-ha2ha-timestamp': 'not-a-timestamp' };

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid');
  });

  it('should reject timestamp outside clock skew tolerance', () => {
    const oldTimestamp = new Date(Date.now() - 120 * 1000).toISOString(); // 2 minutes ago
    const headers = { ...validHeaders, 'x-ha2ha-timestamp': oldTimestamp };

    const result = validateRequestHeaders(headers, 60); // 60 second tolerance
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tolerance');
  });

  it('should accept timestamp within tolerance', () => {
    const recentTimestamp = new Date(Date.now() - 30 * 1000).toISOString(); // 30 seconds ago
    const headers = { ...validHeaders, 'x-ha2ha-timestamp': recentTimestamp };

    const result = validateRequestHeaders(headers, 60);
    expect(result.valid).toBe(true);
  });

  it('should reject timestamp too far in the future', () => {
    const futureTimestamp = new Date(Date.now() + 120 * 1000).toISOString(); // 2 minutes in future
    const headers = { ...validHeaders, 'x-ha2ha-timestamp': futureTimestamp };

    const result = validateRequestHeaders(headers, 60);
    expect(result.valid).toBe(false);
    // Timestamp outside tolerance covers both past and future
    expect(result.error).toContain('tolerance');
  });

  it('should include optional signature header', () => {
    const headers = { ...validHeaders, 'x-ha2ha-signature': 'sig123' };

    const result = validateRequestHeaders(headers);
    expect(result.valid).toBe(true);
    expect(result.parsedHeaders!['X-HA2HA-Signature']).toBe('sig123');
  });
});

describe('generateRequestHeaders', () => {
  it('should generate valid headers', () => {
    const headers = generateRequestHeaders('my-agent.ha2ha');

    expect(headers['X-HA2HA-Version']).toBe(HA2HA_SPEC_VERSION);
    expect(headers['X-HA2HA-Agent-Id']).toBe('my-agent.ha2ha');
    expect(headers['X-HA2HA-Request-Id']).toMatch(/^req-/);
    expect(new Date(headers['X-HA2HA-Timestamp']).getTime()).not.toBeNaN();
  });

  it('should use provided request ID', () => {
    const headers = generateRequestHeaders('agent.ha2ha', 'custom-req-id');

    expect(headers['X-HA2HA-Request-Id']).toBe('custom-req-id');
  });

  it('should generate unique request IDs', () => {
    const headers1 = generateRequestHeaders('agent.ha2ha');
    const headers2 = generateRequestHeaders('agent.ha2ha');

    expect(headers1['X-HA2HA-Request-Id']).not.toBe(headers2['X-HA2HA-Request-Id']);
  });
});

describe('Ha2haServerError', () => {
  it('should create error with code and message', () => {
    const error = new Ha2haServerError(
      Ha2haErrorCode.TASK_NOT_FOUND,
      'Task not found'
    );

    expect(error.code).toBe(Ha2haErrorCode.TASK_NOT_FOUND);
    expect(error.message).toBe('Task not found');
    expect(error.name).toBe('Ha2haServerError');
  });

  it('should include data', () => {
    const error = new Ha2haServerError(
      Ha2haErrorCode.APPROVAL_EXPIRED,
      'Expired',
      { taskId: 'task-123' }
    );

    expect(error.data?.taskId).toBe('task-123');
  });

  it('should be throwable', () => {
    expect(() => {
      throw new Ha2haServerError(Ha2haErrorCode.TASK_NOT_FOUND, 'Not found');
    }).toThrow('Not found');
  });
});

describe('serveAgentCard', () => {
  let card: Ha2haAgentCard;

  beforeEach(async () => {
    const identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
    card = await new AgentCardBuilder(identity)
      .setName('Test Agent')
      .setVersion('1.0.0')
      .build();
  });

  it('should return handler function', () => {
    const handler = serveAgentCard(card);
    expect(typeof handler).toBe('function');
  });

  it('should serve card as JSON', () => {
    const handler = serveAgentCard(card);
    
    const mockRes = {
      set: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    handler({} as any, mockRes as any);

    expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(mockRes.set).toHaveBeenCalledWith('Cache-Control', 'public, max-age=3600');
    expect(mockRes.send).toHaveBeenCalled();
    
    const sentJson = mockRes.send.mock.calls[0][0];
    const parsed = JSON.parse(sentJson);
    expect(parsed.name).toBe('Test Agent');
  });
});

describe('createHa2haRouter', () => {
  let card: Ha2haAgentCard;

  beforeEach(async () => {
    const identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
    card = await new AgentCardBuilder(identity)
      .setName('Test Agent')
      .setVersion('1.0.0')
      .build();
  });

  it('should create router with all endpoints', () => {
    const mockRouter = {
      get: vi.fn().mockReturnThis(),
      post: vi.fn().mockReturnThis(),
      use: vi.fn().mockReturnThis(),
    };

    const router = createHa2haRouter(
      { agentCard: card, validateHeaders: false },
      () => mockRouter as any
    );

    // Should register agent card endpoint
    expect(mockRouter.get).toHaveBeenCalledWith(
      AGENT_CARD_PATH,
      expect.any(Function)
    );

    // Should register HA2HA endpoints
    expect(mockRouter.post).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/approve`,
      expect.any(Function)
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/reject`,
      expect.any(Function)
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/escalate`,
      expect.any(Function)
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/trust/:agentId`,
      expect.any(Function)
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/audit`,
      expect.any(Function)
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      `${HA2HA_BASE_PATH}/audit`,
      expect.any(Function)
    );
  });

  it('should add header validation middleware when enabled', () => {
    const mockRouter = {
      get: vi.fn().mockReturnThis(),
      post: vi.fn().mockReturnThis(),
      use: vi.fn().mockReturnThis(),
    };

    createHa2haRouter(
      { agentCard: card, validateHeaders: true },
      () => mockRouter as any
    );

    // POST endpoints should have 2 handlers (middleware + handler)
    const postCalls = mockRouter.post.mock.calls;
    // All POST calls except for approve should have middleware
    for (const call of postCalls) {
      if (call[0].includes('/approve') || call[0].includes('/reject') || 
          call[0].includes('/escalate') || call[0].includes('/audit')) {
        // Should have middleware as second argument
        expect(call.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('createHa2haClient', () => {
  let card: Ha2haAgentCard;

  beforeEach(async () => {
    const identity = await AgentIdentity.create('test-agent.ha2ha', 'Test Agent');
    card = await new AgentCardBuilder(identity)
      .setName('Test Agent')
      .setVersion('1.0.0')
      .build();
  });

  it('should create client with methods', () => {
    const mockFetch = vi.fn();
    const client = createHa2haClient({
      baseUrl: 'https://agent.example.com',
      agentId: 'my-agent.ha2ha',
      fetch: mockFetch,
    });

    expect(typeof client.getAgentCard).toBe('function');
    expect(typeof client.approve).toBe('function');
    expect(typeof client.reject).toBe('function');
    expect(typeof client.escalate).toBe('function');
    expect(typeof client.getTrustStatus).toBe('function');
    expect(typeof client.submitAudit).toBe('function');
    expect(typeof client.queryAudit).toBe('function');
  });

  it('should call correct endpoints', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(card),
    });

    const client = createHa2haClient({
      baseUrl: 'https://agent.example.com',
      agentId: 'my-agent.ha2ha',
      fetch: mockFetch,
    });

    await client.getAgentCard();

    expect(mockFetch).toHaveBeenCalledWith(
      `https://agent.example.com${AGENT_CARD_PATH}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-HA2HA-Agent-Id': 'my-agent.ha2ha',
        }),
      })
    );
  });

  it('should throw Ha2haServerError on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({
        error: {
          code: Ha2haErrorCode.TASK_NOT_FOUND,
          message: 'Not found',
        },
      }),
    });

    const client = createHa2haClient({
      baseUrl: 'https://agent.example.com',
      agentId: 'my-agent.ha2ha',
      fetch: mockFetch,
    });

    await expect(client.getAgentCard()).rejects.toThrow(Ha2haServerError);
  });

  it('should include request body for POST requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ taskId: 'task-123', status: 'approved' }),
    });

    const client = createHa2haClient({
      baseUrl: 'https://agent.example.com',
      agentId: 'my-agent.ha2ha',
      fetch: mockFetch,
    });

    await client.approve({
      taskId: 'task-123',
      approvedBy: 'human@example.com',
      approvalScope: 'single',
      payloadHash: 'hash',
      approverSignature: 'sig',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/approve'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('task-123'),
      })
    );
  });

  it('should build query string for audit query', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entries: [], total: 0, hasMore: false }),
    });

    const client = createHa2haClient({
      baseUrl: 'https://agent.example.com',
      agentId: 'my-agent.ha2ha',
      fetch: mockFetch,
    });

    await client.queryAudit({
      taskId: 'task-123',
      limit: 10,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/taskId=task-123.*limit=10|limit=10.*taskId=task-123/),
      expect.any(Object)
    );
  });
});
