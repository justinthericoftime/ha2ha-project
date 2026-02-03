# Changelog

All notable changes to the HA2HA specification will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
