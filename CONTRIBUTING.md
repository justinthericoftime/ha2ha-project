# Contributing to HA2HA

Thank you for your interest in contributing to The HA2HA Project! This document provides guidelines for contributing.

## Ways to Contribute

### 1. Specification Feedback

The HA2HA specification is still in draft. We need:

- **Technical review**: Is the protocol sound? Are there edge cases we've missed?
- **Security review**: Can you find weaknesses in the threat model?
- **Clarity improvements**: Is the spec easy to understand and implement?
- **Use case validation**: Does HA2HA work for your agent federation needs?

Open an issue with the `spec-feedback` label.

### 2. Reference Implementation

We need implementations in multiple languages:

- TypeScript/JavaScript (primary)
- Python
- Go
- Rust

See `reference/` for implementation guidelines.

### 3. Documentation

Help us improve:

- Getting started guides
- Integration tutorials
- FAQ entries
- Translations

### 4. Test Cases

We need:

- Conformance test suite
- Edge case scenarios
- Security test cases
- Interoperability tests

### 5. Security Research

If you find a security vulnerability:

1. **DO NOT** open a public issue
2. Email security@ha2haproject.org
3. We'll work with you on responsible disclosure

## Development Process

### For Specification Changes

1. Open an issue describing the proposed change
2. Discuss with maintainers
3. If approved, submit a PR with:
   - Updated SPECIFICATION.md
   - Updated protobuf definitions (if applicable)
   - Updated examples
   - Rationale in PR description

### For Reference Implementation

1. Fork the repository
2. Create a feature branch
3. Write tests first
4. Implement the feature
5. Ensure all tests pass
6. Submit a PR

### Commit Messages

Follow conventional commits:

```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `spec`, `test`, `refactor`, `chore`

Examples:
- `spec(trust): add trust level 0.5 for soft-block`
- `feat(ts): implement behavioral monitoring`
- `docs: add Python quick start guide`

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Focus on what's best for the community
- Accept constructive criticism gracefully
- Show empathy towards others

### Enforcement

Unacceptable behavior may result in temporary or permanent bans. Report issues to conduct@ha2haproject.org.

## Review Process

1. All PRs require at least one maintainer review
2. Specification changes require two maintainer reviews
3. Security-related changes require security team review
4. Allow 48-72 hours for initial review

## Questions?

- Open a discussion on GitHub
- Join our Discord (coming soon)
- Email hello@ha2haproject.org

---

**Thank you for helping make AI agent federation safer for everyone!**
