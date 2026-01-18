// src/models/VendorAnalytics.ts
import { Schema, model, models } from 'mongoose';

const VendorAnalyticsSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', unique: true, required: true },
    totalSalesUSD: { type: Number, default: 0 },
    totalEarningsFromSalesUSD: { type: Number, default: 0 }, // NEW NAME: Vendor's 97% cut from sales (after LuxHub royalty)
    inventoryCount: { type: Number, default: 0 },
    salesTrend: [{ month: String, sales: Number }],
    topAssets: [{ assetId: Schema.Types.ObjectId, sales: Number }],
    averageSaleTimeDays: Number,
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

VendorAnalyticsSchema.pre('save', function (next) {
  // Auto-calc vendor earnings (97% of sales)
  if (typeof this.totalSalesUSD === 'number') {
    this.totalEarningsFromSalesUSD = Math.round(this.totalSalesUSD * 0.97 * 100) / 100; // 97% after 3% royalty
  } else {
    this.totalEarningsFromSalesUSD = 0;
  }
  next();
});

export const VendorAnalytics =
  models.VendorAnalytics || model('VendorAnalytics', VendorAnalyticsSchema);
