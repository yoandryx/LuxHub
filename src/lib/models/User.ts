// src/models/User.ts
import { Schema, model, models } from 'mongoose';

const UserSchema = new Schema(
  {
    wallet: { type: String, unique: true, sparse: true, index: true }, // Primary Solana wallet for on-chain tracking
    secondaryWallets: [String], // NEW: For multisig or additional (e.g., Backpack-linked)
    backpackWalletLinked: { type: Boolean, default: false }, // NEW: Flag for Bags/Backpack API integration
    backpackSessionId: String, // NEW: For Backpack API sessions (if needed)
    email: { type: String, unique: true, sparse: true },
    role: {
      type: String,
      enum: ['user', 'vendor', 'admin'],
      default: 'user',
      index: true,
    },
    profile: {
      name: String,
      username: { type: String, unique: true, sparse: true },
      bio: String,
      avatar: String, // Pinata IPFS URL
      banner: String, // Pinata IPFS URL
    },
    investments: [{ type: Schema.Types.ObjectId, ref: 'Pool' }],
    analytics: { type: Schema.Types.ObjectId, ref: 'UserAnalytics' },
    totalInvested: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const User = models.User || model('User', UserSchema);
