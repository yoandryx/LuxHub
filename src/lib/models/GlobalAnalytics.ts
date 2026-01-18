// src/models/GlobalAnalytics.ts
import { Schema, model, models } from 'mongoose';

const GlobalAnalyticsSchema = new Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
      enum: [
        'totalUsers',
        'activeUsersLast30Days',
        'totalVendors',
        'totalAssetsListed',
        'totalSalesVolumeUSD',
        'totalRoyaltiesCollectedUSD', // LuxHub's 3% revenue
        'totalInvestedInPoolsUSD',
        'activePools',
        'totalMints',
        'totalBurns',
        'averageLuxScore',
        'totalWalletAddresses',
      ],
    },
    value: { type: Number, required: true },
    details: Schema.Types.Mixed,
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const GlobalAnalytics =
  models.GlobalAnalytics || model('GlobalAnalytics', GlobalAnalyticsSchema);
