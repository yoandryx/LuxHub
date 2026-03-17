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
    resaleEscrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' }, // Escrow for the resale listing
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
    squadsDistributionIndex: { type: String }, // For participant distribution

    // ========== BAGS API INTEGRATION ==========
    bagsTokenMint: { type: String }, // Pool share token mint via Bags
    bagsFeeShareConfigId: { type: String }, // Legacy — use meteoraConfigKey instead
    meteoraConfigKey: { type: String }, // Meteora DBC pool config key from fee-share/config response
    feeShareAuthority: { type: String }, // Fee share authority PDA from fee-share/config response
    bagsTokenMetadataUrl: { type: String }, // IPFS metadata URL from Bags create-token-info
    bagsTokenCreatedAt: { type: Date },
    bagsPoolAddress: { type: String }, // Bags AMM pool address
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
        amount: { type: Number }, // token amount
        amountUSD: { type: Number },
        timestamp: { type: Date },
        txSignature: { type: String },
      },
    ],

    // Bags graduation (bonding curve completed)
    graduated: { type: Boolean, default: false },
    graduatedAt: { type: Date },
    graduationMarketCap: { type: Number },
    graduationPriceUSD: { type: Number },

    // ========== BONDING CURVE CONFIG (NEW) ==========
    bondingCurveActive: { type: Boolean, default: true },
    bondingCurveType: {
      type: String,
      enum: ['linear', 'exponential', 'sqrt'],
      default: 'exponential',
    },
    currentBondingPrice: { type: Number }, // Current price on bonding curve
    reserveBalance: { type: Number, default: 0 }, // SOL/USDC in bonding curve reserve
    tokensMinted: { type: Number, default: 0 }, // Dynamic count of tokens minted
    tokensCirculating: { type: Number, default: 0 }, // Tokens currently in circulation
    initialBondingPrice: { type: Number }, // Initial price when curve launched
    bondingCurveAddress: { type: String }, // On-chain bonding curve address

    // ========== HOLDER DIVIDENDS (NEW) ==========
    holderDividendBps: { type: Number, default: 100 }, // 1% default (100 basis points)
    totalDividendsDistributed: { type: Number, default: 0 },
    lastDividendAt: { type: Date },

    // ========== SQUAD DAO GOVERNANCE (NEW) ==========
    squadMultisigPda: { type: String }, // Squads multisig PDA
    squadVaultPda: { type: String }, // Squads vault PDA (holds NFT)
    squadThreshold: { type: Number, default: 60 }, // 60% approval threshold
    squadMembers: [
      {
        wallet: { type: String },
        tokenBalance: { type: Number },
        ownershipPercent: { type: Number },
        joinedAt: { type: Date },
        permissions: { type: Number, default: 1 }, // 1 = basic member
      },
    ],
    squadCreatedAt: { type: Date },
    nftTransferredToSquad: { type: Boolean, default: false },
    nftTransferTx: { type: String }, // Transaction signature for NFT transfer

    // ========== TOKENIZATION & LIQUIDITY ==========
    // Token status - tokens minted on pool creation but locked until conditions met
    tokenStatus: {
      type: String,
      enum: [
        'pending', // Not yet tokenized
        'minted', // Tokens created, locked
        'unlocked', // Tokens tradeable (pool filled + custody verified)
        'frozen', // Trading halted (emergency)
        'redeemable', // Pool winding down, tokens redeemable
        'burned', // Pool closed, tokens burned
      ],
      default: 'pending',
    },
    tokenUnlockedAt: { type: Date }, // When tokens became tradeable

    // Liquidity model selection
    liquidityModel: {
      type: String,
      enum: [
        'p2p', // Peer-to-peer only (no AMM, pure order book)
        'amm', // AMM liquidity pool (30% of funds)
        'hybrid', // Both P2P and partial AMM
      ],
      default: 'p2p',
    },

    // AMM Liquidity Pool (if liquidityModel is 'amm' or 'hybrid')
    ammEnabled: { type: Boolean, default: false },
    ammPoolAddress: { type: String }, // Bags AMM pool address
    ammLiquidityAmount: { type: Number }, // Amount locked in AMM (e.g., 30% of target)
    ammLiquidityPercent: { type: Number, default: 30 }, // Percentage to AMM (default 30%)
    ammCreatedAt: { type: Date },

    // Vendor payment calculation (adjusted for AMM)
    vendorPaymentPercent: { type: Number, default: 97 }, // 97% for P2P, 67% for AMM (70% - 3% fee)

    // Escrow protection - funds held until custody verified
    fundsInEscrow: { type: Number, default: 0 }, // Current amount in escrow
    escrowReleasedAt: { type: Date }, // When funds released to vendor/AMM

    // ========== WIND-DOWN ==========
    windDownStatus: {
      type: String,
      enum: ['none', 'announced', 'snapshot_taken', 'distributing', 'completed'],
      default: 'none',
    },
    windDownAnnouncedAt: { type: Date },
    windDownDeadline: { type: Date },
    windDownSnapshotAt: { type: Date },
    windDownSnapshotHolders: [
      {
        wallet: { type: String },
        balance: { type: Number },
        ownershipPercent: { type: Number },
        choice: { type: String, enum: ['pending', 'cash_out', 'rollover'], default: 'pending' },
        choiceMadeAt: { type: Date },
        rolloverPoolId: { type: Schema.Types.ObjectId, ref: 'Pool' },
        cashOutAmount: { type: Number },
        distributedAt: { type: Date },
      },
    ],
    windDownClaimDeadline: { type: Date },
    accumulatedTradingFees: { type: Number, default: 0 },

    // ========== FEE SPLIT CONFIGURATION ==========
    // Bags creator fee = 1% of all trade volume, split via fee-share/config (10,000 BPS = 100%)
    // These track the on-chain fee-share claimers array for this pool's token
    feeShareClaimers: [
      {
        wallet: { type: String },
        basisPoints: { type: Number }, // Out of 10,000 total
        label: { type: String }, // e.g., 'treasury', 'vendor'
      },
    ],
    // Internal tracking of accumulated fees (updated via webhooks)
    feeAllocations: {
      platformBps: { type: Number, default: 100 }, // 1% of trade volume to platform
      holderBps: { type: Number, default: 100 }, // 1% redistributed to holders (future)
      vendorBps: { type: Number, default: 50 }, // 0.5% vendor reward
      tradeRewardBps: { type: Number, default: 50 }, // 0.5% trading rebates
    },
    accumulatedHolderFees: { type: Number, default: 0 },
    accumulatedVendorFees: { type: Number, default: 0 },
    accumulatedTradeRewards: { type: Number, default: 0 },
    lastFeeDistributionAt: { type: Date },

    // ========== SECURITY & ADMIN ==========
    securityConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    marketPostedAt: Date,
    projectedROI: Number,
    fractionalMint: String,
    fractionalPda: String,
    burnReason: String,

    // ========== WATCH VERIFICATION LIFECYCLE ==========
    watchVerificationStatus: {
      type: String,
      enum: [
        'verified', // Watch tracked and verified in custody or with known owner
        'owner_changed', // Watch sold, new owner being verified
        'unresponsive', // Owner not responding to verification requests
        'grace_period', // 30-day warning before unverified
        'unverified', // Verification lapsed, NFT may be burned
        'burned', // NFT burned, token no longer represents a watch
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

    // ========== STATUS ==========
    status: {
      type: String,
      enum: [
        'open', // Accepting contributions
        'filled', // Target reached, awaiting vendor payment
        'funded', // Vendor paid, awaiting custody
        'custody', // Vendor shipping to LuxHub
        'active', // LuxHub holds asset, pool operational
        'graduated', // Bonding curve completed, Squad DAO created
        'winding_down', // Wind-down announced, awaiting snapshot/distribution
        'listed', // Asset listed for resale
        'sold', // Asset sold, distribution pending
        'distributing', // Distribution in progress
        'distributed', // All proceeds distributed
        'closed', // Pool finalized
        'failed', // Transaction failed
        'dead', // Pool abandoned
        'burned', // Pool burned/cancelled
        'canceled', // Pool canceled before vendor payment
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
PoolSchema.index({ squadMultisigPda: 1 }); // Squad lookup
PoolSchema.index({ 'squadMembers.wallet': 1 }); // Find pools by member wallet
PoolSchema.index({ windDownStatus: 1 }); // Wind-down tracking
PoolSchema.index({ watchVerificationStatus: 1 }); // Verification tracking

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

  // Calculate vendor payment based on liquidity model
  if (
    this.isModified('status') &&
    this.status === 'funded' &&
    !this.vendorPaidAmount &&
    this.targetAmountUSD
  ) {
    if (this.liquidityModel === 'amm' || this.liquidityModel === 'hybrid') {
      // AMM model: vendor gets less, rest goes to liquidity pool
      const ammPercent = this.ammLiquidityPercent || 30;
      const vendorPercent = (100 - ammPercent - 3) / 100; // e.g., 67% if 30% AMM + 3% fee
      this.vendorPaidAmount = this.targetAmountUSD * vendorPercent;
      this.ammLiquidityAmount = this.targetAmountUSD * (ammPercent / 100);
      this.vendorPaymentPercent = vendorPercent * 100;
    } else {
      // P2P model: vendor gets 97% (3% LuxHub fee)
      this.vendorPaidAmount = this.targetAmountUSD * 0.97;
      this.vendorPaymentPercent = 97;
    }
  }

  // Calculate distribution amounts on resale
  if (this.isModified('resaleSoldPriceUSD') && this.resaleSoldPriceUSD) {
    this.distributionRoyalty = this.resaleSoldPriceUSD * 0.03; // 3% royalty
    this.distributionAmount = this.resaleSoldPriceUSD * 0.97; // 97% to participants
  }

  next();
});

export const Pool = models.Pool || model('Pool', PoolSchema);
