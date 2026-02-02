import mongoose from 'mongoose';

const VendorProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  bio: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  bannerUrl: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  socialLinks: {
    instagram: { type: String, default: '' },
    x: { type: String, default: '' },
    website: { type: String, default: '' },
  },
  inventory: [{ type: String }],
  joined: { type: Date, default: Date.now },
  approved: { type: Boolean, default: false },
  // Pinned assets (max 3) - asset IDs to display prominently
  pinnedAssets: [{ type: String }],
});

VendorProfileSchema.index({ wallet: 1 });
VendorProfileSchema.index({ username: 1 });

export default mongoose.models.VendorProfile ||
  mongoose.model('VendorProfile', VendorProfileSchema);

export type VendorProfile = {
  wallet: string;
  name: string;
  username: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
  socialLinks: {
    instagram?: string;
    x?: string;
    website?: string;
  };
  inventory: string[];
  joined: Date;
  approved?: boolean;
  pinnedAssets?: string[];
};
