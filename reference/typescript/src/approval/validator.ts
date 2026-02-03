/**
 * Approval Validator
 * 
 * Validates approval requests by checking:
 * - Hash commitment matches task payload
 * - Signature is valid (from identity module)
 * - Approver is qualified (from trust module)
 * - Task is in correct state and not expired
 */

import {
  ApprovalError,
  ApprovalResult,
  PendingTaskData,
  ApprovalRequestData,
  TaskState,
} from './types';
import { verifyPayloadHash, createApprovalMessage } from './hash';
import { TrustRegistry, TrustLevel } from '../trust';
import { Verifier, KnownKeys } from '../identity';

/**
 * Configuration for the approval validator.
 */
export interface ValidatorConfig {
  /** Trust registry for checking approver qualifications */
  trustRegistry?: TrustRegistry;
  /** Known keys registry for signature verification */
  knownKeys?: KnownKeys;
  /** Minimum trust level required to approve tasks */
  minApproverTrustLevel?: TrustLevel;
  /** Whether to require signature verification (default: true) */
  requireSignature?: boolean;
  /** Whether to require approver to be in trust registry (default: false) */
  requireTrustedApprover?: boolean;
}

/**
 * Validates approval requests for pending tasks.
 */
export class ApprovalValidator {
  private config: ValidatorConfig;

  constructor(config: ValidatorConfig = {}) {
    this.config = {
      minApproverTrustLevel: TrustLevel.STANDARD,
      requireSignature: true,
      requireTrustedApprover: false,
      ...config,
    };
  }

  /**
   * Validate an approval request against a pending task.
   * 
   * @param task - The pending task data
   * @param approval - The approval request data
   * @returns ApprovalResult indicating success or failure
   * 
   * @example
   * ```typescript
   * const result = await validator.validate(task.toJSON(), approval.toJSON());
   * if (!result.success) {
   *   console.error(`Approval failed: ${result.error}`);
   * }
   * ```
   */
  async validate(
    task: PendingTaskData,
    approval: ApprovalRequestData
  ): Promise<ApprovalResult> {
    // 1. Check task state
    if (task.state !== TaskState.SUBMITTED) {
      if (task.state === TaskState.CANCELED) {
        return {
          success: false,
          error: ApprovalError.TASK_ALREADY_REJECTED,
          message: 'Task has already been rejected or canceled',
        };
      }
      if (task.state === TaskState.WORKING) {
        return {
          success: false,
          error: ApprovalError.TASK_ALREADY_APPROVED,
          message: 'Task has already been approved and is working',
        };
      }
      return {
        success: false,
        error: ApprovalError.INVALID_STATE_TRANSITION,
        message: `Task is in ${task.state} state and cannot be approved`,
      };
    }

    // 2. Check task not expired
    const expiresAt = new Date(task.expiresAt);
    if (new Date() > expiresAt) {
      return {
        success: false,
        error: ApprovalError.TASK_TIMEOUT,
        message: 'Task has expired and can no longer be approved',
      };
    }

    // 3. Check task ID matches
    if (approval.taskId !== task.taskId) {
      return {
        success: false,
        error: ApprovalError.TASK_NOT_FOUND,
        message: 'Approval task ID does not match pending task',
      };
    }

    // 4. Verify payload hash commitment
    const hashMatches = verifyPayloadHash(task.payload, approval.payloadHash);
    if (!hashMatches) {
      return {
        success: false,
        error: ApprovalError.HASH_MISMATCH,
        message: 'Payload hash mismatch - task may have been tampered with',
      };
    }

    // Also verify against the stored hash
    if (approval.payloadHash !== task.payloadHash) {
      return {
        success: false,
        error: ApprovalError.HASH_MISMATCH,
        message: 'Approval hash does not match stored task hash',
      };
    }

    // 5. Check approver qualification (if trust registry is configured)
    if (this.config.requireTrustedApprover && this.config.trustRegistry) {
      const approverTrust = this.config.trustRegistry.getTrustLevel(approval.approvedBy);
      if (approverTrust < (this.config.minApproverTrustLevel ?? TrustLevel.STANDARD)) {
        return {
          success: false,
          error: ApprovalError.APPROVER_NOT_QUALIFIED,
          message: `Approver trust level (${approverTrust}) is below minimum required (${this.config.minApproverTrustLevel})`,
        };
      }
    }

    // 6. Verify signature (if signature verification is enabled)
    if (this.config.requireSignature && approval.approverSignature) {
      const signatureValid = await this.verifySignature(approval);
      if (!signatureValid) {
        return {
          success: false,
          error: ApprovalError.SIGNATURE_INVALID,
          message: 'Approval signature verification failed',
        };
      }
    }

    // 7. Check approval not expired (for SIMILAR scope approvals)
    if (approval.expiresAt) {
      const approvalExpiry = new Date(approval.expiresAt);
      if (new Date() > approvalExpiry) {
        return {
          success: false,
          error: ApprovalError.APPROVAL_EXPIRED,
          message: 'Approval has expired',
        };
      }
    }

    // All checks passed
    return {
      success: true,
      task,
    };
  }

  /**
   * Verify the cryptographic signature on an approval.
   */
  private async verifySignature(approval: ApprovalRequestData): Promise<boolean> {
    if (!this.config.knownKeys) {
      // No known keys registry - skip signature verification
      return true;
    }

    // Get the public key for the approver
    const keyEntry = this.config.knownKeys.get(approval.approvedBy);
    if (!keyEntry) {
      // Approver not in known keys - cannot verify
      return false;
    }

    // Recreate the message that was signed
    const message = createApprovalMessage(
      approval.taskId,
      approval.payloadHash,
      approval.approvalScope
    );

    try {
      // Verify the signature
      const result = await Verifier.verifyCompact(
        approval.approverSignature,
        keyEntry.publicKey
      );
      return result.valid;
    } catch {
      return false;
    }
  }

  /**
   * Quick check if a task can be approved (without full validation).
   */
  canApprove(task: PendingTaskData): { canApprove: boolean; reason?: string } {
    if (task.state !== TaskState.SUBMITTED) {
      return { canApprove: false, reason: `Task is in ${task.state} state` };
    }

    const expiresAt = new Date(task.expiresAt);
    if (new Date() > expiresAt) {
      return { canApprove: false, reason: 'Task has expired' };
    }

    return { canApprove: true };
  }

  /**
   * Validate just the hash commitment (without signature verification).
   * Useful for quick pre-checks.
   */
  validateHash(task: PendingTaskData, approvalHash: string): boolean {
    return verifyPayloadHash(task.payload, approvalHash) && approvalHash === task.payloadHash;
  }
}

/**
 * Create a validator with default configuration.
 */
export function createValidator(config?: ValidatorConfig): ApprovalValidator {
  return new ApprovalValidator(config);
}
