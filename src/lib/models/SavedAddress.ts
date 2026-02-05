// src/lib/models/SavedAddress.ts
// Model for storing user's saved shipping addresses for reuse
import { Schema, model, models } from 'mongoose';

const SavedAddressSchema = new Schema(
  {
    // Owner wallet address
    wallet: {
      type: String,
      required: true,
      index: true,
    },

    // User-friendly label (e.g., "Home", "Office", "Vacation Home")
    label: {
      type: String,
      required: true,
      maxlength: 50,
      default: 'Default Address',
    },

    // Shipping address fields
    fullName: { type: String, required: true },
    street1: { type: String, required: true },
    street2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true, default: 'United States' },

    // Contact info
    phone: { type: String },
    email: { type: String },

    // Delivery preferences
    deliveryInstructions: { type: String, maxlength: 500 },

    // Default address flag (only one per wallet)
    isDefault: { type: Boolean, default: false },

    // EasyPost verified address ID (optional)
    easypostAddressId: { type: String },
    verified: { type: Boolean, default: false },

    // Soft delete
    deleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups by wallet
SavedAddressSchema.index({ wallet: 1, deleted: 1 });

// Ensure only one default address per wallet
SavedAddressSchema.pre('save', async function (next) {
  if (this.isDefault && !this.deleted) {
    // Unset other defaults for this wallet
    await (this.constructor as any).updateMany(
      { wallet: this.wallet, _id: { $ne: this._id }, deleted: false },
      { isDefault: false }
    );
  }
  next();
});

// Static method to get user's addresses
SavedAddressSchema.statics.getByWallet = function (wallet: string) {
  return this.find({ wallet, deleted: false }).sort({ isDefault: -1, updatedAt: -1 });
};

// Static method to get default address
SavedAddressSchema.statics.getDefault = function (wallet: string) {
  return this.findOne({ wallet, isDefault: true, deleted: false });
};

// Instance method to set as default
SavedAddressSchema.methods.setAsDefault = async function () {
  // Unset other defaults
  await (this.constructor as any).updateMany(
    { wallet: this.wallet, _id: { $ne: this._id }, deleted: false },
    { isDefault: false }
  );
  this.isDefault = true;
  return this.save();
};

// Virtual for formatted address string
SavedAddressSchema.virtual('formattedAddress').get(function () {
  const parts = [
    this.street1,
    this.street2,
    `${this.city}, ${this.state} ${this.postalCode}`,
    this.country,
  ].filter(Boolean);
  return parts.join(', ');
});

// Ensure virtuals are included in JSON output
SavedAddressSchema.set('toJSON', { virtuals: true });
SavedAddressSchema.set('toObject', { virtuals: true });

export const SavedAddress = models.SavedAddress || model('SavedAddress', SavedAddressSchema);
