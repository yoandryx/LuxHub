// src/models/Asset.ts
import { Schema, model, models } from 'mongoose';

const AssetSchema = new Schema(
  {
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', index: true },
    model: { type: String, required: true },
    serial: { type: String, index: true }, // Reference number (not unique - vendors may have same ref)
    description: String,
    priceUSD: { type: Number, index: true },
    currentValueUSD: Number,

    // Watch-specific attributes (populated from mint request)
    brand: { type: String, index: true },
    title: { type: String },
    imageUrl: { type: String }, // Primary display image URL (Irys/Arweave)
    material: { type: String },
    productionYear: { type: String },
    movement: { type: String },
    caseSize: { type: String },
    waterResistance: { type: String },
    dialColor: { type: String },
    boxPapers: { type: String },
    limitedEdition: { type: String },
    country: { type: String },
    certificate: { type: String },
    warrantyInfo: { type: String },
    provenance: { type: String },
    features: { type: String },
    releaseDate: { type: String },
    priceHistory: [
      {
        price: Number,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
    nftOwnerWallet: String, // Tracks current NFT owner (updates on sale/transfer)
    mintedBy: { type: String, index: true }, // Admin wallet who originally minted this NFT
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
      enum: [
        'pending',
        'reviewed',
        'listed',
        'in_escrow',
        'pooled',
        'sold',
        'sold_externally', // Sold outside LuxHub
        'delisted', // Temporarily removed from marketplace
        'burned',
        'frozen',
      ],
      default: 'pending',
      index: true,
    },
    statusBeforeFreeze: { type: String }, // Store previous status when frozen
    poolEligible: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    escrowPda: { type: String, index: true },

    // Authority control fields
    frozenAt: { type: Date },
    frozenReason: { type: String },
    frozenBy: { type: String },
    thawedAt: { type: Date },
    thawedBy: { type: String },

    burnedAt: { type: Date },
    burnedReason: { type: String },
    burnedBy: { type: String },
    previousOwnerBeforeBurn: { type: String },

    // Metadata tracking
    lastMetadataUpdate: { type: Date },
    lastUpdatedBy: { type: String },
    metadataHistory: [
      {
        uri: String,
        updatedAt: { type: Date, default: Date.now },
        updatedBy: String,
        reason: String,
        changes: Schema.Types.Mixed,
      },
    ],

    // Condition tracking
    condition: {
      type: String,
      enum: ['New', 'Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Non-functional'],
    },
    lastConditionUpdate: { type: Date },
    conditionUpdatesDue: { type: Date }, // When next update is required
    conditionUpdatesOverdue: { type: Boolean, default: false },

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
AssetSchema.index({ brand: 1, status: 1 }); // For brand-filtered marketplace queries

AssetSchema.pre('save', function (next) {
  if (this.isModified('priceUSD') && typeof this.priceUSD === 'number') {
    this.priceHistory.push({ price: this.priceUSD });
  }
  next();
});

export const Asset = models.Asset || model('Asset', AssetSchema);

// Default export for API compatibility
export default Asset;
