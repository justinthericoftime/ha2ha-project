# Gap 2: Cryptographic Identity — Full Plan

**Gap:** No cryptographic agent identity (session tokens only)
**Target:** Implement §8.6 Cryptographic Attestation from HA2HA spec
**Wave:** 1 (Foundation, can parallelize with Gap 1)

---

## Phase 1: Context

**Current State:**
- OpenClaw uses session tokens for API auth
- Telegram bot tokens for channel auth
- No agent identity layer (no keypairs, no signatures)
- No Agent Cards

**Constraints:**
- Use standard crypto (ES256 or Ed25519 per spec)
- Must work offline (pre-shared keys for private federation)
- Keys must be securely stored
- Must integrate with existing agent IDs

**Trigger:** HA2HA requires cryptographic verification of agent identity

---

## Phase 2: Scope

### Building

| Deliverable | Description |
|-------------|-------------|
| `KeyPair` class | Generate and manage Ed25519 keypairs |
| `AgentIdentity` class | Agent's cryptographic identity |
| `AgentCard` interface | JSON-LD Agent Card with signature |
| `Signer` class | Sign data with agent's private key |
| `Verifier` class | Verify signatures against public keys |
| Key storage | Secure storage at `~/.openclaw/ha2ha/identity/` |
| Known keys | Trusted public keys store |

### NOT Building

- Full X.509 certificate chain (use self-signed for private federation)
- OCSP/CRL revocation checking (defer to v0.2)
- Hardware security module integration
- Key rotation automation

### Success Criteria

1. Each agent has a unique Ed25519 keypair
2. Agent Cards are signed with JWS
3. Signatures can be verified against known public keys
4. Private keys are stored securely (file permissions)
5. Unknown agent → attestation fails → Trust Level 0

### Risks

| Risk | L/I | Mitigation |
|------|-----|------------|
| Key compromise | L/H | File permissions, warn on insecure |
| Performance overhead | L/L | Ed25519 is fast (~15k ops/sec) |
| Key distribution | M/M | Manual exchange for now |

---

## Phase 3: Architecture

### Components

| Component | Purpose | Files |
|-----------|---------|-------|
| `types.ts` | Identity interfaces | `src/identity/types.ts` |
| `keypair.ts` | Ed25519 key management | `src/identity/keypair.ts` |
| `agent-identity.ts` | Agent's identity bundle | `src/identity/agent-identity.ts` |
| `signer.ts` | JWS signing | `src/identity/signer.ts` |
| `verifier.ts` | Signature verification | `src/identity/verifier.ts` |
| `known-keys.ts` | Trusted public key store | `src/identity/known-keys.ts` |
| `index.ts` | Public exports | `src/identity/index.ts` |

### Data Flow

```
Agent Startup
     │
     ▼
┌─────────────────┐
│ Load/Generate   │
│ KeyPair         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ AgentIdentity   │
│ - agentId       │
│ - publicKey     │
│ - privateKey    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│ Signer          │      │ Verifier        │
│ .sign(data)     │      │ .verify(sig,pk) │
└─────────────────┘      └─────────────────┘
```

### Key Storage Layout

```
~/.openclaw/ha2ha/identity/
├── {agent-id}/
│   ├── private.key      # Ed25519 private key (mode 0600)
│   └── public.key       # Ed25519 public key
└── known-keys/
    ├── {agent-id}.pub   # Trusted public keys
    └── registry.json    # Key metadata
```

### Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Algorithm | Ed25519 | Modern, fast, compact keys |
| Library | `@noble/ed25519` | Pure JS, audited, no native deps |
| Key format | Base64 | Standard, human-readable |
| Signature format | JWS (compact) | A2A compatibility |

---

## Phase 4: Dependency Analysis

```
types.ts ──────────────────┐
                           ▼
keypair.ts ───────────► agent-identity.ts
    │                      │
    ▼                      ▼
signer.ts ◄────────────► verifier.ts
                           │
                           ▼
                      known-keys.ts
                           │
                           ▼
                        index.ts
```

**Build Order:**
1. `types.ts` (no deps)
2. `keypair.ts` (needs types)
3. `agent-identity.ts` (needs types, keypair)
4. `signer.ts` (needs types, keypair)
5. `verifier.ts` (needs types)
6. `known-keys.ts` (needs types, verifier)
7. `index.ts` (exports)

---

## Phase 5: File Ownership

| File | Owner | Permission |
|------|-------|------------|
| `src/identity/types.ts` | crypto-identity agent | CREATE |
| `src/identity/keypair.ts` | crypto-identity agent | CREATE |
| `src/identity/agent-identity.ts` | crypto-identity agent | CREATE |
| `src/identity/signer.ts` | crypto-identity agent | CREATE |
| `src/identity/verifier.ts` | crypto-identity agent | CREATE |
| `src/identity/known-keys.ts` | crypto-identity agent | CREATE |
| `src/identity/index.ts` | crypto-identity agent | CREATE |
| `src/index.ts` | crypto-identity agent | MODIFY (add export) |

---

## Phase 6: Implementation Spec

### types.ts

```typescript
export interface KeyPairData {
  publicKey: string;   // Base64
  privateKey: string;  // Base64
  createdAt: string;   // ISO 8601
  algorithm: 'Ed25519';
}

export interface AgentIdentityData {
  agentId: string;
  displayName?: string;
  keyPair: KeyPairData;
  createdAt: string;
  lastUsed?: string;
}

export interface JWSHeader {
  alg: 'EdDSA';
  kid: string;  // Key ID (agent ID)
}

export interface JWSSignature {
  protected: string;   // Base64url(JSON(header))
  signature: string;   // Base64url(signature)
}

export interface SignedAgentCard {
  // A2A Agent Card fields
  name: string;
  version: string;
  capabilities: Record<string, unknown>;
  
  // HA2HA extensions
  ha2ha: {
    publicKey: string;
    attestation: JWSSignature;
  };
}

export interface KnownKeyEntry {
  agentId: string;
  publicKey: string;
  addedAt: string;
  addedBy: string;  // Human who trusted this key
  trust: 'trusted' | 'provisional' | 'revoked';
}
```

### keypair.ts

```typescript
import * as ed from '@noble/ed25519';

export class KeyPair {
  static async generate(): Promise<KeyPair> { ... }
  static fromPrivateKey(privateKey: Uint8Array): KeyPair { ... }
  static fromBase64(data: KeyPairData): KeyPair { ... }
  
  get publicKey(): Uint8Array { ... }
  get privateKey(): Uint8Array { ... }
  
  toBase64(): KeyPairData { ... }
  async save(path: string): Promise<void> { ... }
  static async load(path: string): Promise<KeyPair> { ... }
}
```

### signer.ts

```typescript
export class Signer {
  constructor(keyPair: KeyPair, agentId: string) { ... }
  
  async sign(data: Uint8Array | string): Promise<JWSSignature> { ... }
  async signAgentCard(card: Partial<SignedAgentCard>): Promise<SignedAgentCard> { ... }
  async signMessage(message: unknown): Promise<string> { ... }
}
```

### verifier.ts

```typescript
export class Verifier {
  static async verify(
    signature: JWSSignature,
    data: Uint8Array | string,
    publicKey: Uint8Array
  ): Promise<boolean> { ... }
  
  static async verifyAgentCard(card: SignedAgentCard): Promise<boolean> { ... }
}
```

### known-keys.ts

```typescript
export class KnownKeys {
  constructor(storePath: string) { ... }
  
  async load(): Promise<void> { ... }
  async save(): Promise<void> { ... }
  
  add(entry: KnownKeyEntry): void { ... }
  get(agentId: string): KnownKeyEntry | null { ... }
  revoke(agentId: string, reason: string): void { ... }
  
  isTrusted(agentId: string): boolean { ... }
  getPublicKey(agentId: string): Uint8Array | null { ... }
}
```

---

## Phase 7: QA Criteria

### Unit Tests

| Test | Description |
|------|-------------|
| `keypair.test.ts` | Generate, save, load keypairs |
| `signer.test.ts` | Sign data, verify signature matches |
| `verifier.test.ts` | Verify valid sigs, reject invalid |
| `agent-card.test.ts` | Sign and verify Agent Cards |
| `known-keys.test.ts` | Add, get, revoke known keys |

### Integration Tests

| Test | Description |
|------|-------------|
| `attestation-flow.test.ts` | Full attestation verification |
| `unknown-agent.test.ts` | Unknown key → Block |

### Acceptance Criteria

- [ ] `npm test` passes all identity module tests
- [ ] Agent keypair saved to `~/.openclaw/ha2ha/identity/{id}/`
- [ ] Private key has mode 0600 (owner read/write only)
- [ ] Signed Agent Card verifies correctly
- [ ] Unknown agent (no known key) fails attestation

---

## Delegation Brief

**Agent:** comms (Luca-Comms)
**Task:** Implement Gap 2: Cryptographic Identity

**Inputs:**
- This plan document
- Spec §8.6 from SPECIFICATION.md
- Protobuf definitions from ha2ha.proto

**Outputs:**
- `src/identity/` directory with all files
- Unit tests in `src/identity/__tests__/`
- Updated `src/index.ts` with identity exports

**Dependencies:**
- `@noble/ed25519` package (add to package.json)

**Success:** All tests pass, keypairs generate and persist correctly.
