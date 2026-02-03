# HA2HA Threat Model

This document describes the threats HA2HA is designed to address, and honestly acknowledges what it cannot prevent.

## Threat Actors

### 1. External Attacker

**Profile**: Someone without legitimate access attempting to compromise agent communication.

**Goals**:
- Intercept agent communications
- Inject malicious messages
- Impersonate legitimate agents
- Cause denial of service

**HA2HA Defenses**:
- Transport encryption (TLS/mTLS)
- Agent identity verification via A2A security schemes
- Trust registry rejects unknown agents
- Rate limiting based on trust level

### 2. Compromised Agent

**Profile**: A legitimate agent whose underlying system has been compromised (malware, supply chain attack, prompt injection).

**Goals**:
- Exfiltrate data through federation
- Execute unauthorized actions
- Spread to other federated agents
- Maintain persistent access

**HA2HA Defenses**:
- Behavioral monitoring detects anomalies
- Human approval blocks unexpected actions
- Trust levels limit blast radius
- Audit logs enable forensic analysis
- Violations trigger automatic trust reduction

### 3. Malicious Operator

**Profile**: A human who legitimately controls an agent but has malicious intent toward federation partners.

**Goals**:
- Social engineering via agent
- Legitimate-looking malicious requests
- Data exfiltration
- Reputation damage

**HA2HA Defenses**:
- Human approval on RECEIVING end catches suspicious requests
- Trust levels earned over time
- Audit trails create accountability
- Mutual verification ensures oversight on both sides

### 4. Rogue Agent Developer

**Profile**: Developer who intentionally builds malicious capabilities into an agent.

**Goals**:
- Backdoors in agent code
- Hidden data collection
- Delayed attacks (time bombs)

**HA2HA Defenses**:
- HA2HA attestation (in Advanced tier)
- Behavioral monitoring over time
- Community reporting and blocklists
- Open source preference for inspection

### 5. Insider Threat

**Profile**: Legitimate user of your agent who abuses their access.

**Goals**:
- Approve malicious requests they shouldn't
- Bypass controls
- Cover tracks

**HA2HA Defenses**:
- Audit logs with tamper detection
- Separation of duties (different approvers for different actions)
- Anomaly detection on approval patterns
- Multi-party approval for sensitive actions (Advanced tier)

## Attack Vectors

### A. Message Manipulation

| Attack | Description | HA2HA Defense |
|--------|-------------|---------------|
| Injection | Malicious content in task payload | Human review of task content |
| Replay | Reusing valid messages | Unique task IDs, timestamps |
| MITM | Intercepting and modifying | Transport encryption, mTLS |
| Spoofing | Pretending to be another agent | A2A authentication + HA2HA verification |

### B. Trust Exploitation

| Attack | Description | HA2HA Defense |
|--------|-------------|---------------|
| Trust escalation | Gaming system to increase trust | Human approval required for all trust increases |
| Pre-compromise | Building trust, then attacking | Behavioral monitoring detects changes |
| Trust transfer | Using trusted agent to forward requests | Tasks cannot be forwarded without re-approval |

### C. Denial of Service

| Attack | Description | HA2HA Defense |
|--------|-------------|---------------|
| Approval flooding | Overwhelming humans with requests | Rate limiting by trust level |
| Slow-loris | Keeping tasks pending indefinitely | Approval timeouts |
| Resource exhaustion | Large payloads, many connections | Size limits, connection limits |

### D. Social Engineering

| Attack | Description | HA2HA Defense |
|--------|-------------|---------------|
| Urgency manipulation | "Approve now, emergency!" | Clear UI showing trust level and risk |
| Context manipulation | Misleading task descriptions | Full content display at low trust |
| Approval fatigue | Many small requests to reduce vigilance | Pattern detection, anomaly alerts |

## Honest Limitations

HA2HA **cannot prevent**:

### 1. Sophisticated Endpoint Compromise

If an attacker fully controls the other endpoint (both agent AND human), they can:
- Send well-formed malicious requests
- Approve their own requests on their side
- Provide false audit information

**What HA2HA provides**: Makes attacks detectable, slower, and accountable. Creates forensic evidence.

### 2. Zero-Day Exploits

If an attacker exploits unknown vulnerabilities in:
- The underlying platform
- The A2A implementation
- The transport layer

**What HA2HA provides**: Defense in depth. Multiple layers must be compromised.

### 3. Human Error

If the approving human:
- Doesn't read requests carefully
- Approves everything automatically
- Makes poor trust decisions

**What HA2HA provides**: Audit trails, pattern detection, training recommendations.

### 4. Social Engineering of Humans

A sophisticated attacker can craft requests that:
- Appear legitimate
- Create false urgency
- Exploit existing relationships

**What HA2HA provides**: Trust levels, anomaly detection, context about requester history.

## Security Boundaries

### What's IN Scope

- Agent-to-agent communication security
- Human oversight workflows
- Trust management
- Audit logging
- Behavioral monitoring
- Escalation paths

### What's OUT of Scope

- Internal agent security (use OWASP guidance)
- Network security (use Tailscale, VPN)
- Authentication mechanisms (use A2A security schemes)
- Key management (use your organization's PKI)
- Incident response (use your IR procedures)

## OWASP Agentic Security Alignment

HA2HA addresses the OWASP Agentic Security Top 10 risks:

| # | Risk | HA2HA Mitigation |
|---|------|------------------|
| A01 | Prompt Injection | Human reviews all cross-boundary requests |
| A02 | Sensitive Data Exposure | Trust levels limit access; audit trails |
| A03 | Inadequate Sandboxing | Actions require explicit approval |
| A04 | Unauthorized Actions | Every action requires human approval |
| A05 | Insecure Inter-Agent Communication | Mandatory HA2HA verification |
| A06 | Excessive Autonomy | No autonomous cross-boundary actions |
| A07 | Overreliance on AI | Human-in-the-loop by design |
| A08 | Insufficient Logging | Comprehensive audit requirements |
| A09 | Supply Chain Vulnerabilities | Attestation, behavioral monitoring |
| A10 | Improper Error Handling | Fail-secure with escalation |

## Security Recommendations

### For High-Security Environments

1. Use mTLS between all agents
2. Require minimum trust level 2 for all interactions
3. Enable full audit logging with tamper detection
4. Implement multi-party approval for sensitive actions
5. Use hardware security modules for key storage
6. Regular security audits of agent code

### For Standard Environments

1. Use TLS for transport
2. Start unknown agents at level 1
3. Enable standard audit logging
4. Single-party approval with anomaly detection
5. Regular review of trust levels

### For Development/Testing

1. Use isolated networks
2. Mock approval workflows
3. Comprehensive logging
4. Automated test scenarios
5. Chaos engineering for resilience testing

---

**Report Security Issues**: security@ha2haproject.org

**Do not open public issues for security vulnerabilities.**
