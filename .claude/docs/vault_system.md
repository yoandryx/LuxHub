# LuxHub Vault System

## Overview

The LuxHub Vault is a centralized inventory management system for NFTs minted by LuxHub admins. It provides:
- Multi-admin minting with optional multisig approval
- Authenticity verification for genuine LuxHub mints
- Inventory tracking and distribution management
- Full audit trail of all vault operations

## Architecture

### Database Models

| Model | Purpose |
|-------|---------|
| `Vendor` (isOfficial=true) | LuxHub Official Vault vendor account |
| `VaultConfig` | Multisig settings, admin list, thresholds |
| `VaultInventory` | Individual NFT records with history |
| `VaultActivity` | Audit log of all operations |

### Key Addresses (Production)

| Address Type | Value | Purpose |
|--------------|-------|---------|
| **NFT Vault PDA** | `2j9P1LAwCdgr7Ti7e2PLxg3KuApPg7heD28WXQG958zo` | Central address where NFTs are held (Index 1) |
| **Multisig** | `H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7` | Squads multisig for approvals |
| **Treasury Vault** | (Index 0) | SOL/tokens treasury (separate from NFTs) |

### Environment Variables

```env
NEXT_PUBLIC_VAULT_PDA=2j9P1LAwCdgr7Ti7e2PLxg3KuApPg7heD28WXQG958zo
NEXT_PUBLIC_SQUADS_MSIG=H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7
LUXHUB_VENDOR_ID=697f7ec977f00390b3ca4e59
LUXHUB_VAULT_CONFIG_ID=697f7ec977f00390b3ca4e5e
```

## Minting Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN MINTS NFT                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Metadata created with LuxHub verification fields        │
│  2. Image + Metadata uploaded to Irys                       │
│  3. NFT minted on Solana (mpl-core)                        │
│  4. Asset saved to MongoDB (vendor = LuxHub Official)       │
│  5. VaultInventory record created (tracks NFT in vault)     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  NFT SITS IN VAULT                          │
│  - Status: "minted"                                         │
│  - Can be: listed, transferred, pooled, airdropped          │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      Transfer to      List for       Add to Pool
        Vendor          Sale         (fractional)
```

## Multisig Integration

The multisig address is referenced for approval workflows:

| Action | Threshold | Behavior |
|--------|-----------|----------|
| Minting | `mintApprovalThreshold` (default: 1) | Single admin can mint |
| Transfers | `transferApprovalThreshold` (default: 2) | Creates Squads proposal |
| Config changes | Super admin only | Immediate |

To require multisig approval for minting, set `mintApprovalThreshold` to 2+.

## API Endpoints

### Public

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/verify/nft?mint=<address>` | GET | Verify NFT authenticity |

### Admin (requires auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vault/config` | GET | Get vault configuration |
| `/api/vault/config` | PATCH | Update config, add/remove admins |
| `/api/vault/inventory` | GET | List vault holdings |
| `/api/vault/mint` | POST | Record new mint in inventory |
| `/api/vault/transfer` | POST | Transfer NFT from vault |
| `/api/vault/activity` | GET | Get activity audit log |

## Authenticity Verification

### How It Works

1. **On-Chain Markers**:
   - Verified creator = vault/multisig address
   - Collection membership = LuxHub Verified Collection
   - Metadata attributes: `"LuxHub Verified": "Yes"`, `"Vault Mint": "Official"`

2. **Database Registry**:
   - All legitimate mints stored in `VaultInventory`
   - `/api/verify/nft` checks both on-chain and database

3. **Verification Levels**:
   - **Full**: In DB + verified creator + in collection + minted by vault
   - **Partial**: Some checks pass
   - **Unverified**: Not in LuxHub registry (potential fake)

### Metadata Verification Fields

```json
{
  "attributes": [
    { "trait_type": "LuxHub Verified", "value": "Yes" },
    { "trait_type": "Vault Mint", "value": "Official" },
    { "trait_type": "Vault Address", "value": "<vault_pda>" }
  ],
  "collection": {
    "name": "LuxHub Verified Timepieces",
    "family": "LuxHub"
  },
  "luxhub_verification": {
    "verified": true,
    "vault_address": "<vault_pda>",
    "minted_by": "<admin_wallet>",
    "minted_at": "<timestamp>",
    "verification_url": "https://luxhub.io/verify?mint="
  }
}
```

## Setup

### 1. Run Seed Script

```bash
node scripts/seedLuxHubVault.mjs
```

This creates:
- LuxHub Official Vendor (username: `luxhub-vault`)
- VaultConfig with initial admin

### 2. Add Environment Variables

```env
LUXHUB_VENDOR_ID=<vendor_id_from_script>
LUXHUB_VAULT_CONFIG_ID=<config_id_from_script>
LUXHUB_VAULT_PDA=<squads_vault_pda_or_central_wallet>
```

### 3. Configure Vault Address (Central NFT Storage)

See "Configuring the Vault Address" section below.

### 4. Optional: Create Verified Collection

1. Mint a collection NFT on-chain
2. Update vault config:
   ```
   PATCH /api/vault/config
   { "collectionMint": "<collection_mint_address>" }
   ```

## Configuring the Vault Address

The vault address is where newly minted NFTs are owned. Options:

### Option A: Squads Multisig Vault (Recommended)

NFTs minted directly to a Squads vault PDA. Requires multisig approval to transfer.

```env
LUXHUB_VAULT_PDA=<squads_vault_pda>
NEXT_PUBLIC_SQUADS_MSIG=<squads_multisig_address>
```

### Option B: Single Treasury Wallet

NFTs minted to a single LuxHub-controlled wallet.

```env
LUXHUB_VAULT_PDA=<treasury_wallet_address>
```

### Option C: Mint to Admin, Auto-Transfer to Vault

NFTs minted to admin wallet, then immediately transferred to vault.
Useful when vault is a PDA that can't sign transactions.

## Managing Admins

### Add Admin
```bash
curl -X PATCH /api/vault/config \
  -H "Authorization: Bearer <token>" \
  -d '{"addAdmin": {"walletAddress": "...", "name": "Admin 2", "role": "admin"}}'
```

### Remove Admin
```bash
curl -X PATCH /api/vault/config \
  -H "Authorization: Bearer <token>" \
  -d '{"removeAdmin": "wallet_address_to_remove"}'
```

### Admin Roles

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access, can modify config and other admins |
| `admin` | Can mint, transfer, manage inventory |
| `minter` | Can only mint NFTs |

## Inventory Management

### List Vault Holdings
```bash
GET /api/vault/inventory?status=minted&page=1&limit=20
```

### Transfer NFT
```bash
POST /api/vault/transfer
{
  "nftMint": "<mint_address>",
  "destinationType": "vendor|user|pool|airdrop",
  "destinationWallet": "<recipient_wallet>",
  "reason": "Sold to customer"
}
```

### Inventory Statuses

| Status | Description |
|--------|-------------|
| `minted` | Just minted, in vault |
| `pending_review` | Awaiting admin review |
| `ready_to_list` | Approved for listing |
| `listed` | Listed for sale |
| `pending_transfer` | Transfer initiated (awaiting multisig) |
| `transferred` | Sent to recipient |
| `pooled` | Added to investment pool |
| `reserved` | Reserved for specific purpose |

## Files

| File | Purpose |
|------|---------|
| `src/lib/models/LuxHubVault.ts` | Mongoose models |
| `src/lib/models/Vendor.ts` | Vendor model (with isOfficial) |
| `src/pages/api/vault/*.ts` | API endpoints |
| `src/pages/api/verify/nft.ts` | Public verification endpoint |
| `src/utils/metadata.ts` | Metadata with verification fields |
| `scripts/seedLuxHubVault.mjs` | Setup script |
