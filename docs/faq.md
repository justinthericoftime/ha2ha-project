# Frequently Asked Questions

## General

### What does HA2HA stand for?

**Human/Agent to Human/Agent**. The name emphasizes that both ends of an agent federation have human oversight—it's not just agents talking to agents, but agents with humans in the loop on both sides.

### How is HA2HA different from A2A?

A2A (Agent-to-Agent Protocol) enables agents to discover and communicate with each other. HA2HA is an extension to A2A that adds mandatory human oversight. Think of it as:

- **A2A**: Enables agents to talk
- **HA2HA**: Ensures humans are listening

### Why do we need HA2HA if A2A has authentication?

Authentication proves *who* is making a request. It doesn't validate *what* they're asking for or whether the request is appropriate. HA2HA adds:

- Human approval for every request
- Trust levels that limit scope
- Behavioral monitoring for anomalies
- Audit trails for accountability

### Is HA2HA a replacement for A2A?

No. HA2HA is built on top of A2A. It uses A2A's extension mechanism to add human oversight capabilities. You need A2A for agent communication; HA2HA makes that communication safer.

## Implementation

### Do I need to rewrite my agent to support HA2HA?

No. If your agent is A2A-compatible, adding HA2HA support involves:

1. Adding the HA2HA extension to your Agent Card
2. Implementing a trust registry
3. Adding an approval workflow
4. Implementing audit logging

Most of this is additive, not a rewrite.

### What if the other agent doesn't support HA2HA?

You have two options:

1. **Block them** (recommended): Set non-HA2HA agents to trust level 0
2. **Accept with caution**: Treat them as level 1 with maximum scrutiny

We strongly recommend option 1 for production systems.

### How do I handle approval for real-time interactions?

HA2HA's trust levels address this:

- **Level 5 (Verified)**: 5-minute timeout, pre-approved categories
- **Level 4 (Trusted)**: 15-minute timeout, expedited review

For truly real-time needs, build trust over time with demonstration of good behavior.

### Can I automate approvals?

**Partially**. At higher trust levels, you can pre-approve categories of requests. But:

- A human must define the pre-approval rules
- A human must review the rules periodically
- Anomalies still trigger human review

Fully automated approval defeats the purpose of HA2HA.

### What transport should I use?

HA2HA doesn't mandate a specific transport. Recommendations:

| Use Case | Recommended Transport |
|----------|----------------------|
| High security | Matrix with E2E encryption |
| Compatibility | HTTPS |
| Performance | gRPC |
| Private networks | Tailscale + any |

## Trust Model

### Why five trust levels?

Research on human decision-making and incident response informed the design:

- **Too few levels**: Not enough granularity for nuanced trust
- **Too many levels**: Cognitive overhead, harder decisions

Five levels map to clear behavioral differences (blocked, unknown, provisional, standard, trusted, verified).

### Why can't agents reach level 5 automatically?

Trust level increases require explicit human approval because:

1. Automation can be gamed
2. Humans need to consciously accept risk
3. Accountability requires human decision

### How long does it take to build trust?

Minimum time to reach each level (with good behavior):

| From | To | Minimum Time |
|------|----|--------------|
| 1 | 2 | 24 hours |
| 2 | 3 | 4 hours |
| 3 | 4 | Varies (human judgment) |
| 4 | 5 | Varies (extensive history) |

These are minimums. Human approval is still required at each step.

### What happens when trust is violated?

Trust drops immediately based on severity:

- **Critical**: Drop to level 0 (blocked)
- **High**: Drop to level 1 (unknown)
- **Medium**: Drop 2 levels
- **Low**: Drop 1 level

Cooldown periods prevent immediate re-elevation.

## Security

### Can HA2HA prevent all attacks?

No. HA2HA makes attacks:

- **Detectable** through audit trails
- **Slower** through approval requirements
- **Accountable** through identity verification
- **Recoverable** through action logging

It cannot prevent a sophisticated attacker who fully controls the other endpoint.

### What about prompt injection?

Human review is the primary defense. When a human sees the actual content of a request (especially at low trust levels), they can identify suspicious content that might be prompt injection.

### Is HA2HA GDPR compliant?

HA2HA itself is a protocol specification. Your implementation must address:

- Data minimization in audit logs
- Right to erasure (careful with tamper-proof logs)
- Purpose limitation
- Cross-border data transfer

Consult legal counsel for your specific situation.

### Can I use HA2HA without mTLS?

Yes. mTLS is optional but recommended for high-security environments. Other A2A security schemes (OAuth2, API keys) are supported.

## Operations

### How do I handle approval fatigue?

1. **Pre-approvals**: At higher trust levels, pre-approve common request types
2. **Batching**: Group similar requests for single approval
3. **Delegation**: Different approvers for different action types
4. **Rotation**: Rotate approvers to distribute load
5. **Monitoring**: Alert on approval pattern anomalies

### What should I log?

Minimum required fields per the spec:

- Timestamp
- Event type
- Task ID
- Source/target agent IDs
- Human ID (if applicable)
- Trust level
- Outcome
- Hash (for tamper detection)

### How long should I keep audit logs?

Depends on your compliance requirements. Recommendations:

- **Minimum**: 90 days
- **Standard**: 1 year
- **Regulated industries**: Check specific requirements (often 7+ years)

### Can I share audit logs with federation partners?

Optional. The `auditEndpoint` parameter allows agents to submit audit entries to each other. This creates mutual accountability but requires careful privacy consideration.

## Future

### Will there be HA2HA v1.0?

Yes, once we've gathered sufficient community feedback and the reference implementation is stable. Current timeline estimate: Q3 2026.

### How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md). Key areas:

- Specification feedback
- Reference implementations
- Test cases
- Documentation

### Is there a certification program?

Not yet. We're considering:

- Self-certification (statement of compliance)
- Community testing
- Third-party audits (for high-stakes deployments)

---

**More questions?** Open a discussion on GitHub or email hello@ha2haproject.org
