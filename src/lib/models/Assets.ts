// src/models/Asset.ts
import { Schema, model, models } from 'mongoose';

const AssetSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', index: true },
    model: { type: String, required: true },
    serial: { type: String, unique: true, index: true },
    description: String,
    priceUSD: { type: Number, index: true },
    currentValueUSD: Number,
    priceHistory: [
      {
        price: Number,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    nftOwnerWallet: String, // NEW: Tracks current NFT owner (updates on sale/transfer)
    images: [String],
    imageIpfsUrls: [String],
    metadataIpfsUrl: String,
    metaplexMetadata: {
      creator: String,
      collection: String,
      attributes: Schema.Types.Mixed,
    },
    luxScore: { type: Number, min: 0, max: 100, default: 0 },
    authenticityProofs: [String],
    nftMint: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'listed', 'pooled', 'sold', 'burned'],
      default: 'pending',
      index: true,
    },
    poolEligible: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AssetSchema.index({ status: 1, priceUSD: 1, luxScore: -1 });

AssetSchema.pre('save', function (next) {
  if (this.isModified('priceUSD') && typeof this.priceUSD === 'number') {
    this.priceHistory.push({ price: this.priceUSD });
  }
  next();
});

export const Asset = models.Asset || model('Asset', AssetSchema);
