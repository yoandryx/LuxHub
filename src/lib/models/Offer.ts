// src/models/Offer.ts
import { Schema, model, models } from 'mongoose';

const OfferSchema = new Schema(
  {
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    fromUser: { type: Schema.Types.ObjectId, ref: 'User' }, // Buyer making offer
    toVendor: { type: Schema.Types.ObjectId, ref: 'Vendor' }, // Seller receiving
    offerPriceUSD: { type: Number, required: true },
    counterOffers: [
      {
        price: Number,
        from: { type: Schema.Types.ObjectId, ref: 'User' }, // Vendor or buyer counter
        at: Date,
      },
    ], // NEW: Negotiation history
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'settled', 'expired'],
      default: 'pending',
      index: true,
    },
    escrowPda: String, // On-chain PDA if accepted
    txSignature: String, // Settlement tx
    negotiationNotes: [String], // Off-chain messages (e.g., "Agreed to split shipping")
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OfferSchema.index({ status: 1 });

OfferSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'accepted') {
    // Trigger escrow creation in service
    this.status = 'settled'; // On success
  }
  next();
});

export const Offer = models.Offer || model('Offer', OfferSchema);
