# Identity Module

**Implements §8.6 Cryptographic Attestation from HA2HA Specification**

This module provides Ed25519 cryptographic identity for agents, including keypair generation, signing, and verification.

## Overview

Every HA2HA agent has a cryptographic identity consisting of:
- **Agent ID**: Human-readable identifier (e.g., `my-agent.company.ha2ha`)
- **Ed25519 Keypair**: For signing and verification
- **Attestation**: Signed Agent Cards prove identity

## Key Types

### AgentIdentity

The main class representing an agent's cryptographic identity:

```typescript
interface AgentIdentityData {
  agentId: string;
  displayName?: string;
  keyPair: KeyPairData;
  createdAt: string;
  lastUsed?: string;
}
```

### KeyPairData

Serializable keypair for persistence:

```typescript
interface KeyPairData {
  publicKey: string;    // Base64-encoded (32 bytes)
  privateKey: string;   // Base64-encoded (32 bytes seed)
  createdAt: string;    // ISO 8601
  algorithm: 'Ed25519';
}
```

### JWSSignature

JSON Web Signature format for attestations:

```typescript
interface JWSSignature {
  protected: string;  // Base64url-encoded header
  signature: string;  // Base64url-encoded signature
}
```

## Usage

### Creating an Agent Identity

```typescript
import { AgentIdentity } from '@ha2ha/reference';

// Generate new identity
const identity = AgentIdentity.generate(
  'my-agent.company.ha2ha',
  'My Agent'
);

// Or load from disk (creates if not exists)
const identity = await AgentIdentity.loadOrCreate(
  './keys',
  'my-agent.company.ha2ha',
  'My Agent'
);

// Save to disk
await identity.save('./keys');
```

### Signing Messages

```typescript
// Sign arbitrary data
const signature = await identity.sign(JSON.stringify(payload));

// Sign with detached header
const jws = await identity.signJws(payload);
// Returns: { protected: '...', signature: '...' }
```

### Verifying Signatures

```typescript
import { verifySignature, verifyJws } from '@ha2ha/reference';

// Verify raw signature
const valid = await verifySignature(
  data,
  signature,
  identity.publicKeyBase64
);

// Verify JWS
const valid = await verifyJws(payload, jws, identity.publicKeyBase64);
```

### Known Keys Registry

Manage trusted public keys:

```typescript
import { KnownKeysRegistry } from '@ha2ha/reference';

// Load or create registry
const registry = await KnownKeysRegistry.load('./known-keys.json');

// Add a known key (human approval)
await registry.add({
  agentId: 'peer-agent.example.ha2ha',
  publicKey: peerPublicKey,
  addedBy: 'admin@company.ha2ha',
  trust: 'trusted',
});

// Lookup a key
const entry = registry.get('peer-agent.example.ha2ha');
if (entry && entry.trust === 'trusted') {
  // Proceed with verification
}

// Revoke a key
registry.revoke('peer-agent.example.ha2ha', 'Key compromised');
```

## Attestation Flow

1. **Agent generates keypair** on first run
2. **Agent Card includes public key** in `ha2ha.publicKey`
3. **Agent signs the card** and includes signature in `ha2ha.attestation`
4. **Peers verify signature** using the embedded public key
5. **Trust is established** based on signature validity and key trust level

```typescript
import { AgentCardBuilder } from '@ha2ha/reference/a2a';

// Build signed Agent Card
const card = await new AgentCardBuilder(identity)
  .setName('My Agent')
  .setVersion('1.0.0')
  .addHa2haExtension({ trustLevelRequired: 2 })
  .build();

// Card includes:
// - card.ha2ha.publicKey (Base64-encoded)
// - card.ha2ha.attestation (JWS signature)
```

## Security Considerations

- Private keys are stored with restricted permissions
- Use secure random for key generation (via @noble/ed25519)
- Never log or expose private keys
- Rotate keys periodically (max 1 year validity per spec)

## Spec References

- **§8.6.1** Agent Card Signing - Signature requirements
- **§8.6.2** Certificate Requirements - Key specifications
- **§8.6.3** Attestation Verification - Verification flow
