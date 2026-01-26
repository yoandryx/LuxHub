// /lib/models/NFTAuthorityAction.ts
// Tracks all authority actions (freeze, thaw, burn, update) on NFTs
import mongoose from 'mongoose';

const NFTAuthorityActionSchema = new mongoose.Schema(
  {
    // NFT identification
    mintAddress: { type: String, required: true, index: true },

    // Action details
    action: {
      type: String,
      required: true,
      enum: ['freeze', 'thaw', 'burn', 'update_metadata', 'admin_transfer', 'revoke_authority'],
    },
    reason: { type: String, required: true },

    // Who performed the action
    performedBy: { type: String, required: true }, // Admin wallet or email
    performedAt: { type: Date, required: true, default: Date.now },

    // Owner info
    previousOwner: { type: String },
    newOwner: { type: String }, // For transfers

    // Notification
    notifyOwner: { type: Boolean, default: true },
    ownerNotifiedAt: { type: Date },
    notificationMethod: { type: String, enum: ['email', 'wallet_message', 'in_app'] },

    // Status tracking
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'partial', 'reverted'],
      default: 'pending',
    },
    errorMessage: { type: String },

    // On-chain transaction details
    transactionSignature: { type: String },
    blockTime: { type: Number },

    // Squads integration (for multisig actions)
    squadsProposalIndex: { type: Number },
    squadsProposalStatus: { type: String },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // For update_metadata actions - track what changed
    previousUri: { type: String },
    newUri: { type: String },

    // For burns - preserve record of what was destroyed
    burnedAssetData: {
      name: String,
      uri: String,
      attributes: mongoose.Schema.Types.Mixed,
    },

    // Related records
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    escrowPda: { type: String },
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pool' },
  },
  { timestamps: true }
);

// Indexes for efficient queries
NFTAuthorityActionSchema.index({ mintAddress: 1, action: 1 });
NFTAuthorityActionSchema.index({ performedBy: 1, performedAt: -1 });
NFTAuthorityActionSchema.index({ status: 1 });
NFTAuthorityActionSchema.index({ action: 1, createdAt: -1 });

// Static method to get action history for an NFT
NFTAuthorityActionSchema.statics.getHistoryForNFT = function (mintAddress: string) {
  return this.find({ mintAddress }).sort({ performedAt: -1 });
};

// Static method to get recent actions by admin
NFTAuthorityActionSchema.statics.getRecentByAdmin = function (adminWallet: string, limit = 50) {
  return this.find({ performedBy: adminWallet }).sort({ performedAt: -1 }).limit(limit);
};

export default mongoose.models.NFTAuthorityAction ||
  mongoose.model('NFTAuthorityAction', NFTAuthorityActionSchema);
