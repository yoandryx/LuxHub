// src/models/Pool.ts
import { Schema, model, models } from 'mongoose';

const PoolSchema = new Schema(
  {
    selectedAssetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    sourceType: { type: String, enum: ['dealer', 'luxhub_owned'], required: true },
    maxInvestors: { type: Number, required: true },
    minBuyInUSD: { type: Number, required: true },
    totalShares: { type: Number, required: true },
    sharesSold: { type: Number, default: 0 },
    participants: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        shares: Number,
        ownershipPercent: Number,
        investedUSD: Number,
        projectedReturnUSD: Number,
        investedAt: Date,
      },
    ],
    securityConfirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    marketPostedAt: Date,
    projectedROI: Number,
    fractionalMint: String,
    fractionalPda: String,
    burnReason: String,
    status: {
      type: String,
      enum: ['open', 'filled', 'funded', 'active', 'sold', 'closed', 'failed', 'dead', 'burned'],
      default: 'open',
      index: true,
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

PoolSchema.index({ status: 1 });

PoolSchema.pre('save', function (next) {
  if (this.isModified('participants') && this.totalShares > 0) {
    this.participants.forEach((p) => {
      const shares = p.shares ?? 0; // FIXED: Null check + default
      const invested = p.investedUSD ?? 0; // FIXED: Null check + default
      p.ownershipPercent = (shares / this.totalShares) * 100;
      p.projectedReturnUSD = invested * (this.projectedROI || 1);
    });
    if (this.sharesSold >= this.totalShares) {
      this.status = 'filled';
    }
  }
  next();
});

export const Pool = models.Pool || model('Pool', PoolSchema);
