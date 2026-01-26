// /lib/models/ConditionUpdate.ts
// Tracks condition updates from watch holders (buyers, vendors, pool participants)
// LuxHub requires periodic condition updates to maintain NFT validity
import mongoose from 'mongoose';

const ConditionUpdateSchema = new mongoose.Schema(
  {
    // NFT identification
    mintAddress: { type: String, required: true, index: true },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },

    // Who submitted the update
    submittedBy: { type: String, required: true }, // Wallet address
    submitterRole: {
      type: String,
      enum: ['buyer', 'vendor', 'pool_holder', 'luxhub_custody', 'admin'],
      required: true,
    },

    // Update details
    updateType: {
      type: String,
      enum: [
        'routine_check', // Regular periodic update
        'condition_change', // Watch condition changed
        'service_performed', // Watch was serviced
        'damage_report', // Damage discovered
        'verification_request', // LuxHub requested verification
        'ownership_transfer', // Update during ownership change
        'inspection', // Professional inspection
        'authentication', // Re-authentication
      ],
      required: true,
    },

    // Condition assessment
    condition: {
      type: String,
      enum: ['New', 'Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Non-functional'],
      required: true,
    },
    previousCondition: { type: String },
    conditionNotes: { type: String },

    // Evidence/proof
    photoUrls: [{ type: String }], // IPFS CIDs or URLs
    photoUploadedAt: { type: Date },
    videoUrl: { type: String },

    // Watch-specific details
    functioningProperly: { type: Boolean },
    timekeepingAccuracy: { type: String }, // e.g., "+2 sec/day"
    visibleDamage: { type: Boolean, default: false },
    damageDescription: { type: String },
    serviceRequired: { type: Boolean, default: false },
    serviceNotes: { type: String },

    // Service history (if service was performed)
    servicePerformed: {
      serviceDate: Date,
      serviceProvider: String,
      serviceType: String, // e.g., "Full service", "Battery replacement", "Crystal replacement"
      serviceCost: Number,
      serviceProofUrl: String, // Receipt or certificate
      warrantyExtended: Boolean,
      newWarrantyExpiry: Date,
    },

    // Location verification (optional)
    locationCountry: { type: String },
    locationCity: { type: String },

    // Verification status
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'requires_more_info', 'flagged'],
      default: 'pending',
    },
    verifiedBy: { type: String },
    verifiedAt: { type: Date },
    verificationNotes: { type: String },
    rejectionReason: { type: String },

    // Request tracking (if this was requested by LuxHub)
    wasRequested: { type: Boolean, default: false },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConditionUpdateRequest' },
    requestedAt: { type: Date },
    requestDeadline: { type: Date },
    isOverdue: { type: Boolean, default: false },

    // Impact on NFT
    metadataUpdated: { type: Boolean, default: false },
    newMetadataUri: { type: String },
    nftFrozenDueToIssue: { type: Boolean, default: false },
    freezeActionId: { type: mongoose.Schema.Types.ObjectId, ref: 'NFTAuthorityAction' },
  },
  { timestamps: true }
);

// Indexes
ConditionUpdateSchema.index({ mintAddress: 1, createdAt: -1 });
ConditionUpdateSchema.index({ submittedBy: 1 });
ConditionUpdateSchema.index({ status: 1 });
ConditionUpdateSchema.index({ updateType: 1 });
ConditionUpdateSchema.index({ isOverdue: 1, status: 1 });

// Virtual to check if update is overdue
ConditionUpdateSchema.virtual('overdueDays').get(function () {
  if (!this.requestDeadline) return 0;
  const now = new Date();
  if (now <= this.requestDeadline) return 0;
  return Math.floor((now.getTime() - this.requestDeadline.getTime()) / (1000 * 60 * 60 * 24));
});

// Static: Get latest update for an NFT
ConditionUpdateSchema.statics.getLatestForNFT = function (mintAddress: string) {
  return this.findOne({ mintAddress, status: 'verified' }).sort({ createdAt: -1 });
};

// Static: Get overdue updates
ConditionUpdateSchema.statics.getOverdueUpdates = function () {
  return this.find({
    status: 'pending',
    wasRequested: true,
    requestDeadline: { $lt: new Date() },
  });
};

export default mongoose.models.ConditionUpdate ||
  mongoose.model('ConditionUpdate', ConditionUpdateSchema);

// ===========================
// Condition Update Request Model
// For when LuxHub requests an update from a holder
// ===========================

const ConditionUpdateRequestSchema = new mongoose.Schema(
  {
    // NFT identification
    mintAddress: { type: String, required: true, index: true },
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },

    // Who is being requested
    requestedFrom: { type: String, required: true }, // Wallet address
    requestedFromRole: {
      type: String,
      enum: ['buyer', 'vendor', 'pool_holder', 'luxhub_custody'],
    },

    // Request details
    requestType: {
      type: String,
      enum: [
        'routine', // Regular periodic check (e.g., every 6 months)
        'post_purchase', // After purchase
        'post_transfer', // After ownership transfer
        'verification', // LuxHub needs to verify
        'complaint', // Someone reported an issue
        'random_audit', // Random audit
        'condition_concern', // Concern about condition
      ],
      required: true,
    },

    // Timing
    requestedAt: { type: Date, default: Date.now },
    deadline: { type: Date, required: true },
    remindersSent: { type: Number, default: 0 },
    lastReminderAt: { type: Date },

    // Status
    status: {
      type: String,
      enum: ['pending', 'submitted', 'overdue', 'cancelled', 'exempted'],
      default: 'pending',
    },

    // Submitted update reference
    submittedUpdateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConditionUpdate' },
    submittedAt: { type: Date },

    // If overdue, what action was taken
    overdueAction: {
      type: String,
      enum: ['reminder_sent', 'final_warning', 'nft_frozen', 'pending_burn', 'exempted'],
    },
    overdueActionAt: { type: Date },
    freezeActionId: { type: mongoose.Schema.Types.ObjectId, ref: 'NFTAuthorityAction' },

    // Request notes
    notes: { type: String },
    requestedBy: { type: String }, // Admin who created the request (for manual requests)
  },
  { timestamps: true }
);

// Indexes
ConditionUpdateRequestSchema.index({ mintAddress: 1, status: 1 });
ConditionUpdateRequestSchema.index({ requestedFrom: 1, status: 1 });
ConditionUpdateRequestSchema.index({ deadline: 1, status: 1 });
ConditionUpdateRequestSchema.index({ status: 1, deadline: 1 });

// Static: Get pending requests for a wallet
ConditionUpdateRequestSchema.statics.getPendingForWallet = function (wallet: string) {
  return this.find({
    requestedFrom: wallet,
    status: { $in: ['pending', 'overdue'] },
  }).sort({ deadline: 1 });
};

// Static: Get overdue requests
ConditionUpdateRequestSchema.statics.getOverdue = function () {
  return this.find({
    status: 'pending',
    deadline: { $lt: new Date() },
  });
};

export const ConditionUpdateRequest =
  mongoose.models.ConditionUpdateRequest ||
  mongoose.model('ConditionUpdateRequest', ConditionUpdateRequestSchema);
