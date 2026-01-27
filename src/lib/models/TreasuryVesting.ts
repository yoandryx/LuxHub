// src/lib/models/TreasuryVesting.ts
import { Schema, model, models } from 'mongoose';

/**
 * TreasuryVesting Model
 * Tracks Bags vested fee earnings per pool (creator fees vest over time per Bags new model)
 *
 * Per Finn's announcement:
 * - Vested earnings: Creator fees vest over time (not immediate SOL)
 * - Programmatic unlock: Tokens convert to SOL gradually
 * - Auto-compounding liquidity: Fee structures improve as pools scale
 * - Creator alignment: Keeps LuxHub invested in pool success
 */
const TreasuryVestingSchema = new Schema(
  {
    // ========== POOL REFERENCE ==========
    pool: { type: Schema.Types.ObjectId, ref: 'Pool', required: true, index: true },
    bagsTokenMint: { type: String, required: true, index: true },

    // ========== VESTING AMOUNTS ==========
    vestingTokens: { type: Number, required: true, default: 0 }, // Total tokens vesting
    vestedTokens: { type: Number, default: 0 }, // Tokens unlocked so far
    unclaimedTokens: { type: Number, default: 0 }, // Unlocked but not yet claimed
    claimedTokens: { type: Number, default: 0 }, // Tokens claimed and converted

    // ========== SOL CONVERSION ==========
    convertedToSol: { type: Number, default: 0 }, // Total SOL received from conversions
    lastConversionRate: { type: Number }, // Last token->SOL rate
    lastConversionAt: { type: Date },

    // ========== VESTING SCHEDULE ==========
    vestingStartAt: { type: Date, required: true },
    vestingEndAt: { type: Date }, // If known (some may be continuous)
    vestingDurationDays: { type: Number }, // Total vesting period
    vestingCliffDays: { type: Number, default: 0 }, // Cliff period before any unlock

    // ========== VESTING MODEL ==========
    vestingType: {
      type: String,
      enum: [
        'linear', // Tokens unlock linearly over time
        'cliff', // All unlock at cliff date
        'milestone', // Unlock at specific milestones
        'continuous', // Continuous streaming (no end date)
      ],
      default: 'linear',
    },

    // ========== CLAIMS HISTORY ==========
    claims: [
      {
        claimedAt: { type: Date, required: true },
        tokensClaimed: { type: Number, required: true },
        solReceived: { type: Number },
        txSignature: { type: String },
        conversionRate: { type: Number },
      },
    ],
    lastClaimAt: { type: Date },

    // ========== STATUS ==========
    status: {
      type: String,
      enum: [
        'vesting', // Tokens still vesting
        'partially_vested', // Some tokens unlocked
        'fully_vested', // All tokens unlocked (ready to claim)
        'claimed', // All tokens claimed
        'cancelled', // Vesting cancelled (pool failed)
      ],
      default: 'vesting',
      index: true,
    },

    // ========== SOURCE TRACKING ==========
    feeType: {
      type: String,
      enum: [
        'creator_fee', // Creator fee from trades (1%)
        'partner_fee', // Partner integration fee
        'referral_fee', // Referral bonus
      ],
      default: 'creator_fee',
    },

    // ========== METADATA ==========
    bagsVestingId: { type: String }, // Bags API vesting ID if applicable
    notes: { type: String },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
TreasuryVestingSchema.index({ pool: 1, feeType: 1 });
TreasuryVestingSchema.index({ status: 1, vestingEndAt: 1 });
TreasuryVestingSchema.index({ bagsTokenMint: 1 });

// ========== VIRTUALS ==========
TreasuryVestingSchema.virtual('vestingProgress').get(function () {
  if (this.vestingTokens === 0) return 100;
  return Math.round((this.vestedTokens / this.vestingTokens) * 100);
});

TreasuryVestingSchema.virtual('claimableTokens').get(function () {
  return this.vestedTokens - this.claimedTokens;
});

// ========== METHODS ==========
TreasuryVestingSchema.methods.calculateVestedAmount = function (): number {
  const now = new Date();
  const start = this.vestingStartAt;
  const end = this.vestingEndAt;

  if (!start) return 0;

  // Before vesting starts
  if (now < start) return 0;

  // If continuous vesting without end date, return based on elapsed time
  if (!end) {
    // For continuous, assume some default rate (e.g., 1% per day)
    const daysElapsed = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.min(this.vestingTokens, this.vestingTokens * (daysElapsed * 0.01));
  }

  // After vesting ends
  if (now >= end) return this.vestingTokens;

  // During vesting - linear calculation
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const progress = elapsed / totalDuration;

  return Math.floor(this.vestingTokens * progress);
};

// ========== STATICS ==========
TreasuryVestingSchema.statics.getTotalVesting = async function () {
  const result = await this.aggregate([
    { $match: { status: { $in: ['vesting', 'partially_vested'] } } },
    {
      $group: {
        _id: null,
        totalVestingTokens: { $sum: '$vestingTokens' },
        totalVestedTokens: { $sum: '$vestedTokens' },
        totalClaimedTokens: { $sum: '$claimedTokens' },
        totalConvertedSol: { $sum: '$convertedToSol' },
        count: { $sum: 1 },
      },
    },
  ]);

  return (
    result[0] || {
      totalVestingTokens: 0,
      totalVestedTokens: 0,
      totalClaimedTokens: 0,
      totalConvertedSol: 0,
      count: 0,
    }
  );
};

TreasuryVestingSchema.statics.getClaimableByPool = async function (poolId: string) {
  const vesting = await this.findOne({ pool: poolId, status: { $ne: 'claimed' } });
  if (!vesting) return { claimable: 0, vestingId: null };

  const claimable = vesting.vestedTokens - vesting.claimedTokens;
  return { claimable, vestingId: vesting._id };
};

export const TreasuryVesting =
  models.TreasuryVesting || model('TreasuryVesting', TreasuryVestingSchema);
