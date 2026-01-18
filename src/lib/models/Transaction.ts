// src/models/Transaction.ts
import { Schema, model, models } from 'mongoose';

const TransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'sale',
        'investment',
        'royalty_payout',
        'mint',
        'burn',
        'refund',
        'pool_distribution',
        'pool_burn',
        'offer_acceptance',
        'negotiation_settlement',
      ], // UPDATED: Added for offers/negotiations
      required: true,
      index: true,
    },
    escrow: { type: Schema.Types.ObjectId, ref: 'Escrow' },
    pool: { type: Schema.Types.ObjectId, ref: 'Pool' },
    asset: { type: Schema.Types.ObjectId, ref: 'Asset' },
    fromWallet: String,
    toWallet: String,
    amountUSD: Number,
    vendorEarningsUSD: Number,
    luxhubRoyaltyUSD: Number,
    profitLossUSD: Number,
    txSignature: { type: String, index: true },
    mintTxSignature: String,
    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true,
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

TransactionSchema.index({ type: 1, createdAt: -1 });

TransactionSchema.pre('save', function (next) {
  if (this.type === 'sale' && typeof this.amountUSD === 'number') {
    this.luxhubRoyaltyUSD = Math.round(this.amountUSD * 0.03 * 100) / 100;
    this.vendorEarningsUSD = this.amountUSD - this.luxhubRoyaltyUSD;
  }
  next();
});

export const Transaction = models.Transaction || model('Transaction', TransactionSchema);
