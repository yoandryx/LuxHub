// src/models/UserAnalytics.ts
import { Schema, model, models } from 'mongoose';

const UserAnalyticsSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    totalInvestedUSD: { type: Number, default: 0 },
    totalProfitsUSD: { type: Number, default: 0 },
    totalLossesUSD: { type: Number, default: 0 },
    assetPortfolioValueUSD: Number, // Sum of owned assets/pools (query on-chain)
    potentialEarningsUSD: Number, // Projected from pools (e.g., ROI estimates)
    transactionCount: { type: Number, default: 0 },
    investmentTrend: [{ month: String, invested: Number }], // For personal traction
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

UserAnalyticsSchema.pre('save', function (next) {
  // Example hook: Net profits
  this.totalProfitsUSD -= this.totalLossesUSD;
  if (this.totalProfitsUSD < 0) this.totalProfitsUSD = 0;
  next();
});

export const UserAnalytics = models.UserAnalytics || model('UserAnalytics', UserAnalyticsSchema);
