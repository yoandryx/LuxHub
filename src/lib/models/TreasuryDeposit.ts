// src/lib/models/TreasuryDeposit.ts
import { Schema, model, models } from 'mongoose';

/**
 * TreasuryDeposit Model
 * Tracks all deposits to the LuxHub treasury wallet (fees, royalties, etc.)
 */
const TreasuryDepositSchema = new Schema(
  {
    // ========== TRANSACTION INFO ==========
    txSignature: { type: String, required: true, unique: true, index: true },
    slot: { type: Number },
    blockTime: { type: Date },

    // ========== AMOUNT ==========
    amountLamports: { type: Number, required: true },
    amountSOL: { type: Number, required: true },
    amountUSD: { type: Number }, // Calculated at time of deposit if price available

    // ========== WALLETS ==========
    fromWallet: { type: String, required: true, index: true },
    toWallet: { type: String, required: true, index: true }, // Treasury wallet

    // ========== SOURCE CLASSIFICATION ==========
    depositType: {
      type: String,
      enum: [
        'escrow_fee', // 3% royalty from escrow release
        'pool_royalty', // Royalty from pool distribution
        'direct_deposit', // Direct SOL transfer
        'mint_fee', // Fee from NFT minting
        'platform_fee', // General platform fees
        'unknown', // Unclassified deposit
      ],
      default: 'unknown',
      index: true,
    },

    // ========== LINKED RECORDS ==========
    escrow: { type: Schema.Types.ObjectId, ref: 'Escrow' },
    pool: { type: Schema.Types.ObjectId, ref: 'Pool' },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset' },
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction' },

    // ========== METADATA ==========
    description: { type: String },
    heliusEventType: { type: String }, // Original Helius event type
    rawEvent: { type: Schema.Types.Mixed }, // Store raw event for debugging

    // ========== STATUS ==========
    verified: { type: Boolean, default: false }, // Manually verified by admin
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
TreasuryDepositSchema.index({ createdAt: -1 });
TreasuryDepositSchema.index({ depositType: 1, createdAt: -1 });
TreasuryDepositSchema.index({ fromWallet: 1, depositType: 1 });

// ========== VIRTUALS ==========
TreasuryDepositSchema.virtual('formattedAmount').get(function () {
  return `${this.amountSOL?.toFixed(4)} SOL`;
});

// ========== STATICS ==========
TreasuryDepositSchema.statics.getTotalDeposits = async function (startDate?: Date, endDate?: Date) {
  const match: Record<string, unknown> = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) (match.createdAt as Record<string, Date>).$gte = startDate;
    if (endDate) (match.createdAt as Record<string, Date>).$lte = endDate;
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalLamports: { $sum: '$amountLamports' },
        totalSOL: { $sum: '$amountSOL' },
        totalUSD: { $sum: '$amountUSD' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { totalLamports: 0, totalSOL: 0, totalUSD: 0, count: 0 };
};

TreasuryDepositSchema.statics.getDepositsByType = async function () {
  return this.aggregate([
    {
      $group: {
        _id: '$depositType',
        totalSOL: { $sum: '$amountSOL' },
        totalUSD: { $sum: '$amountUSD' },
        count: { $sum: 1 },
      },
    },
    { $sort: { totalSOL: -1 } },
  ]);
};

export const TreasuryDeposit =
  models.TreasuryDeposit || model('TreasuryDeposit', TreasuryDepositSchema);
