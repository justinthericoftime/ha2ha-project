# HA2HA Onboarding System — Master Specification

**Created:** 2026-02-02
**Status:** Executing

## Overview

Complete implementation of HA2HA human onboarding, from spec section to working OpenClaw skill.

## Deliverables

| # | Deliverable | Location | Status |
|---|-------------|----------|--------|
| 1 | §10 Spec Section | `specification/SPECIFICATION.md` | ✅ |
| 2 | Profile Schema | `specification/schemas/approver-profile.schema.json` | ✅ |
| 3 | Onboard Skill | `reference/skills/ha2ha/` | ✅ |
| 4 | Config Schema | `reference/schemas/openclaw-ha2ha.schema.json` | ✅ |
| 5 | Runtime Library | `reference/typescript/src/onboarding/` | ✅ |
| 6 | Docs Update | `docs/getting-started.md` | ✅ |

## Wave Structure

### Wave 1: Foundation (~45 min)
- [x] Add §10 to spec
- [x] Create profile schema
- **Gate:** ✅ Schema validates existing ricardo-caporale.yaml

### Wave 2: Implementation (~90 min)
- [x] Create onboard skill
- [x] Create config schema
- [x] Create runtime library
- **Gate:** ✅ All files created, structure validated

### Wave 3: Documentation (~20 min)
- [x] Update getting-started.md
- **Gate:** ✅ Clear onboarding instructions with Step 0

### Wave 4: QA (~15 min)
- [x] Validate profile schema
- [x] Verify spec structure
- **Gate:** ✅ End-to-end works

## Success Criteria

1. ✅ `/ha2ha onboard` produces valid profile YAML
2. ✅ Profile saved to `~/.openclaw/ha2ha/approvers/{name}.yaml`
3. ✅ Config includes `ha2ha.profile` path
4. ✅ §10 documents what skill implements
5. ✅ Schema validates profiles

## Key Design Decisions

1. **Signposting first** — "5 steps, 10 questions, ~10 minutes"
2. **YAML profiles** — Human-readable, editable
3. **Channel-based identity** — Default for owner-operators
4. **Conversational UX** — No forms, just questions
5. **Fail-secure defaults** — Auto-deny on timeout

## Non-Goals

- Full runtime enforcement (reference impl scope)
- Multi-approver workflows
- GUI/web interface
- Remote agent verification
