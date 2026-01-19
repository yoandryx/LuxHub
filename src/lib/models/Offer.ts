// src/models/Offer.ts
import { Schema, model, models } from 'mongoose';

const OfferSchema = new Schema(
  {
    // ========== ASSET & ESCROW REFERENCES ==========
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    escrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' }, // Link to escrow
    escrowPda: { type: String, index: true }, // On-chain PDA for quick lookup

    // ========== PARTICIPANTS ==========
    fromUser: { type: Schema.Types.ObjectId, ref: 'User' }, // Buyer making offer
    buyerWallet: { type: String, index: true }, // Buyer wallet for on-chain ops
    toVendor: { type: Schema.Types.ObjectId, ref: 'Vendor' }, // Seller receiving
    vendorWallet: { type: String }, // Vendor wallet for quick lookup

    // ========== OFFER DETAILS ==========
    offerAmount: { type: Number, required: true }, // Offer amount in lamports
    offerPriceUSD: { type: Number, required: true }, // Offer in USD
    offerCurrency: {
      type: String,
      enum: ['SOL', 'USDC', 'WSOL'],
      default: 'SOL',
    },
    message: { type: String }, // Optional buyer message to vendor

    // ========== NEGOTIATION HISTORY ==========
    counterOffers: [
      {
        amount: Number, // In lamports
        amountUSD: Number, // In USD
        from: { type: String }, // Wallet address who made counter
        fromType: { type: String, enum: ['buyer', 'vendor'] },
        message: String,
        at: { type: Date, default: Date.now },
      },
    ],
    negotiationNotes: [String], // Off-chain messages

    // ========== STATUS ==========
    status: {
      type: String,
      enum: [
        'pending', // Awaiting vendor response
        'countered', // Vendor made counter-offer
        'accepted', // Vendor accepted, awaiting buyer deposit
        'rejected', // Vendor rejected offer
        'withdrawn', // Buyer withdrew offer
        'expired', // Offer expired (optional timeout)
        'settled', // Funds deposited, transaction complete
        'auto_rejected', // Auto-rejected due to pool conversion
      ],
      default: 'pending',
      index: true,
    },

    // ========== RESPONSE TRACKING ==========
    respondedAt: { type: Date },
    respondedBy: { type: String }, // Wallet that responded
    rejectionReason: { type: String },
    autoRejectedReason: { type: String }, // Reason for auto-rejection

    // ========== SETTLEMENT ==========
    txSignature: String, // Settlement tx signature
    settledAt: { type: Date },
    settledAmount: { type: Number }, // Final settled amount (may differ from offer)

    // ========== EXPIRATION (OPTIONAL) ==========
    expiresAt: { type: Date }, // Optional expiration for time-limited offers

    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
OfferSchema.index({ status: 1 });
OfferSchema.index({ escrowId: 1, status: 1 }); // Offers for an escrow
OfferSchema.index({ buyerWallet: 1, status: 1 }); // Buyer's offers
OfferSchema.index({ vendorWallet: 1, status: 1 }); // Vendor's received offers
OfferSchema.index({ asset: 1, status: 1 }); // Offers on an asset
OfferSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true }); // TTL for expired offers

// ========== PRE-SAVE HOOKS ==========
OfferSchema.pre('save', function (next) {
  // When offer is accepted and settled, update timestamp
  if (this.isModified('status') && this.status === 'settled' && !this.settledAt) {
    this.settledAt = new Date();
  }

  // When vendor responds, update timestamp
  if (
    this.isModified('status') &&
    ['accepted', 'rejected', 'countered'].includes(this.status as string) &&
    !this.respondedAt
  ) {
    this.respondedAt = new Date();
  }

  next();
});

export const Offer = models.Offer || model('Offer', OfferSchema);
