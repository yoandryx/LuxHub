// src/models/Vendor.ts
import { Schema, model, models } from 'mongoose';

const VendorSchema = new Schema(
  {
    // User reference - optional for official LuxHub vendor
    user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    businessName: { type: String, required: true },
    username: { type: String, unique: true, index: true, required: true },
    bio: String,
    socials: {
      instagram: String,
      twitter: String,
      website: String,
    },
    verified: { type: Boolean, default: false },

    // Official LuxHub vault vendor flag
    isOfficial: { type: Boolean, default: false, index: true },

    // Wallet address for the vendor (used for LuxHub vault)
    walletAddress: { type: String, index: true },

    multisigPda: String, // Squads vault PDA
    multisigType: { type: String, enum: ['none', 'personal', 'team_treasury'], default: 'none' }, // NEW: For future Squads expansions
    multisigMembers: [String], // NEW: Wallets in the multisig (for Backpack/Squads sync)
    fedexApiKey: { type: String },
    backpackWalletLinked: { type: Boolean, default: false }, // NEW: Bags/Backpack integration
    analytics: { type: Schema.Types.ObjectId, ref: 'VendorAnalytics' },
    salesSummary: {
      totalSales: { type: Number, default: 0 },
      totalRoyaltiesEarned: { type: Number, default: 0 },
    },
    listingsCount: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },

    // Pinned assets (max 3) - displayed prominently on vendor profile
    pinnedAssets: [{ type: Schema.Types.ObjectId, ref: 'Asset' }],
  },
  { timestamps: true }
);

VendorSchema.index({ verified: 1, listingsCount: -1 });

export const Vendor = models.Vendor || model('Vendor', VendorSchema);
