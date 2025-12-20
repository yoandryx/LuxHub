// models/MarketplaceNFT.ts
import mongoose from "mongoose";

const marketplaceNFTSchema = new mongoose.Schema({
  mintAddress: {
    type: String,
    required: true,
    unique: true,
    index: true, // Fast lookups by mint
  },
  name: { type: String, required: true },
  description: { type: String },
  image: { type: String, required: true },
  priceSol: { type: Number, required: true },
  marketStatus: {
    type: String,
    enum: ["active", "Holding LuxHub", "inactive", "pending", "sold"],
    required: true,
  },
  currentOwner: { type: String },
  metadataUri: { type: String },
  fileCid: { type: String }, // IPFS hash from Pinata
  attributes: [
    {
      trait_type: String,
      value: String,
    },
  ],
  lastVerifiedAt: { type: Date, default: Date.now }, // When we last checked on-chain
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update timestamp on save
marketplaceNFTSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const MarketplaceNFT =
  mongoose.models.MarketplaceNFT ||
  mongoose.model("MarketplaceNFT", marketplaceNFTSchema);