// src/models/PoolDistribution.ts
import { Schema, model, models } from 'mongoose';

const PoolDistributionSchema = new Schema(
  {
    pool: { type: Schema.Types.ObjectId, ref: 'Pool', required: true },
    salePriceUSD: { type: Number, required: true }, // Final sale amount
    luxhubRoyaltyUSD: { type: Number, required: true }, // 3% to LuxHub treasury PDA
    totalDistributedUSD: Number, // 97% pro-rata to users
    distributions: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        shares: Number,
        payoutUSD: Number, // Per-user amount
        txSignature: String, // On-chain payout tx
        payoutWallet: String, // User's wallet for distribution
        paidAt: Date,
      },
    ],
    treasuryPda: String, // LuxHub royalty receiver PDA
    status: {
      type: String,
      enum: ['pending', 'distributed', 'failed'],
      default: 'pending',
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PoolDistributionSchema.pre('save', function (next) {
  // Auto-calc royalty and distributions
  if (typeof this.salePriceUSD === 'number') {
    this.luxhubRoyaltyUSD = Math.round(this.salePriceUSD * 0.03 * 100) / 100;
    this.totalDistributedUSD = this.salePriceUSD - this.luxhubRoyaltyUSD;

    // Pro-rata per user (assuming participants from pool ref; populate in service)
    // Example: In service, loop participants and set payoutUSD = (shares / total) * totalDistributedUSD
  }
  next();
});

export const PoolDistribution =
  models.PoolDistribution || model('PoolDistribution', PoolDistributionSchema);
