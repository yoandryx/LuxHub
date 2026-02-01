// src/lib/models/LuxHubVault.ts
// Central vault for LuxHub-owned NFTs with multisig control

import { Schema, model, models } from 'mongoose';

/**
 * LuxHub Vault Configuration
 * Stores the official LuxHub vault settings and multisig info
 */
const VaultConfigSchema = new Schema(
  {
    // Squads multisig address controlling the vault
    multisigAddress: { type: String, required: true, unique: true },

    // Vault PDA (derived from multisig)
    vaultPda: { type: String, required: true, index: true },

    // LuxHub Verified Collection mint address
    collectionMint: { type: String, index: true },

    // Collection authority (should match multisig)
    collectionAuthority: { type: String },

    // Admins who can initiate mints (multisig members)
    authorizedAdmins: [
      {
        walletAddress: { type: String, required: true },
        name: { type: String },
        role: { type: String, enum: ['super_admin', 'admin', 'minter'], default: 'minter' },
        addedAt: { type: Date, default: Date.now },
        addedBy: { type: String },
      },
    ],

    // Approval threshold for minting (e.g., 2 of 3)
    mintApprovalThreshold: { type: Number, default: 1 },

    // Approval threshold for transfers/distributions
    transferApprovalThreshold: { type: Number, default: 2 },

    // Stats
    totalMinted: { type: Number, default: 0 },
    totalDistributed: { type: Number, default: 0 },
    currentHoldings: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * Vault Inventory Item
 * Tracks each NFT held in the vault
 */
const VaultInventorySchema = new Schema(
  {
    // NFT identification
    nftMint: { type: String, required: true, unique: true, index: true },
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset', index: true },

    // Metadata snapshot at mint time
    name: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String },
    metadataUri: { type: String },

    // Mint details
    mintedBy: { type: String, required: true }, // Admin wallet who initiated
    mintedAt: { type: Date, default: Date.now },
    mintSignature: { type: String, index: true },

    // Verification status
    isVerifiedCreator: { type: Boolean, default: true },
    inVerifiedCollection: { type: Boolean, default: false },
    collectionMint: { type: String },

    // Current status in vault
    status: {
      type: String,
      enum: [
        'minted', // Just minted, in vault
        'pending_review', // Awaiting admin review
        'ready_to_list', // Approved, can be listed
        'listed', // Listed for sale from vault
        'pending_transfer', // Transfer initiated
        'transferred', // Sent to vendor/user
        'pooled', // Added to investment pool
        'reserved', // Reserved for specific purpose
      ],
      default: 'minted',
      index: true,
    },

    // Listing info (if listed from vault)
    listing: {
      priceSol: { type: Number },
      priceUsd: { type: Number },
      listedAt: { type: Date },
      listedBy: { type: String },
    },

    // Offers received
    offers: [
      {
        offererWallet: { type: String, required: true },
        amountSol: { type: Number, required: true },
        amountUsd: { type: Number },
        offeredAt: { type: Date, default: Date.now },
        expiresAt: { type: Date },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected', 'expired', 'cancelled'],
          default: 'pending',
        },
        message: { type: String },
      },
    ],

    // Distribution/transfer details
    distribution: {
      destinationType: { type: String, enum: ['vendor', 'user', 'pool', 'airdrop'] },
      destinationId: { type: String }, // Vendor ID, User wallet, or Pool ID
      destinationWallet: { type: String },
      transferredAt: { type: Date },
      transferSignature: { type: String },
      transferredBy: { type: String }, // Admin who executed
      reason: { type: String },
    },

    // Pool info (if pooled)
    poolInfo: {
      poolId: { type: Schema.Types.ObjectId, ref: 'Pool' },
      addedAt: { type: Date },
      addedBy: { type: String },
    },

    // Notes and tags for organization
    tags: [{ type: String }],
    notes: { type: String },

    // Audit trail
    history: [
      {
        action: { type: String, required: true },
        performedBy: { type: String, required: true },
        performedAt: { type: Date, default: Date.now },
        details: { type: Schema.Types.Mixed },
        signature: { type: String },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for efficient queries
VaultInventorySchema.index({ status: 1, mintedAt: -1 });
VaultInventorySchema.index({ 'distribution.destinationType': 1 });
VaultInventorySchema.index({ tags: 1 });

/**
 * Vault Activity Log
 * Comprehensive audit trail for all vault operations
 */
const VaultActivitySchema = new Schema(
  {
    activityType: {
      type: String,
      enum: [
        'mint_initiated',
        'mint_approved',
        'mint_completed',
        'mint_failed',
        'transfer_initiated',
        'transfer_approved',
        'transfer_completed',
        'listing_created',
        'listing_cancelled',
        'offer_received',
        'offer_accepted',
        'offer_rejected',
        'pool_added',
        'pool_removed',
        'admin_added',
        'admin_removed',
        'config_updated',
      ],
      required: true,
      index: true,
    },

    // Who performed the action
    performedBy: { type: String, required: true, index: true },

    // Related NFT (if applicable)
    nftMint: { type: String, index: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: 'VaultInventory' },

    // Squads proposal info (if multisig action)
    squadsProposal: {
      proposalId: { type: String },
      status: { type: String },
      approvals: { type: Number },
      threshold: { type: Number },
    },

    // Transaction details
    transactionSignature: { type: String },

    // Additional context
    details: { type: Schema.Types.Mixed },
    notes: { type: String },

    // IP/session tracking for security
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

VaultActivitySchema.index({ createdAt: -1 });
VaultActivitySchema.index({ activityType: 1, createdAt: -1 });

// Pre-save hook to update vault stats
VaultInventorySchema.pre('save', async function (next) {
  if (this.isNew) {
    // Increment holdings on new mint
    await VaultConfig.updateOne(
      {},
      {
        $inc: { totalMinted: 1, currentHoldings: 1 },
      }
    );
  }

  // Add to history
  if (this.isModified('status')) {
    this.history.push({
      action: `status_changed_to_${this.status}`,
      performedBy: 'system',
      performedAt: new Date(),
      details: { newStatus: this.status },
    });
  }

  next();
});

export const VaultConfig = models.VaultConfig || model('VaultConfig', VaultConfigSchema);
export const VaultInventory =
  models.VaultInventory || model('VaultInventory', VaultInventorySchema);
export const VaultActivity = models.VaultActivity || model('VaultActivity', VaultActivitySchema);

// Helper type exports
export type IVaultConfig = typeof VaultConfigSchema;
export type IVaultInventory = typeof VaultInventorySchema;
export type IVaultActivity = typeof VaultActivitySchema;
