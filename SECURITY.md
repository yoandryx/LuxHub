# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in LuxHub, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email: **security@luxhub.gold**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Stage | Timeframe |
|-------|-----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix development | Depends on severity |
| Public disclosure | After fix is deployed |

### Scope

The following are in scope for security reports:

- Smart contract vulnerabilities (Anchor program)
- API endpoint security issues
- Authentication/authorization bypasses
- Data exposure or PII leaks
- Escrow fund manipulation
- Cross-site scripting (XSS) or injection attacks

### Out of Scope

- Social engineering attacks
- Denial of service (DoS)
- Issues in third-party dependencies (report upstream)
- Issues requiring physical access

---

## Security Architecture

LuxHub implements defense-in-depth across multiple layers:

### On-Chain Security
- **Escrow PDA** — funds locked in program-owned accounts, not LuxHub wallets
- **Squads Protocol v4** — M-of-N multisig approval for all treasury operations
- **CPI verification** — `confirm_delivery` validates Squads proposal origin
- **Timeout enforcement** — auto-cancel escrows after 14 days without shipment

### Off-Chain Security
- **Wallet signature auth** — Ed25519 verification on protected endpoints (`walletAuth.ts`)
- **PII encryption** — AES-256-GCM with 64-char hex key for shipping addresses (`encryption.ts`)
- **JWT tokens** — 32+ character secret for session management
- **Rate limiting** — 10 req/min AI, 30 req/min purchase, 100 req/min general
- **Admin authorization** — `ADMIN_WALLETS` env var gates sensitive operations
- **TX verification** — all fund movements verified on Solana before database update (`txVerification.ts`)

### Compliance
- Securities-compliant language enforced via lint rules (`lint-sec-language.cjs`)
- 7-day SLA dispute resolution with admin escalation
- Vendor verification with invite-code gating

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x (current) | Yes |
| < 0.3.0 | No |
