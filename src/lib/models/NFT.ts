// lib/models/NFT.ts
import mongoose from 'mongoose';

const NftSchema = new mongoose.Schema(
  {
    mintAddress: { type: String, required: true, unique: true },
    metadataUri: { type: String, required: true },
    vendorWallet: { type: String, required: true, index: true },
    currentOwner: { type: String, required: true },
    marketStatus: { type: String, default: 'inactive', index: true },
    priceSol: { type: Number, default: 0 },
    fileCid: { type: String },
    title: { type: String },
    description: { type: String },
    image: { type: String },
    attributes: { type: [Object], default: [] },

    // For provenance and future features
    provenance: { type: [String], default: [] }, // list of wallet addresses
    priceHistory: { type: [Number], default: [] },
    lastSaleDate: { type: Date },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.models.NFT || mongoose.model('NFT', NftSchema);
