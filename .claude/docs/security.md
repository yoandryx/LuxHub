# LuxHub Security Implementation

**Last Updated:** February 2026
**Status:** Implemented

## Overview

LuxHub implements a hybrid security model combining Web3 wallet-based authentication with traditional encryption for sensitive data. This document describes the security measures in place to protect user data and ensure secure transactions.

---

## Architecture

### Data Classification

| Data Type | Storage | Protection |
|-----------|---------|------------|
| **Escrow Funds** | On-chain (Solana) | Decentralized, tamper-proof |
| **NFT Ownership** | On-chain (Solana) | Decentralized, tamper-proof |
| **Treasury Funds** | Squads Multisig | Multi-signature protection |
| **Shipping Addresses** | MongoDB | AES-256-GCM encryption |
| **User Profiles** | MongoDB | Wallet signature auth |
| **Order History** | MongoDB | Wallet signature auth |

### On-Chain Security (Decentralized)

- **Escrow PDA**: Funds locked until delivery confirmation
- **NFT Custody**: Held in escrow vault until release
- **Treasury**: Protected by Squads Protocol multisig
- **Confirm Delivery**: Requires Squads CPI verification (enforced in Anchor program)

### Off-Chain Security (Centralized)

- **Wallet Signature Verification**: Proves wallet ownership
- **PII Encryption**: AES-256-GCM for sensitive fields
- **Admin Authorization**: Role-based access for sensitive operations

---

## Wallet Signature Authentication

### How It Works

1. Client requests a nonce from `/api/auth/nonce`
2. Server generates a unique, time-limited nonce (5 minutes)
3. Client signs the nonce with their Solana wallet
4. Client includes wallet + signature in subsequent API calls
5. Server verifies signature using ed25519 cryptography

### Files

| File | Purpose |
|------|---------|
| `src/lib/middleware/walletAuth.ts` | Core authentication middleware |
| `src/pages/api/auth/nonce.ts` | Nonce generation endpoint |

### Usage in Components

```typescript
// Frontend: Sign nonce with wallet
const message = nonce; // From /api/auth/nonce
const encodedMessage = new TextEncoder().encode(message);
const signature = await wallet.signMessage(encodedMessage);
const signatureBase58 = bs58.encode(signature);

// Include in API calls
fetch('/api/addresses', {
  headers: {
    'x-wallet-address': wallet.publicKey.toBase58(),
    'x-wallet-signature': signatureBase58,
  }
});
```

### Middleware Usage

```typescript
import { withWalletAuth, AuthenticatedRequest } from '@/lib/middleware/walletAuth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Wallet is verified and available
  const wallet = (req as AuthenticatedRequest).wallet;
  // ... handle request
}

export default withWalletAuth(handler);
```

### Protected Endpoints

| Endpoint | Auth Type | Description |
|----------|-----------|-------------|
| `/api/addresses/*` | Wallet Signature | Saved shipping addresses |
| `/api/buyer/orders` | Wallet Signature | Buyer's order history |
| `/api/squads/propose` | Wallet Signature + Admin | Squads transaction proposals |

---

## PII Encryption

### Algorithm

- **Cipher**: AES-256-GCM (Galois/Counter Mode)
- **IV**: 16 bytes (randomized per encryption)
- **Auth Tag**: 16 bytes (integrity verification)
- **Key Derivation**: scrypt from environment variable

### Encrypted Fields

```typescript
const PII_FIELDS = [
  'fullName',
  'street1',
  'street2',
  'phone',
  'email',
  'deliveryInstructions',
];
```

### Files

| File | Purpose |
|------|---------|
| `src/lib/security/encryption.ts` | Core encryption utilities |

### Usage

```typescript
import { encrypt, decrypt, encryptFields, decryptFields } from '@/lib/security/encryption';

// Encrypt single field
const encrypted = encrypt('John Doe');

// Decrypt single field
const decrypted = decrypt(encrypted);

// Encrypt multiple fields in object
const secureData = encryptFields(address, ['fullName', 'phone', 'email']);

// Decrypt multiple fields
const plainData = decryptFields(secureData, ['fullName', 'phone', 'email']);
```

### Storage Format

Encrypted values are stored as: `iv:authTag:ciphertext` (all base64)

Example:
```
kJx8kT9pM2nQ3rS0:wX7yZ9aB2cD4eF6g:hI8jK0lM2nO4pQ6rS8tU0
```

### Backwards Compatibility

The decryption function automatically detects if data is encrypted (by checking for the `iv:authTag:ciphertext` format) and returns plaintext as-is if not encrypted. This allows gradual migration of existing data.

---

## Environment Variables

### Required for Production

```bash
# PII Encryption (REQUIRED - generate with generateEncryptionKey())
PII_ENCRYPTION_KEY=<64-char-hex-string>

# Optional: Salt for searchable hashes
PII_HASH_SALT=<random-string>

# Admin wallets (comma-separated)
ADMIN_WALLETS=wallet1,wallet2,wallet3

# JWT Secret (min 32 chars)
JWT_SECRET=<secure-random-string>
```

### Generating Encryption Key

```typescript
import { generateEncryptionKey } from '@/lib/security/encryption';

const key = generateEncryptionKey();
console.log('PII_ENCRYPTION_KEY=' + key);
// Output: PII_ENCRYPTION_KEY=a1b2c3d4e5f6...
```

---

## Admin Authorization

### Admin Verification

Admins are verified through two methods:
1. **Environment Variable**: Wallet in `ADMIN_WALLETS` env var
2. **Database Role**: User document with `role: 'admin'`

### Protected Admin Endpoints

| Endpoint | Protection |
|----------|------------|
| `/api/squads/propose` | Wallet signature + admin check |
| `/api/escrow/verify-shipment` | Admin check |
| `/api/admin/*` | Admin check |

---

## Security Checklist

### Before Production

- [ ] Set `PII_ENCRYPTION_KEY` to a secure random 64-char hex string
- [ ] Set `JWT_SECRET` to a secure random string (min 32 chars)
- [ ] Configure `ADMIN_WALLETS` with authorized admin wallets
- [ ] Remove any default/fallback keys from environment
- [ ] Enable HTTPS for all endpoints
- [ ] Set up Redis for rate limiting (replace in-memory store)
- [ ] Rotate any exposed API keys
- [ ] Review all endpoints without auth and add protection

### API Security

- [x] Wallet signature verification for user data
- [x] PII encryption for sensitive fields
- [x] Admin authorization for Squads operations
- [x] Rate limiting middleware (upgrade to Redis for production)
- [ ] Request validation with Zod (partially implemented)
- [ ] Comprehensive audit logging

### Database Security

- [x] Field-level encryption for PII
- [ ] Database-level encryption at rest
- [ ] Automatic data retention/purging policies
- [ ] Searchable indexes on hashed fields (for encrypted search)

---

## API Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| `WALLET_REQUIRED` | No wallet address provided | Include x-wallet-address header |
| `SIGNATURE_REQUIRED` | No signature, nonce returned | Sign nonce and retry |
| `INVALID_SIGNATURE` | Bad or expired signature | Request new nonce |
| `INVALID_WALLET` | Malformed wallet address | Check wallet format |
| `ADMIN_REQUIRED` | Admin access needed | Use admin wallet |

---

## Nonce Flow Diagram

```
┌─────────────┐     1. GET /api/auth/nonce?wallet=xxx     ┌─────────────┐
│   Client    │ ─────────────────────────────────────────▶│   Server    │
│  (Wallet)   │                                           │             │
│             │◀───────────────────────────────────────── │             │
└─────────────┘     2. { nonce: "LuxHub-Auth-..." }       └─────────────┘
      │                                                          │
      │ 3. Sign nonce                                            │
      │    with wallet                                           │
      ▼                                                          │
┌─────────────┐                                                  │
│  Signature  │                                                  │
│  (base58)   │                                                  │
└─────────────┘                                                  │
      │                                                          │
      │ 4. API call with headers:                                │
      │    x-wallet-address: xxx                                 │
      │    x-wallet-signature: yyy                               │
      ▼                                                          ▼
┌─────────────┐     5. Verify signature                  ┌─────────────┐
│   Client    │ ─────────────────────────────────────────▶│   Server    │
│             │                                           │             │
│             │◀───────────────────────────────────────── │             │
└─────────────┘     6. Protected data response           └─────────────┘
```

---

## Files Reference

| File | Description |
|------|-------------|
| `src/lib/middleware/walletAuth.ts` | Wallet signature middleware |
| `src/lib/security/encryption.ts` | AES-256-GCM encryption |
| `src/pages/api/auth/nonce.ts` | Nonce generation endpoint |
| `src/pages/api/addresses/index.ts` | Secured addresses API |
| `src/pages/api/addresses/[id].ts` | Secured address CRUD |
| `src/pages/api/addresses/default.ts` | Secured default address |
| `src/pages/api/buyer/orders.ts` | Secured buyer orders |
| `src/pages/api/squads/propose.ts` | Admin-only Squads proposals |

---

## Future Improvements

1. **Redis for Nonce Storage**: Replace in-memory Map with Redis for multi-instance deployments
2. **Hardware Security Module**: Use HSM or cloud KMS for key management
3. **Database Encryption**: Enable MongoDB field-level encryption
4. **Audit Logging**: Comprehensive logs for security-sensitive operations
5. **Rate Limiting**: Upgrade to Redis-backed rate limiting
6. **Session Tokens**: Consider JWT sessions after initial wallet verification
