// src/lib/models/Notification.ts
import { Schema, model, models } from 'mongoose';

const NotificationSchema = new Schema(
  {
    // ========== RECIPIENT ==========
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userWallet: { type: String, required: true, index: true }, // Denormalized for quick lookup

    // ========== NOTIFICATION CONTENT ==========
    type: {
      type: String,
      enum: [
        // Shipping & Order Events
        'order_funded', // Buyer funded escrow
        'order_shipped', // Vendor shipped item
        'order_delivered', // Delivery confirmed
        'payment_released', // Funds released to vendor
        // Shipment Verification Events
        'shipment_submitted', // Vendor submitted proof (for admin)
        'shipment_verified', // Admin verified shipment
        'shipment_rejected', // Admin rejected shipment
        // Offer Events
        'offer_received', // Vendor received offer
        'offer_accepted', // Buyer's offer accepted
        'offer_rejected', // Buyer's offer rejected
        'offer_countered', // Vendor made counter-offer
        // Vendor Events
        'vendor_approved', // Vendor application approved
        'vendor_rejected', // Vendor application rejected
        'sale_request_approved', // Admin approved sale request
        'sale_request_rejected', // Admin rejected sale request
        // Pool Events
        'pool_investment', // User invested in pool
        'pool_distribution', // Pool distributed funds
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },

    // ========== METADATA ==========
    metadata: {
      escrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' },
      escrowPda: { type: String },
      offerId: { type: Schema.Types.ObjectId, ref: 'Offer' },
      assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
      vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
      poolId: { type: Schema.Types.ObjectId, ref: 'Pool' },
      txSignature: { type: String },
      trackingNumber: { type: String },
      trackingCarrier: { type: String },
      actionUrl: { type: String }, // Deep link to relevant page
      amount: { type: Number }, // Transaction amount (lamports or USD)
      amountUSD: { type: Number },
    },

    // ========== STATUS ==========
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
    emailError: { type: String }, // Store error if email failed
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
// Primary query: get unread notifications for a user
NotificationSchema.index({ userWallet: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });
// Query by type for analytics
NotificationSchema.index({ type: 1, createdAt: -1 });
// De-duplication query
NotificationSchema.index({ userWallet: 1, type: 1, 'metadata.escrowId': 1, createdAt: -1 });

// ========== PRE-SAVE HOOKS ==========
NotificationSchema.pre('save', function (next) {
  // Auto-set readAt when marked as read
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  next();
});

// ========== STATIC METHODS ==========
NotificationSchema.statics.getUnreadCount = async function (userWallet: string): Promise<number> {
  return this.countDocuments({ userWallet, read: false, deleted: false });
};

NotificationSchema.statics.markAllAsRead = async function (userWallet: string): Promise<void> {
  await this.updateMany({ userWallet, read: false }, { $set: { read: true, readAt: new Date() } });
};

export const Notification = models.Notification || model('Notification', NotificationSchema);
