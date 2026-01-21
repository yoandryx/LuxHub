// src/models/Pool.ts
import { Schema, model, models } from 'mongoose';

const PoolSchema = new Schema(
  {
    // ========== ASSET REFERENCE ==========
    selectedAssetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    escrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' }, // Source escrow if converted
    escrowPda: { type: String }, // Escrow PDA for quick lookup

    // ========== SOURCE & TYPE ==========
    sourceType: {
      type: String,
      enum: ['dealer', 'luxhub_owned', 'escrow_conversion'],
      required: true,
    },

    // ========== POOL CONFIGURATION ==========
    maxInvestors: { type: Number, required: true },
    minBuyInUSD: { type: Number, required: true },
    totalShares: { type: Number, required: true },
    sharesSold: { type: Number, default: 0 },
    sharePriceUSD: { type: Number }, // Price per share
    targetAmountUSD: { type: Number }, // Total funding target

    // ========== PARTICIPANTS ==========
    participants: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        wallet: { type: String }, // Investor wallet address
        shares: Number,
        ownershipPercent: Number,
        investedUSD: Number,
        projectedReturnUSD: Number,
        investedAt: Date,
        txSignature: String, // Investment transaction
      },
    ],

    // ========== VENDOR PAYMENT (NEW) ==========
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    vendorWallet: { type: String },
    vendorPaidAmount: { type: Number }, // 97% of pool target
    vendorPaidAt: { type: Date },
    vendorPaymentTx: { type: String }, // Transaction signature

    // ========== LUXHUB CUSTODY (NEW) ==========
    custodyStatus: {
      type: String,
      enum: ['pending', 'shipped', 'received', 'verified', 'stored'],
      default: 'pending',
    },
    custodyTrackingCarrier: { type: String },
    custodyTrackingNumber: { type: String },
    custodyProofUrls: [{ type: String }], // Photos of received item
    custodyReceivedAt: { type: Date },
    custodyVerifiedBy: { type: String }, // Admin who verified

    // ========== RESALE (NEW) ==========
    resaleListingPrice: { type: Number }, // LuxHub's listing price for resale
    resaleListingPriceUSD: { type: Number },
    resaleListedAt: { type: Date },
    resaleSoldPrice: { type: Number }, // Actual sale price
    resaleSoldPriceUSD: { type: Number },
    resaleSoldAt: { type: Date },
    resaleBuyerWallet: { type: String },
    resaleTxSignature: { type: String },

    // ========== DISTRIBUTION (NEW) ==========
    distributionStatus: {
      type: String,
      enum: ['pending', 'calculating', 'proposed', 'approved', 'executed', 'completed'],
      default: 'pending',
    },
    distributionAmount: { type: Number }, // Total amount to distribute (97% of resale)
    distributionRoyalty: { type: Number }, // 3% to LuxHub
    distributionProposalIndex: { type: String }, // Squads proposal
    distributionExecutedAt: { type: Date },
    distributions: [
      {
        wallet: { type: String },
        shares: Number,
        ownershipPercent: Number,
        amount: Number, // Amount distributed
        txSignature: String,
        distributedAt: Date,
      },
    ],

    // ========== SQUADS INTEGRATION (NEW) ==========
    squadsProposalIndex: { type: String }, // For pool creation/conversion
    squadsVendorPaymentIndex: { type: String }, // For vendor payment
    squadsDistributionIndex: { type: String }, // For investor distribution

    // ========== BAGS API INTEGRATION (NEW) ==========
    bagsTokenMint: { type: String }, // Pool share token mint via Bags
    bagsFeeShareConfigId: { type: String }, // Bags fee share config ID
    bagsTokenCreatedAt: { type: Date },

    // ========== SECURITY & ADMIN ==========
    securityConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    marketPostedAt: Date,
    projectedROI: Number,
    fractionalMint: String,
    fractionalPda: String,
    burnReason: String,

    // ========== STATUS ==========
    status: {
      type: String,
      enum: [
        'open', // Accepting investments
        'filled', // Target reached, awaiting vendor payment
        'funded', // Vendor paid, awaiting custody
        'custody', // Vendor shipping to LuxHub
        'active', // LuxHub holds asset, pool operational
        'listed', // Asset listed for resale
        'sold', // Asset sold, distribution pending
        'distributing', // Distribution in progress
        'distributed', // All proceeds distributed
        'closed', // Pool finalized
        'failed', // Transaction failed
        'dead', // Pool abandoned
        'burned', // Pool burned/cancelled
      ],
      default: 'open',
      index: true,
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
// Note: status index defined inline with field definition
PoolSchema.index({ escrowId: 1 }); // Find pool by escrow
PoolSchema.index({ vendorWallet: 1 }); // Vendor's pools
PoolSchema.index({ custodyStatus: 1 }); // Custody tracking
PoolSchema.index({ distributionStatus: 1 }); // Distribution tracking
PoolSchema.index({ bagsTokenMint: 1 }); // Bags token lookup

// ========== PRE-SAVE HOOKS ==========
PoolSchema.pre('save', function (next) {
  // Calculate ownership percentages
  if (this.isModified('participants') && this.totalShares > 0) {
    this.participants.forEach((p) => {
      const shares = p.shares ?? 0;
      const invested = p.investedUSD ?? 0;
      p.ownershipPercent = (shares / this.totalShares) * 100;
      p.projectedReturnUSD = invested * (this.projectedROI || 1);
    });

    // Auto-fill when all shares sold
    if (this.sharesSold >= this.totalShares && this.status === 'open') {
      this.status = 'filled';
    }
  }

  // Calculate share price if not set
  if (!this.sharePriceUSD && this.targetAmountUSD && this.totalShares) {
    this.sharePriceUSD = this.targetAmountUSD / this.totalShares;
  }

  // Calculate vendor payment (97% of target)
  if (
    this.isModified('status') &&
    this.status === 'funded' &&
    !this.vendorPaidAmount &&
    this.targetAmountUSD
  ) {
    this.vendorPaidAmount = this.targetAmountUSD * 0.97;
  }

  // Calculate distribution amounts on resale
  if (this.isModified('resaleSoldPriceUSD') && this.resaleSoldPriceUSD) {
    this.distributionRoyalty = this.resaleSoldPriceUSD * 0.03; // 3% royalty
    this.distributionAmount = this.resaleSoldPriceUSD * 0.97; // 97% to investors
  }

  next();
});

export const Pool = models.Pool || model('Pool', PoolSchema);
