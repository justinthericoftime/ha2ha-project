/**
 * Approval Request
 * 
 * Represents a human approval for a pending task.
 * Includes cryptographic commitment via hash and signature.
 */

import {
  ApprovalRequestData,
  ApprovalScope,
  ApprovalConditions,
  DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS,
} from './types';
import { createApprovalMessage } from './hash';
import { Signer, AgentIdentity } from '../identity';

/**
 * Options for creating an approval request.
 */
export interface CreateApprovalOptions {
  /** Task ID being approved */
  taskId: string;
  /** Identity of the approver */
  approverIdentity: AgentIdentity;
  /** SHA-256 hash of the payload being approved */
  payloadHash: string;
  /** Scope of approval */
  scope?: ApprovalScope;
  /** Optional conditions on the approval */
  conditions?: ApprovalConditions;
  /** Custom expiry time for SIMILAR scope (ISO 8601) */
  expiresAt?: string;
}

/**
 * A human approval for a pending task.
 */
export class ApprovalRequest {
  private data: ApprovalRequestData;

  /**
   * Create an ApprovalRequest from existing data.
   * Use ApprovalRequest.create() for new approvals.
   */
  constructor(data: ApprovalRequestData) {
    this.data = { ...data };
  }

  /**
   * Create a new approval request with cryptographic signature.
   * 
   * @param options - Approval creation options
   * @returns Promise resolving to new ApprovalRequest
   * 
   * @example
   * ```typescript
   * const approval = await ApprovalRequest.create({
   *   taskId: 'abc-123',
   *   approverIdentity: humanIdentity,
   *   payloadHash: task.payloadHash,
   *   scope: ApprovalScope.SINGLE,
   * });
   * ```
   */
  static async create(options: CreateApprovalOptions): Promise<ApprovalRequest> {
    const scope = options.scope ?? ApprovalScope.SINGLE;
    const now = new Date();

    // Calculate expiry for SIMILAR scope
    let expiresAt: string | undefined;
    if (scope === ApprovalScope.SIMILAR) {
      if (options.expiresAt) {
        expiresAt = options.expiresAt;
      } else {
        expiresAt = new Date(now.getTime() + DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS).toISOString();
      }
    }

    // Create the message to sign
    const message = createApprovalMessage(
      options.taskId,
      options.payloadHash,
      scope
    );

    // Sign the message
    const signer = new Signer(options.approverIdentity.keyPair, options.approverIdentity.agentId);
    const signature = await signer.signMessage(message);

    const data: ApprovalRequestData = {
      taskId: options.taskId,
      approvedBy: options.approverIdentity.agentId,
      approvalScope: scope,
      payloadHash: options.payloadHash,
      approverSignature: signature,
      conditions: options.conditions,
      expiresAt,
      createdAt: now.toISOString(),
    };

    return new ApprovalRequest(data);
  }

  /**
   * Create an approval request without signing (for testing or manual verification).
   */
  static createUnsigned(
    taskId: string,
    approvedBy: string,
    payloadHash: string,
    scope: ApprovalScope = ApprovalScope.SINGLE,
    conditions?: ApprovalConditions
  ): ApprovalRequest {
    const now = new Date();
    let expiresAt: string | undefined;
    
    if (scope === ApprovalScope.SIMILAR) {
      expiresAt = new Date(now.getTime() + DEFAULT_SIMILAR_APPROVAL_TIMEOUT_MS).toISOString();
    }

    return new ApprovalRequest({
      taskId,
      approvedBy,
      approvalScope: scope,
      payloadHash,
      approverSignature: '', // Empty signature for unsigned
      conditions,
      expiresAt,
      createdAt: now.toISOString(),
    });
  }

  /**
   * Deserialize from JSON data.
   */
  static fromJSON(data: ApprovalRequestData): ApprovalRequest {
    return new ApprovalRequest(data);
  }

  /**
   * Serialize to JSON data.
   */
  toJSON(): ApprovalRequestData {
    return { ...this.data };
  }

  // Getters for approval properties

  get taskId(): string {
    return this.data.taskId;
  }

  get approvedBy(): string {
    return this.data.approvedBy;
  }

  get approvalScope(): ApprovalScope {
    return this.data.approvalScope;
  }

  get payloadHash(): string {
    return this.data.payloadHash;
  }

  get approverSignature(): string {
    return this.data.approverSignature;
  }

  get conditions(): ApprovalConditions | undefined {
    return this.data.conditions;
  }

  get expiresAt(): Date | undefined {
    return this.data.expiresAt ? new Date(this.data.expiresAt) : undefined;
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt);
  }

  /**
   * Check if the approval has expired (for SIMILAR scope).
   */
  get isExpired(): boolean {
    if (!this.data.expiresAt) {
      return false;
    }
    return new Date() > new Date(this.data.expiresAt);
  }

  /**
   * Check if this approval has a signature.
   */
  get isSigned(): boolean {
    return this.data.approverSignature.length > 0;
  }

  /**
   * Get the message that was signed.
   */
  getSignedMessage(): string {
    return createApprovalMessage(
      this.data.taskId,
      this.data.payloadHash,
      this.data.approvalScope
    );
  }

  /**
   * Check if this approval can be used for a given payload hash.
   * For SINGLE scope, must match exactly.
   * For SIMILAR scope, can potentially match related tasks (not implemented in v0.1).
   */
  matchesPayloadHash(hash: string): boolean {
    return this.data.payloadHash === hash;
  }

  /**
   * Get a human-readable summary for CLI display.
   */
  getSummary(): string {
    const lines = [
      `Approval for task: ${this.taskId}`,
      `Approved by: ${this.approvedBy}`,
      `Scope: ${this.approvalScope}`,
      `Created: ${this.data.createdAt}`,
      `Payload hash: ${this.payloadHash}`,
      `Signed: ${this.isSigned ? 'Yes' : 'No'}`,
    ];

    if (this.expiresAt) {
      lines.push(`Expires: ${this.data.expiresAt}`);
      if (this.isExpired) {
        lines.push('Status: EXPIRED');
      }
    }

    if (this.conditions) {
      lines.push(`Conditions: ${JSON.stringify(this.conditions)}`);
    }

    return lines.join('\n');
  }
}
