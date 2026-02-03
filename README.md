# The HA2HA Project

**Human/Agent to Human/Agent Protocol**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Specification](https://img.shields.io/badge/Spec-v0.1.0--draft-orange.svg)](./specification/SPECIFICATION.md)

> *When AI agents talk to each other, humans should still be in the loop.*

---

## What is HA2HA?

HA2HA is a protocol extension for AI agent federation that ensures **human oversight at both ends** of every agent-to-agent interaction.

Built on top of [A2A (Agent-to-Agent Protocol)](https://github.com/a2aproject/A2A), HA2HA adds what's missing: the guarantee that humans remain in control when their agents communicate across organizational boundaries.

## The Problem

The A2A protocol enables AI agents to discover, communicate, and collaborate. But A2A assumes that after authentication, agents can be trusted. This breaks down when:

- 🦠 **Agents get compromised** — Malware, prompt injection, supply chain attacks
- ⚙️ **Agents get misconfigured** — Bugs that cause unintended behavior  
- 👤 **Operators have different trust levels** — Your agent trusts their agent, but do you trust their human?
- 💥 **Actions can't be undone** — Deletions, financial transactions, external communications

## The Solution

HA2HA adds a **human oversight layer**:

```
┌─────────────────────────────────────────┐
│  HA2HA (Human/Agent to Human/Agent)     │ ← Human approval required
├─────────────────────────────────────────┤
│  A2A (Agent-to-Agent Protocol)          │ ← Agent communication
├─────────────────────────────────────────┤
│  Transport (Matrix, HTTP, gRPC)         │ ← Message delivery
├─────────────────────────────────────────┤
│  Network (Tailscale, VPN, Internet)     │ ← Connectivity
└─────────────────────────────────────────┘
```

**Core Principles:**

1. **Humans First** — Every cross-boundary action requires human approval
2. **Trust is Earned** — Unknown agents start blocked; trust builds over time
3. **Fail Secure** — When in doubt, block and escalate
4. **Audit Everything** — Complete trails for forensics and accountability
5. **Mutual Verification** — Both ends must have human oversight

## Quick Start

### For Agent Developers

Add HA2HA support to your A2A agent:

```json
{
  "capabilities": {
    "extensions": [
      {
        "uri": "https://ha2haproject.org/spec/v1",
        "required": true,
        "params": {
          "version": "0.1.0",
          "humanOversight": true,
          "trustLevelRequired": 1
        }
      }
    ]
  }
}
```

See the [Getting Started Guide](./docs/getting-started.md) for full implementation details.

### For Organizations

1. **Read the [Specification](./specification/SPECIFICATION.md)** — Understand the protocol
2. **Review the [Threat Model](./docs/threat-model.md)** — Know what HA2HA protects against
3. **Deploy a reference implementation** — Start federating safely

## Trust Levels

HA2HA uses a 5-level trust model:

| Level | Name | Description |
|-------|------|-------------|
| 0 | Blocked | No communication allowed |
| 1 | Unknown | Every request needs explicit approval |
| 2 | Provisional | Approval required, enhanced monitoring |
| 3 | Standard | Normal operation with approval |
| 4 | Trusted | Expedited approval, pre-approved categories |
| 5 | Verified | Maximum trust, still requires approval |

**Key insight**: Even at Level 5, human approval is required. The difference is speed and scope of pre-approvals, not whether humans are involved.

## Security Alignment

HA2HA aligns with industry security frameworks:

- **OWASP Agentic Security Top 10** — Addresses all 10 risks
- **NIST Cybersecurity Framework** — Incorporates identify, protect, detect, respond, recover
- **Zero Trust Architecture** — Never trust, always verify

## Project Status

| Component | Status |
|-----------|--------|
| Specification | 🟡 Draft (v0.1.0) |
| Reference Implementation | 🔴 Not started |
| Documentation | 🟡 In progress |
| Conformance Tests | 🔴 Not started |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

**Areas where we need help:**

- 📝 Specification feedback and review
- 🔧 Reference implementation development
- 🧪 Test case development
- 📚 Documentation improvements
- 🌐 Translations

## Community

- **Website**: [ha2haproject.org](https://ha2haproject.org)
- **GitHub**: [github.com/ha2haproject/ha2ha](https://github.com/ha2haproject/ha2ha)
- **Discord**: Coming soon

## License

Apache 2.0 — See [LICENSE](./LICENSE)

This license was chosen for compatibility with A2A and to enable broad adoption.

## Acknowledgments

HA2HA builds upon the work of:

- [A2A Project](https://github.com/a2aproject/A2A) (Linux Foundation)
- [OWASP Agentic Security Initiative](https://owasp.org/)
- [Matrix Protocol](https://matrix.org/)
- [Tailscale](https://tailscale.com/)

---

**Copyright 2026 The HA2HA Project Authors.**

*"Human oversight for AI agent federation"*
