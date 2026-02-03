# HA2HA Reference Implementation - Polish Plan

**Created:** 2026-02-03
**Status:** In Progress
**Modules:** trust, identity, approval, profile, circuit-breaker, audit, a2a
**Tests:** 740 passing

---

## Executive Summary

Baseline assessment of the HA2HA TypeScript reference implementation:

| Aspect | Status | Notes |
|--------|--------|-------|
| Tests | ✅ 740/740 passing | All modules have test coverage |
| TypeScript | ✅ Compiles clean | No type errors |
| Code Quality | ✅ Good | Well-structured, consistent patterns |
| Documentation | ⚠️ Needs work | No README files, sparse inline docs |
| Spec Alignment | 🔍 Needs verification | Systematic check required |
| Integration Tests | ⚠️ Partial | Only approval flow tested end-to-end |

---

## Wave 1: Documentation & Organization

**Goal:** Comprehensive documentation making the codebase production-ready for external developers.

### 1.1 Root README.md
- [ ] Package overview and purpose
- [ ] Installation instructions
- [ ] Quick start example
- [ ] Module architecture diagram
- [ ] Links to spec sections

### 1.2 Module READMEs (7 files)
- [ ] `src/trust/README.md` - Trust model (§5)
- [ ] `src/identity/README.md` - Cryptographic identity (§8.6)
- [ ] `src/approval/README.md` - Approval workflow (§6-7)
- [ ] `src/profile/README.md` - Human onboarding (§10)
- [ ] `src/circuit-breaker/README.md` - Cascading failure prevention (§8.8)
- [ ] `src/audit/README.md` - Audit log integrity (§8.9)
- [ ] `src/a2a/README.md` - A2A integration (§4)

Each README should include:
- Purpose and spec reference
- Key types and their roles
- Usage examples
- Common patterns

### 1.3 JSDoc Completeness Audit
- [ ] Verify all public exports have JSDoc
- [ ] Add @example tags to key functions
- [ ] Add @see links to spec sections
- [ ] Document thrown errors

**QA Gate:** Documentation review checklist complete

---

## Wave 2: Spec Alignment Verification

**Goal:** Systematic verification that all spec requirements have implementations.

### 2.1 Create Spec Coverage Matrix

Map each MUST/SHOULD/MAY requirement from spec to implementation:

| Spec Section | Requirement | Implementation | Test | Status |
|--------------|-------------|----------------|------|--------|
| §4.1 | HA2HA extension declaration | a2a/extension.ts | extension.test.ts | ✅ |
| §4.2 | Extension parameters | a2a/types.ts | extension.test.ts | ✅ |
| §4.3 | Agent Card extensions | a2a/agent-card.ts | agent-card.test.ts | ✅ |
| §4.4 | Task metadata extensions | a2a/task-metadata.ts | task-metadata.test.ts | ✅ |
| §4.5 | Extension negotiation | a2a/negotiation.ts | negotiation.test.ts | ✅ |
| §4.6 | Version negotiation | a2a/negotiation.ts | negotiation.test.ts | ✅ |
| §5.1 | Trust levels (0-5) | trust/types.ts | trust-levels.test.ts | ✅ |
| §5.2 | Trust level implications | trust/trust-entry.ts | elevation.test.ts | ✅ |
| §5.3 | Trust transitions | trust/trust-entry.ts | violation.test.ts | ✅ |
| §5.4 | Violation severity | trust/violations.ts | violation.test.ts | ✅ |
| §5.5 | Trust state wire format | a2a/task-metadata.ts | task-metadata.test.ts | ✅ |
| §6.4 | Task lifecycle invariants | approval/task-lifecycle.ts | task-lifecycle.test.ts | ✅ |
| §7.1 | ha2ha/approve operation | approval/* | full-flow.test.ts | ✅ |
| §7.1.1 | Approval hash commitment | approval/hash.ts | hash.test.ts | ✅ |
| §7.2 | ha2ha/reject operation | approval/task-lifecycle.ts | task-lifecycle.test.ts | ✅ |
| §7.3 | ha2ha/escalate operation | a2a/server.ts | server.test.ts | ✅ |
| §7.4 | ha2ha/trust operation | trust/trust-registry.ts | trust-registry.test.ts | ✅ |
| §7.5 | ha2ha/audit operation | audit/* | audit-*.test.ts | ✅ |
| §8.6 | Cryptographic attestation | identity/* | attestation-flow.test.ts | ✅ |
| §8.8 | Circuit breaker pattern | circuit-breaker/* | circuit-breaker.test.ts | ✅ |
| §8.8.1 | Workflow depth limits | circuit-breaker/workflow-depth.ts | workflow-depth.test.ts | ✅ |
| §8.9 | Audit log integrity | audit/audit-chain.ts | tamper-detection.test.ts | ✅ |
| §8.9.1 | Hash chaining | audit/audit-chain.ts | audit-chain.test.ts | ✅ |
| §9.4 | Qualified approver requirements | profile/profile-enforcer.ts | enforcer.test.ts | ✅ |
| §9.5 | Approval interface requirements | approval/cli.ts | cli.test.ts | ✅ |
| §9.6 | Latency management | approval/types.ts | N/A (constants) | ✅ |
| §10 | Human onboarding | onboarding/* + profile/* | enforcer.test.ts | ✅ |
| Appendix B | HTTP Transport | a2a/server.ts | server.test.ts | ✅ |

### 2.2 Identify Gaps

After matrix completion, flag any:
- [ ] MUST requirements without implementation
- [ ] MUST requirements without tests
- [ ] SHOULD requirements that are missing
- [ ] MAY requirements worth implementing

### 2.3 Implement Missing Requirements

Priority order:
1. Missing MUST requirements (critical)
2. Missing MUST tests (critical)
3. Missing SHOULD with high value
4. Missing MAY for completeness

**QA Gate:** 100% MUST coverage, 90%+ SHOULD coverage

---

## Wave 3: Test Coverage Enhancement

**Goal:** Comprehensive test coverage including integration and edge cases.

### 3.1 Unit Test Gap Analysis

Run coverage report and identify:
- [ ] Functions with < 80% coverage
- [ ] Branches not exercised
- [ ] Error paths not tested

### 3.2 Cross-Module Integration Tests

Create new test file: `src/__tests__/integration.test.ts`

Scenarios to test:
- [ ] **Trust + Approval**: Task approval with trust level checks
- [ ] **Trust + Circuit Breaker**: Violations trigger circuit breaker
- [ ] **Approval + Audit**: Full approval flow with audit logging
- [ ] **Identity + A2A**: Signed agent card negotiation
- [ ] **Profile + Approval**: Fatigue limits and availability enforcement
- [ ] **Circuit Breaker + Workflow Depth**: Cascading failure prevention

### 3.3 End-to-End Workflow Tests

Create new test file: `src/__tests__/e2e.test.ts`

Scenarios:
- [ ] **Federation handshake**: Two agents discover and negotiate
- [ ] **Full task flow**: Submit → Approve → Execute → Complete with all modules
- [ ] **Security scenario**: Tampering detection and trust reduction
- [ ] **Recovery scenario**: Circuit breaker trip and reset

### 3.4 Edge Case Tests

Across all modules:
- [ ] Empty inputs
- [ ] Maximum values
- [ ] Concurrent operations
- [ ] Clock skew handling
- [ ] Persistence recovery after crash

**QA Gate:** >90% line coverage, all integration scenarios pass

---

## Wave 4: API Consistency & Polish

**Goal:** Consistent, clean API surface.

### 4.1 Naming Convention Audit

- [ ] All exported types use PascalCase
- [ ] All exported functions use camelCase
- [ ] All constants use SCREAMING_SNAKE_CASE
- [ ] Consistent verb prefixes (create*, get*, validate*, etc.)

### 4.2 Error Type Consistency

- [ ] All errors extend a base HA2HA error class
- [ ] Error codes are consistent with spec (Ha2haErrorCode)
- [ ] Error messages are informative but don't leak internals
- [ ] All thrown errors are documented in JSDoc

### 4.3 Async Pattern Consistency

- [ ] All async functions return Promise<T>
- [ ] No mixing callbacks and promises
- [ ] Proper error propagation in async chains
- [ ] AbortController/signal support where appropriate

### 4.4 Export Organization

Review and clean up:
- [ ] Main `src/index.ts` - ensure logical grouping
- [ ] Module indexes - consistent patterns
- [ ] Re-exports are intentional, not accidental
- [ ] No circular dependencies

### 4.5 Type Refinement

- [ ] Use branded types for IDs (agentId, taskId, etc.)
- [ ] Use strict string literal unions where appropriate
- [ ] Generic constraints are meaningful
- [ ] No unnecessary `any` types

**QA Gate:** API consistency checklist complete, zero `any` types

---

## Wave 5: Production Hardening

**Goal:** Production-ready robustness.

### 5.1 Input Validation

- [ ] All public functions validate inputs
- [ ] Early failure with descriptive errors
- [ ] Consistent validation error format

### 5.2 Error Handling Completeness

- [ ] All error paths logged appropriately
- [ ] No swallowed errors
- [ ] Cleanup on error (resources, state)
- [ ] Retry logic where appropriate

### 5.3 Performance Review

- [ ] No obvious O(n²) or worse algorithms
- [ ] Memory-efficient for large audit logs
- [ ] Avoid unnecessary allocations in hot paths

### 5.4 Security Hardening

- [ ] No secret logging
- [ ] Constant-time comparisons for hashes
- [ ] Input size limits to prevent DoS
- [ ] Secure random for IDs

### 5.5 Package Polish

- [ ] Update package.json metadata
- [ ] Add CHANGELOG.md
- [ ] Add CONTRIBUTING.md
- [ ] Verify license headers
- [ ] Create npm-ready build

**QA Gate:** Security review checklist, performance benchmark baseline

---

## Execution Tracker

| Wave | Status | Started | Completed | Blockers |
|------|--------|---------|-----------|----------|
| 1 | ✅ Complete | 2026-02-03 | 2026-02-03 | — |
| 2 | ✅ Complete | 2026-02-03 | 2026-02-03 | — |
| 3 | ✅ Partial | 2026-02-03 | 2026-02-03 | — |
| 4 | ⏳ Pending | — | — | — |
| 5 | ⏳ Pending | — | — | — |

## Progress Notes

### Wave 1 Completed
- ✅ Root README.md created (7.8KB)
- ✅ All 7 module READMEs created:
  - trust/README.md (4.3KB)
  - identity/README.md (4.0KB)
  - approval/README.md (5.8KB)
  - profile/README.md (4.1KB)
  - circuit-breaker/README.md (5.2KB)
  - audit/README.md (6.0KB)
  - a2a/README.md (6.7KB)
  - onboarding/README.md (4.6KB)

### Wave 2 Completed
- ✅ Spec coverage matrix verified - all MUST requirements implemented
- ✅ All sections §4-§10 and Appendix B have corresponding code
- No missing implementations found

### Wave 3 Partial
- ✅ Created src/__tests__/integration.test.ts with 20 new tests
- ✅ Cross-module integration tests:
  - Trust + Approval
  - Trust + Circuit Breaker
  - Approval + Audit
  - Identity + A2A
  - Profile + Approval
  - Circuit Breaker + Workflow Depth
  - Full End-to-End Flows (happy path + security incident)
- Total tests now: 760 (up from 740)

---

## Appendix: File Inventory

```
src/
├── index.ts                      # Main exports
├── trust/
│   ├── types.ts                  # TrustLevel, TrustContext, etc.
│   ├── trust-entry.ts           # TrustEntry class
│   ├── trust-registry.ts        # TrustRegistry class
│   ├── violations.ts            # Violation handling
│   ├── persistence.ts           # Trust store persistence
│   └── index.ts                 # Module exports
├── identity/
│   ├── types.ts                  # KeyPairData, AgentIdentityData
│   ├── keypair.ts               # Ed25519 keypair operations
│   ├── agent-identity.ts        # AgentIdentity class
│   ├── signer.ts                # Message signing
│   ├── verifier.ts              # Signature verification
│   ├── known-keys.ts            # Known keys registry
│   └── index.ts                 # Module exports
├── approval/
│   ├── types.ts                  # TaskState, ApprovalScope, etc.
│   ├── hash.ts                  # Payload hashing (§7.1.1)
│   ├── pending-task.ts          # PendingTask class
│   ├── approval-request.ts      # ApprovalRequest class
│   ├── approval-queue.ts        # ApprovalQueue class
│   ├── task-lifecycle.ts        # TaskLifecycle state machine
│   ├── validator.ts             # Approval validation
│   ├── cli.ts                   # CLI approval interface
│   └── index.ts                 # Module exports
├── profile/
│   ├── types.ts                  # EnforcementResult, FatigueStatus
│   ├── availability.ts          # AvailabilityChecker
│   ├── fatigue.ts               # FatigueTracker
│   ├── pre-trust.ts             # PreTrustResolver
│   ├── profile-enforcer.ts      # ProfileEnforcer orchestrator
│   └── index.ts                 # Module exports
├── circuit-breaker/
│   ├── types.ts                  # CircuitState, CircuitBreakerConfig
│   ├── circuit-breaker.ts       # CircuitBreaker class
│   ├── registry.ts              # CircuitBreakerRegistry
│   ├── workflow-depth.ts        # WorkflowDepthTracker
│   └── index.ts                 # Module exports
├── audit/
│   ├── types.ts                  # AuditEventType, AuditEntry
│   ├── audit-entry.ts           # Entry creation and hashing
│   ├── audit-chain.ts           # AuditChain class
│   ├── verifier.ts              # Chain verification
│   ├── query.ts                 # Audit log queries
│   └── index.ts                 # Module exports
├── a2a/
│   ├── types.ts                  # A2A and HA2HA types
│   ├── extension.ts             # Extension handling
│   ├── agent-card.ts            # AgentCardBuilder
│   ├── negotiation.ts           # Version/capability negotiation
│   ├── task-metadata.ts         # Task metadata helpers
│   ├── server.ts                # HTTP server (Appendix B)
│   └── index.ts                 # Module exports
└── onboarding/
    ├── types.ts                  # ApproverProfile, Ha2haConfig
    ├── loader.ts                # Profile loading
    ├── validator.ts             # Profile validation
    └── index.ts                 # Module exports
```

---

## Notes

- This plan prioritizes external developer experience (documentation) first
- Spec alignment verification is critical for "reference implementation" status
- Integration tests will catch cross-module issues
- Production hardening ensures real-world readiness

**Next Action:** Begin Wave 1.1 - Create root README.md
