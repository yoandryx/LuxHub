// src/models/Vendor.ts
import { Schema, model, models } from 'mongoose';

const VendorSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    businessName: { type: String, required: true },
    username: { type: String, unique: true, index: true, required: true },
    bio: String,
    socials: {
      instagram: String,
      twitter: String,
      website: String,
    },
    verified: { type: Boolean, default: false },
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
  },
  { timestamps: true }
);

VendorSchema.index({ verified: 1, listingsCount: -1 });

export const Vendor = models.Vendor || model('Vendor', VendorSchema);
