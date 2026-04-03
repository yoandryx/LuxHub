// src/lib/models/VendorInterest.ts
// Lightweight interest submissions from /vendor/apply
// Used to track who wants to become a vendor before formal onboarding
import { Schema, model, models } from 'mongoose';

const VendorInterestSchema = new Schema(
  {
    wallet: { type: String, default: null, index: true },
    name: { type: String, required: true },
    category: { type: String, default: null },
    email: { type: String, default: null },
    phone: { type: String, default: null },
    message: { type: String, required: true },
    contact: { type: String, default: null },
    website: { type: String, default: null },
    inventorySize: { type: String, default: null },
    status: {
      type: String,
      enum: ['new', 'contacted', 'invited', 'onboarded', 'declined'],
      default: 'new',
      index: true,
    },
    adminNotes: { type: String },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent duplicate submissions from same wallet within 24 hours
VendorInterestSchema.index(
  { wallet: 1, createdAt: 1 },
  { partialFilterExpression: { wallet: { $ne: null } } }
);

export const VendorInterest =
  models.VendorInterest || model('VendorInterest', VendorInterestSchema);

export default VendorInterest;
