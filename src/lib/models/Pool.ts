// src/models/Pool.ts
import { Schema, model, models } from 'mongoose';

const PoolSchema = new Schema(
  {
    // ========== POOL IDENTIFIER ==========
    poolNumber: { type: String }, // e.g., "LUX-00001"

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
        wallet: { type: String }, // Participant wallet address
        shares: Number,
        ownershipPercent: Number,
        investedUSD: Number,
        projectedReturnUSD: Number,
        investedAt: Date,
        txSignature: String, // Contribution transaction
      },
    ],

    // ========== VENDOR PAYMENT ==========
    vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    vendorWallet: { type: String },
    vendorPaidAmount: { type: Number }, // 97% of pool target
    vendorPaidAt: { type: Date },
    vendorPaymentTx: { type: String }, // Transaction signature
    vendorPaymentPercent: { type: Number, default: 97 }, // 97% for P2P (3% LuxHub fee)

    // ========== GRADUATION TARGET (USDC-denominated) ==========
    fundingTargetUsdc: { type: Number, required: false }, // USDC base units (6 decimals)
    fundingTargetUsdcSource: {
      type: String,
      enum: ['listing_price', 'vendor_override'],
      required: false,
    },
    fundingTargetSetAt: { type: Date, required: false },
    slippageBufferBps: { type: Number, default: 200 }, // 2%

    // ========== FEE ACCUMULATION (three-source architecture) ==========
    accumulatedFeesLamports: { type: Number, default: 0 }, // AUTHORITATIVE - claim-driven
    accumulatedFeesLamportsPending: { type: Number, default: 0 }, // Tertiary - live UI estimate
    feeClaimTxSignatures: { type: [String], default: [] }, // Audit trail of claim txs
    feeClaimInFlight: { type: Boolean, default: false }, // Concurrency lock
    lastFeeClaimAt: { type: Date, required: false },
    lastFeeClaimError: { type: String, required: false },

    // ========== ESCROW LINKAGE + CUSTODY ==========
    backingEscrowPda: { type: String, required: false }, // Marketplace escrow PDA holding the NFT
    custodyVaultPda: { type: String, required: false }, // Squads vault PDA after confirm_delivery
    custodyConfirmedAt: { type: Date, required: false }, // When NFT custody was verified on-chain

    // ========== POOLS TREASURY VAULT ==========
    treasuryPoolsVaultPda: { type: String, required: false }, // Squads vault PDA index 1

    // ========== LIFECYCLE AUDIT TRAIL ==========
    lifecycleMemos: {
      type: [
        {
          fromState: String,
          toState: String,
          timestamp: Date,
          txSignature: String,
          _id: false,
        },
      ],
      default: [],
    },

    // ========== LUXHUB CUSTODY ==========
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

    // ========== RESALE ==========
    resaleEscrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' },
    resaleListingPrice: { type: Number },
    resaleListingPriceUSD: { type: Number },
    resaleListedAt: { type: Date },
    resaleSoldPrice: { type: Number },
    resaleSoldPriceUSD: { type: Number },
    resaleSoldAt: { type: Date },
    resaleBuyerWallet: { type: String },
    resaleTxSignature: { type: String },

    // ========== DISTRIBUTION ==========
    distributionStatus: {
      type: String,
      enum: ['pending', 'calculating', 'proposed', 'approved', 'executed', 'completed'],
      default: 'pending',
    },
    distributionAmount: { type: Number },
    distributionRoyalty: { type: Number },
    distributionProposalIndex: { type: String },
    distributionExecutedAt: { type: Date },
    distributions: [
      {
        wallet: { type: String },
        shares: Number,
        ownershipPercent: Number,
        amount: Number,
        txSignature: String,
        distributedAt: Date,
      },
    ],

    // ========== SQUADS INTEGRATION ==========
    squadsProposalIndex: { type: String },
    squadsVendorPaymentIndex: { type: String },
    squadsDistributionIndex: { type: String },

    // ========== BAGS API INTEGRATION ==========
    bagsTokenMint: { type: String },
    bagsFeeShareConfigId: { type: String }, // Legacy -- use meteoraConfigKey instead
    meteoraConfigKey: { type: String },
    feeShareAuthority: { type: String },
    bagsTokenMetadataUrl: { type: String },
    bagsTokenCreatedAt: { type: Date },
    bagsPoolAddress: { type: String },
    bagsPoolCreatedAt: { type: Date },
    bagsTokenName: { type: String },
    bagsTokenSymbol: { type: String },
    bagsTotalSupply: { type: String },
    bagsTokenStatus: {
      type: String,
      enum: ['PRE_LAUNCH', 'PRE_GRAD', 'MIGRATING', 'MIGRATED'],
    },

    // Bags trading stats (updated via webhooks)
    totalTrades: { type: Number, default: 0 },
    totalVolumeUSD: { type: Number, default: 0 },
    lastTradeAt: { type: Date },
    lastMarketCap: { type: Number },
    lastPriceUSD: { type: Number },
    lastUpdatedAt: { type: Date },
    totalLiquidityEvents: { type: Number, default: 0 },
    lastLiquidityEventAt: { type: Date },

    // Recent trades (last 5, for card UI live feed)
    recentTrades: [
      {
        wallet: { type: String },
        type: { type: String, enum: ['buy', 'sell'] },
        amount: { type: Number },
        amountUSD: { type: Number },
        timestamp: { type: Date },
        txSignature: { type: String },
      },
    ],

    // Fee share claimers (on-chain fee-share config for this pool's token)
    feeShareClaimers: [
      {
        wallet: { type: String },
        basisPoints: { type: Number },
        label: { type: String },
      },
    ],

    // Bags graduation (bonding curve completed — informational only in phase 11)
    graduated: { type: Boolean, default: false },
    graduatedAt: { type: Date },
    graduationMarketCap: { type: Number },
    graduationPriceUSD: { type: Number },

    // ========== BONDING CURVE CONFIG ==========
    bondingCurveActive: { type: Boolean, default: true },
    bondingCurveType: {
      type: String,
      enum: ['linear', 'exponential', 'sqrt'],
      default: 'exponential',
    },
    currentBondingPrice: { type: Number },
    reserveBalance: { type: Number, default: 0 },
    tokensMinted: { type: Number, default: 0 },
    tokensCirculating: { type: Number, default: 0 },
    initialBondingPrice: { type: Number },
    bondingCurveAddress: { type: String },

    // ========== TOKEN STATUS (Phase 11 canonical state machine) ==========
    tokenStatus: {
      type: String,
      enum: [
        // New canonical 11 values (phase 11)
        'pending', 'minted', 'funding', 'graduated', 'custody', 'resale_listed',
        'resold', 'distributed', 'aborted', 'resale_unlisted', 'partial_distributed',
        // Legacy transition values -- remove in post-phase-11 cleanup
        'unlocked', 'frozen', 'redeemable', 'burned',
      ],
      default: 'pending',
    },
    tokenUnlockedAt: { type: Date },

    // ========== ESCROW PROTECTION ==========
    fundsInEscrow: { type: Number, default: 0 },
    escrowReleasedAt: { type: Date },

    // ========== ACCUMULATED TRADING FEES (from legacy, kept for backward compat) ==========
    accumulatedTradingFees: { type: Number, default: 0 },
    lastFeeDistributionAt: { type: Date },
    lastDividendAt: { type: Date },

    // ========== CLAIM WINDOW ==========
    claimWindowDays: { type: Number, default: 90 },
    claimWindowExpiresAt: { type: Date },
    unclaimedSweptAt: { type: Date },
    unclaimedSweptAmount: { type: Number },
    burnTxSignature: { type: String },

    // ========== SECURITY & ADMIN ==========
    securityConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    marketPostedAt: Date,
    projectedROI: Number,
    burnReason: String,

    // ========== WATCH VERIFICATION LIFECYCLE ==========
    watchVerificationStatus: {
      type: String,
      enum: [
        'verified', 'owner_changed', 'unresponsive',
        'grace_period', 'unverified', 'burned',
      ],
      default: 'verified',
    },
    watchVerificationLastChecked: { type: Date },
    watchVerificationGraceDeadline: { type: Date },
    watchCurrentOwnerWallet: { type: String },
    watchOwnerHistory: [
      {
        wallet: { type: String },
        acquiredAt: { type: Date },
        acquiredPrice: { type: Number },
        verifiedAt: { type: Date },
      },
    ],
    nftBurnedAt: { type: Date },
    nftBurnTxSignature: { type: String },
    nftBurnReason: { type: String },

    // ========== POOL CLOSURE ==========
    closedAt: { type: Date },

    // ========== STATUS (legacy -- kept for backward compatibility, read-only) ==========
    status: {
      type: String,
      enum: [
        'open', 'filled', 'funded', 'custody', 'active',
        'graduated', 'winding_down', 'listed', 'sold',
        'distributing', 'distributed', 'closed', 'failed',
        'dead', 'burned', 'canceled',
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
PoolSchema.index({ meteoraConfigKey: 1 }); // Meteora config lookup
PoolSchema.index({ graduated: 1 }); // Find graduated pools
PoolSchema.index({ watchVerificationStatus: 1 }); // Verification tracking

// Compound indexes for hot queries
PoolSchema.index({ status: 1, 'participants.wallet': 1 }); // User's pools by status
PoolSchema.index({ vendorWallet: 1, status: 1 }); // Vendor's pools by status (compound)
PoolSchema.index({ graduated: 1, status: 1 }); // Reconciliation query
PoolSchema.index({ 'distributions.wallet': 1 }, { sparse: true }); // Claim lookup by wallet

// Phase 11 compound indexes (INFRA-02 + claim cron hot path)
PoolSchema.index({ tokenStatus: 1, lastFeeClaimAt: 1 }); // Claim cron: find pools needing claims
PoolSchema.index({ tokenStatus: 1, createdAt: -1 }); // Browse/admin: pools by lifecycle state

// ========== PRE-SAVE HOOKS ==========
PoolSchema.pre('save', function (next) {
  // Calculate ownership percentages
  if (this.isModified('participants') && this.totalShares > 0) {
    this.participants.forEach((p) => {
      const shares = p.shares ?? 0;
      const contributed = p.investedUSD ?? 0;
      p.ownershipPercent = (shares / this.totalShares) * 100;
      p.projectedReturnUSD = contributed * (this.projectedROI || 1);
    });

    // Update fundsInEscrow when participants change
    const totalInvested = this.participants.reduce(
      (sum: number, p: any) => sum + (p.investedUSD || 0),
      0
    );
    this.fundsInEscrow = totalInvested;

    // Auto-fill when all shares sold
    if (this.sharesSold >= this.totalShares && this.status === 'open') {
      this.status = 'filled';
    }
  }

  // Calculate share price if not set
  if (!this.sharePriceUSD && this.targetAmountUSD && this.totalShares) {
    this.sharePriceUSD = this.targetAmountUSD / this.totalShares;
  }

  // Calculate vendor payment on funding
  if (
    this.isModified('status') &&
    this.status === 'funded' &&
    !this.vendorPaidAmount &&
    this.targetAmountUSD
  ) {
    // P2P model: vendor gets 97% (3% LuxHub fee)
    this.vendorPaidAmount = this.targetAmountUSD * 0.97;
    this.vendorPaymentPercent = 97;
  }

  // Calculate distribution amounts on resale
  if (this.isModified('resaleSoldPriceUSD') && this.resaleSoldPriceUSD) {
    this.distributionRoyalty = this.resaleSoldPriceUSD * 0.03; // 3% royalty
    this.distributionAmount = this.resaleSoldPriceUSD * 0.97; // 97% to participants
  }

  next();
});

export const Pool = models.Pool || model('Pool', PoolSchema);
