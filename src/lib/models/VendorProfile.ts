import mongoose from 'mongoose';

const VendorProfileSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true },
  email: { type: String, sparse: true },
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

  // Application status tracking
  applicationStatus: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'pending',
  },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  reviewedBy: { type: String },
  reviewedAt: { type: Date },
  applicationNotes: { type: String },

  // Application questionnaire
  businessType: {
    type: String,
    enum: ['individual', 'small_business', 'dealer', 'auction_house', 'brand_authorized'],
  },
  businessWebsite: { type: String },
  estimatedInventorySize: { type: String, enum: ['1-5', '6-20', '21-50', '50+'] },
  primaryCategory: { type: String, enum: ['watches', 'jewelry', 'collectibles', 'art', 'mixed'] },
  yearsInBusiness: { type: Number },
  hasPhysicalLocation: { type: Boolean },
  additionalNotes: { type: String },

  // Reliability tracking (Phase 3B)
  reliabilityFlags: [
    {
      type: { type: String },
      createdAt: { type: Date, default: Date.now },
      details: { type: String },
    },
  ],
  reliabilityScore: { type: Number, default: 100 },
});

// Sync approved <-> applicationStatus
VendorProfileSchema.pre('save', function (next) {
  if (this.isModified('applicationStatus')) {
    this.approved = this.applicationStatus === 'approved';
  }
  if (this.isModified('approved') && !this.isModified('applicationStatus')) {
    this.applicationStatus = this.approved ? 'approved' : 'pending';
  }
  next();
});

VendorProfileSchema.index({ wallet: 1 });
VendorProfileSchema.index({ username: 1 });

export default mongoose.models.VendorProfile ||
  mongoose.model('VendorProfile', VendorProfileSchema);

export type VendorProfile = {
  wallet: string;
  email?: string;
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

  // Application status tracking
  applicationStatus?: 'pending' | 'under_review' | 'approved' | 'rejected';
  rejectedAt?: Date;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  applicationNotes?: string;

  // Application questionnaire
  businessType?: 'individual' | 'small_business' | 'dealer' | 'auction_house' | 'brand_authorized';
  businessWebsite?: string;
  estimatedInventorySize?: '1-5' | '6-20' | '21-50' | '50+';
  primaryCategory?: 'watches' | 'jewelry' | 'collectibles' | 'art' | 'mixed';
  yearsInBusiness?: number;
  hasPhysicalLocation?: boolean;
  additionalNotes?: string;

  // Reliability tracking
  reliabilityFlags?: { type: string; createdAt: Date; details: string }[];
  reliabilityScore?: number;
};
