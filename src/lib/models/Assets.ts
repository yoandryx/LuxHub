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
    nftOwnerWallet: String, // Tracks current NFT owner (updates on sale/transfer)
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
      enum: ['pending', 'reviewed', 'listed', 'in_escrow', 'pooled', 'sold', 'burned'],
      default: 'pending',
      index: true,
    },
    poolEligible: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    escrowPda: { type: String, index: true },
    transferHistory: [
      {
        from: String,
        to: String,
        transactionSignature: String,
        transferredAt: { type: Date, default: Date.now },
      },
    ],
    // Arweave permanent storage fields
    arweaveTxId: { type: String, index: true },
    arweaveMetadataTxId: { type: String },
    // AI verification results
    aiVerification: {
      verified: { type: Boolean, default: false },
      confidence: { type: Number, min: 0, max: 100 },
      verifiedAt: Date,
      flags: [String],
      authenticityScore: { type: Number, min: 0, max: 100 },
      conditionGrade: {
        type: String,
        enum: ['mint', 'excellent', 'very_good', 'good', 'fair', 'poor'],
      },
      claimsVerified: {
        brand: { verified: Boolean, confidence: Number, notes: String },
        model: { verified: Boolean, confidence: Number, notes: String },
        condition: { verified: Boolean, suggestedCondition: String, notes: String },
        value: { reasonable: Boolean, marketRange: [Number], notes: String },
      },
      recommendedActions: [String],
      listingApproved: Boolean,
    },
    // Luxury category for AI verification
    category: {
      type: String,
      enum: ['watches', 'jewelry', 'art', 'collectibles'],
      default: 'watches',
    },
  },
  { timestamps: true }
);

AssetSchema.index({ status: 1, priceUSD: 1, luxScore: -1 });
AssetSchema.index({ arweaveTxId: 1 });
AssetSchema.index({ 'transferHistory.transactionSignature': 1 });
AssetSchema.index({ category: 1, status: 1 });

AssetSchema.pre('save', function (next) {
  if (this.isModified('priceUSD') && typeof this.priceUSD === 'number') {
    this.priceHistory.push({ price: this.priceUSD });
  }
  next();
});

export const Asset = models.Asset || model('Asset', AssetSchema);
