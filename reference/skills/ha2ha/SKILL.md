---
name: ha2ha
description: HA2HA protocol onboarding and management for federated agent communications.
homepage: https://ha2haproject.org
metadata: { "openclaw": { "emoji": "🤝", "requires": { "bins": [] } } }
---

# HA2HA Skill

Human/Agent to Human/Agent protocol management for OpenClaw.

## Commands

### Onboard a Human Approver

Run the interactive onboarding flow:

```
/ha2ha onboard
```

This walks through 5 steps (10 questions, ~10 minutes):
1. **Identity** — How are you identified and verified?
2. **Registration** — What can you approve, and when?
3. **Preferences** — How should requests be presented?
4. **Trust** — What's your default stance on unknown agents?
5. **Recovery** — What happens when you're unavailable?

**Output:** Profile saved to `~/.openclaw/ha2ha/approvers/{id}.yaml`

### View Current Profile

```
/ha2ha status
```

Shows your active approver profile and trust settings.

### Edit Profile

Profiles are YAML files. Edit directly:

```bash
$EDITOR ~/.openclaw/ha2ha/approvers/your-name.yaml
```

Or re-run onboarding to start fresh:

```
/ha2ha onboard --reset
```

## Onboarding Flow

When you run `/ha2ha onboard`, the agent will:

1. **Signpost** — Explain the 5 steps upfront
2. **Ask 10 questions** — Conversational, not form-based
3. **Generate profile** — Create YAML from your answers
4. **Save profile** — Store in `~/.openclaw/ha2ha/approvers/`
5. **Update config** — Patch `ha2ha.profile` in openclaw.json

## Configuration

After onboarding, your `openclaw.json` will include:

```json
{
  "ha2ha": {
    "enabled": true,
    "profile": "~/.openclaw/ha2ha/approvers/your-name.yaml",
    "trustStore": "~/.openclaw/ha2ha/trust-store/"
  }
}
```

## Profile Schema

See the [full schema](https://ha2haproject.org/schemas/approver-profile.schema.json) for validation.

Key sections:
- `identity` — Channel-based, multi-factor, or token verification
- `authorization` — Domains and availability
- `approval_preferences` — Inline, batched, fatigue limits
- `trust_baseline` — Default level, pre-trusted entities
- `recovery` — Delegation, timeout behavior

## Trust Levels

| Level | Name | Description |
|-------|------|-------------|
| 0 | Blocked | No communication |
| 1 | Unknown | Approval required for everything |
| 2 | Provisional | Approval required, enhanced monitoring |
| 3 | Standard | Normal operation |
| 4 | Trusted | Pre-approved categories |
| 5 | Verified | Maximum trust (still requires approval) |

## Examples

### Minimal Profile (Owner-Operator)

```yaml
approver:
  name: "Your Name"
  id: "your-name"
  created: "2026-02-02T12:00:00Z"

identity:
  model: "channel-based"
  verification: "simple"

authorization:
  domains: ["*"]
  availability:
    mode: "waking-hours"

approval_preferences:
  presentation: "inline"
  fatigue_limit: null

trust_baseline:
  default_level: "unknown"

recovery:
  timeout_hours: 5
  timeout_action: "deny"
```

### Enterprise Profile (Multiple Domains)

```yaml
approver:
  name: "Security Admin"
  id: "security-admin"
  created: "2026-02-02T12:00:00Z"

identity:
  model: "multi-factor"
  verification: "strict"

authorization:
  domains: ["security/*", "compliance/*"]
  availability:
    mode: "scheduled"
    schedule:
      timezone: "America/New_York"
      windows:
        - days: ["mon", "tue", "wed", "thu", "fri"]
          start: "09:00"
          end: "17:00"

approval_preferences:
  presentation: "batched"
  fatigue_limit: 5
  batch_max_size: 10

trust_baseline:
  default_level: "blocked"

recovery:
  delegation:
    - name: "Backup Admin"
      contact: "backup@example.com"
  timeout_hours: 2
  timeout_action: "escalate"
```

## Resources

- **Specification**: https://ha2haproject.org/spec
- **GitHub**: https://github.com/ha2haproject/ha2ha
- **Getting Started**: https://ha2haproject.org/docs/getting-started
