# Changelog

All notable changes to the HA2HA specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-02-02

### Added (Stress Test Findings)

**Protocol Foundation:**
- Extension negotiation rules (§4.5) - what to do on version mismatch, missing params
- Version negotiation (§4.6) - semantic versioning with backward compatibility
- Multi-extension interaction (§4.7) - HA2HA takes precedence
- Trust state wire format (§5.5) - how trust level is communicated
- Task lifecycle invariants (§6.4) - when tasks can execute

**Security Hardening:**
- Approval hash commitment (§7.1.1) - prevents dialog manipulation attacks
- Cryptographic attestation requirements (§8.6) - Agent Card signing
- Automation bias mitigation (§8.7) - rate limits, decision quality monitoring
- Cascading failure prevention (§8.8) - circuit breakers, depth limits
- Audit log integrity (§8.9) - hash chaining for tamper detection

**Implementation Guidance:**
- Qualified approver requirements (§9.4) - competency, authority, workload
- Approval interface requirements (§9.5) - display elements, prohibited patterns
- Latency management (§9.6) - async patterns, pre-approval, batching

**Technical Appendix:**
- HTTP transport binding (Appendix B) - paths, headers, error codes

### Changed
- Status upgraded from Draft to Release Candidate
- Line count: 825 → 1,426 (+601 lines)

---

## [0.1.0-draft] - 2026-02-02

### Added

- Initial draft specification
  - Design principles (Humans First, Trust is Earned, Fail Secure, Audit Everything, Mutual Verification)
  - Protocol stack definition (HA2HA → A2A → Transport → Network)
  - A2A integration via AgentExtension mechanism
  - 5-level trust model with cooldown periods
  - Task approval workflow
  - Operations: approve, reject, escalate, trust, audit
  - Security considerations and OWASP Agentic alignment
  - Implementation requirements (Core, Standard, Advanced tiers)

- Protobuf definitions (`ha2ha.proto`)
  - Trust levels and severity enums
  - Task metadata extensions
  - Approval, rejection, escalation messages
  - Trust management operations
  - Audit logging structures
  - Behavioral monitoring types

- Documentation
  - Getting Started guide
  - Threat Model
  - FAQ
  - Contributing guidelines

- Website
  - Landing page with protocol overview

---

[Unreleased]: https://github.com/ha2haproject/ha2ha/compare/v0.1.0-draft...HEAD
[0.1.0-draft]: https://github.com/ha2haproject/ha2ha/releases/tag/v0.1.0-draft
