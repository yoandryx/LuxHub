// src/lib/models/PlatformConfig.ts
// Centralized platform configuration - managed by super_admin
// Replaces env vars for runtime-changeable settings

import { Schema, model, models } from 'mongoose';

const PlatformConfigSchema = new Schema(
  {
    // Unique key for this config (only one active config)
    configKey: { type: String, default: 'main', unique: true },

    // Solana Configuration
    solana: {
      rpcEndpoint: { type: String }, // Can override NEXT_PUBLIC_SOLANA_ENDPOINT
      cluster: { type: String, enum: ['devnet', 'mainnet-beta', 'testnet'], default: 'devnet' },
      programId: { type: String }, // Escrow program ID
    },

    // Squads Multisig Configuration
    multisig: {
      address: { type: String, required: true }, // Main Squads multisig
      treasuryVaultIndex: { type: Number, default: 0 }, // Vault 0 for treasury
      nftVaultIndex: { type: Number, default: 1 }, // Vault 1 for NFTs
      treasuryVaultPda: { type: String },
      nftVaultPda: { type: String },
    },

    // LuxHub Wallet Configuration
    wallets: {
      luxhubWallet: { type: String }, // Main LuxHub wallet
      feeCollector: { type: String }, // Where fees go (usually treasury vault)
    },

    // Platform Settings
    platform: {
      name: { type: String, default: 'LuxHub' },
      feePercentage: { type: Number, default: 3, min: 0, max: 100 }, // Platform fee %
      royaltyPercentage: { type: Number, default: 5, min: 0, max: 100 },
      minListingPrice: { type: Number, default: 0.1 }, // Min SOL
      maxListingPrice: { type: Number, default: 100000 }, // Max SOL
    },

    // Feature Flags
    features: {
      escrowEnabled: { type: Boolean, default: true },
      poolsEnabled: { type: Boolean, default: true },
      aiVerificationEnabled: { type: Boolean, default: true },
      bulkMintEnabled: { type: Boolean, default: true },
      squadsIntegrationEnabled: { type: Boolean, default: true },
    },

    // External Services (store references, not secrets)
    services: {
      ipfsGateway: { type: String, default: 'https://gateway.pinata.cloud/ipfs/' },
      irysGateway: { type: String, default: 'https://gateway.irys.xyz/' },
      solscanBaseUrl: { type: String, default: 'https://solscan.io' },
    },

    // Last updated tracking
    lastUpdatedBy: { type: String },
    lastUpdatedAt: { type: Date, default: Date.now },

    // Config version for migrations
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// Ensure only one config exists
PlatformConfigSchema.index({ configKey: 1 }, { unique: true });

export const PlatformConfig =
  models.PlatformConfig || model('PlatformConfig', PlatformConfigSchema);

export default PlatformConfig;
