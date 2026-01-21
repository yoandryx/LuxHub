// src/models/User.ts
import { Schema, model, models } from 'mongoose';

// Schema for linked wallets (embedded or external)
const LinkedWalletSchema = new Schema(
  {
    address: { type: String, required: true },
    type: {
      type: String,
      enum: ['embedded', 'external', 'backpack'],
      default: 'external',
    },
    chainType: { type: String, default: 'solana' },
    walletClient: String, // e.g., 'phantom', 'solflare', 'privy_embedded'
    isPrimary: { type: Boolean, default: false },
    linkedAt: { type: Date, default: Date.now },
    verified: { type: Boolean, default: true },
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    // Privy Integration
    privyId: { type: String, unique: true, sparse: true, index: true }, // Privy DID (did:privy:xxx)
    privyCreatedAt: Date,

    // Primary wallet (for backwards compatibility and on-chain tracking)
    wallet: { type: String, unique: true, sparse: true, index: true },

    // All linked wallets (embedded + external)
    linkedWallets: [LinkedWalletSchema],

    // Legacy fields (kept for backwards compatibility)
    secondaryWallets: [String],
    backpackWalletLinked: { type: Boolean, default: false },
    backpackSessionId: String,

    // Email (from Privy or direct signup)
    email: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },

    // Role and permissions
    role: {
      type: String,
      enum: ['user', 'vendor', 'admin'],
      default: 'user',
      index: true,
    },

    // Profile information
    profile: {
      name: String,
      username: { type: String, unique: true, sparse: true },
      bio: String,
      avatar: String, // Pinata IPFS URL
      banner: String, // Pinata IPFS URL
      displayName: String, // Preferred display name
    },

    // Investment tracking
    investments: [{ type: Schema.Types.ObjectId, ref: 'Pool' }],
    analytics: { type: Schema.Types.ObjectId, ref: 'UserAnalytics' },
    totalInvested: { type: Number, default: 0 },

    // Account status
    deleted: { type: Boolean, default: false },
    lastLoginAt: Date,
    loginCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for finding users by any of their linked wallets
UserSchema.index({ 'linkedWallets.address': 1 });

// Helper method to get primary wallet
UserSchema.methods.getPrimaryWallet = function () {
  const primary = this.linkedWallets?.find((w: any) => w.isPrimary);
  return primary?.address || this.wallet || this.linkedWallets?.[0]?.address;
};

// Helper method to check if user has a specific wallet
UserSchema.methods.hasWallet = function (address: string) {
  if (this.wallet === address) return true;
  return this.linkedWallets?.some((w: any) => w.address === address) || false;
};

export const User = models.User || model('User', UserSchema);
