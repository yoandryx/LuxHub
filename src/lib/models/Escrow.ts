// src/models/Escrow.ts
import { Schema, model, models } from 'mongoose';

const EscrowSchema = new Schema(
  {
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User' },
    seller: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    sellerWallet: { type: String }, // Vendor wallet address for quick lookup
    escrowPda: { type: String, required: true, unique: true }, // Solana PDA for on-chain escrow
    nftMint: { type: String, index: true }, // NFT mint address
    amountUSD: Number,
    royaltyAmount: Number,

    // ========== SALE MODE (NEW) ==========
    saleMode: {
      type: String,
      enum: ['fixed_price', 'accepting_offers', 'crowdfunded'],
      default: 'fixed_price',
      index: true,
    },

    // ========== FLEXIBLE PRICING (NEW) ==========
    listingPrice: { type: Number }, // Current listing price in lamports
    listingPriceUSD: { type: Number }, // Price in USD for display
    minimumOffer: { type: Number }, // For accepting_offers mode (lamports)
    minimumOfferUSD: { type: Number }, // Min offer in USD
    acceptingOffers: { type: Boolean, default: false }, // Toggle for offer mode

    // ========== BUYER SHIPPING ADDRESS (NEW) ==========
    buyerShippingAddress: {
      fullName: { type: String },
      street1: { type: String },
      street2: { type: String },
      city: { type: String },
      state: { type: String }, // State/Province
      postalCode: { type: String },
      country: { type: String },
      phone: { type: String },
      email: { type: String },
      deliveryInstructions: { type: String },
    },

    // ========== SHIPMENT TRACKING (ENHANCED) ==========
    shipmentStatus: {
      type: String,
      enum: ['pending', 'shipped', 'in_transit', 'delivered', 'proof_submitted', 'verified'],
      default: 'pending',
      index: true,
    },
    trackingCarrier: { type: String }, // FedEx, UPS, DHL, etc.
    trackingNumber: { type: String },
    trackingUrl: { type: String }, // Direct tracking URL
    shipmentProofUrls: [{ type: String }], // Photo proof uploaded to IPFS
    shipmentSubmittedAt: { type: Date },
    shipmentVerifiedAt: { type: Date },
    shipmentVerifiedBy: { type: String }, // Admin wallet who verified
    estimatedDeliveryDate: { type: Date }, // ETA from carrier
    actualDeliveryDate: { type: Date }, // Confirmed delivery date

    // ========== VENDOR SHIPMENT INFO (NEW) ==========
    vendorShipmentNotes: { type: String }, // Notes from vendor about shipment
    shippedFromAddress: {
      city: { type: String },
      state: { type: String },
      country: { type: String },
    },

    // ========== EASYPOST INTEGRATION (NEW) ==========
    easypostShipmentId: { type: String }, // EasyPost shipment ID
    pendingShipmentId: { type: String }, // Shipment ID before label purchase
    shippingLabelUrl: { type: String }, // URL to download shipping label
    shippingLabelFormat: { type: String, default: 'PDF' }, // Label format (PDF, PNG, ZPL)
    shippingRate: { type: Number }, // Rate paid for shipping
    shippingInsurance: { type: Number }, // Insurance amount in USD
    lastTrackingUpdate: { type: Date }, // Last time tracking was refreshed

    // ========== DELIVERY CONFIRMATION (NEW) ==========
    deliveryConfirmation: {
      confirmedBy: { type: String }, // Wallet that confirmed
      confirmationType: { type: String, enum: ['buyer', 'admin'] },
      confirmedAt: { type: Date },
      rating: { type: Number, min: 1, max: 5 },
      reviewText: { type: String },
    },
    deliveryNotes: { type: String }, // Notes from buyer about delivery

    // ========== POOL CONVERSION (NEW) ==========
    convertedToPool: { type: Boolean, default: false },
    poolId: { type: Schema.Types.ObjectId, ref: 'Pool' },
    poolConvertedAt: { type: Date },

    // ========== OFFER TRACKING (NEW) ==========
    activeOfferCount: { type: Number, default: 0 },
    highestOffer: { type: Number }, // Highest pending offer amount
    acceptedOfferId: { type: Schema.Types.ObjectId, ref: 'Offer' },

    // ========== ESCROW STATUS ==========
    status: {
      type: String,
      enum: [
        'initiated', // Escrow PDA created
        'listed', // Active on marketplace
        'offer_accepted', // Vendor accepted an offer, awaiting buyer deposit
        'funded', // Buyer deposited funds
        'shipped', // Vendor shipped item
        'delivered', // Item delivered (tracking shows delivered)
        'released', // Funds released to seller
        'cancelled', // Escrow cancelled
        'failed', // Transaction failed
        'converted', // Converted to pool
      ],
      default: 'initiated',
      index: true,
    },
    oracleConfirmed: { type: Boolean, default: false },
    txSignature: String,
    expiresAt: Date,
    deleted: { type: Boolean, default: false },

    // ========== SQUADS PROTOCOL MULTISIG ==========
    squadsTransactionIndex: { type: String, index: true }, // Squads vault transaction index
    squadsExecutionSignature: String, // Transaction signature after Squads execution
    squadsProposedAt: Date, // When the proposal was created
    squadsExecutedAt: Date, // When the proposal was executed

    // ========== CONFIRM DELIVERY SQUADS TRACKING (NEW) ==========
    confirmDeliveryProposalIndex: { type: String }, // Squads proposal for confirm_delivery
    confirmDeliveryProposedAt: { type: Date },
    confirmDeliveryExecutedAt: { type: Date },

    // ========== WEBHOOK TRACKING ==========
    lastSyncedAt: { type: Date }, // Last webhook sync timestamp
    lastTxSignature: { type: String }, // Last processed transaction signature
    fundedAt: { type: Date }, // When buyer funded the escrow
    fundedAmount: { type: Number }, // Amount funded in lamports
    releasedAt: { type: Date }, // When funds were released
    buyerWallet: { type: String, index: true }, // Buyer wallet address
    listedAt: { type: Date }, // When NFT was listed
    listingTxSignature: { type: String }, // Listing transaction signature
    cancelledAt: { type: Date }, // When escrow was cancelled
    cancelReason: { type: String }, // Reason for cancellation

    // ========== ROYALTY TRACKING ==========
    royaltyPaid: { type: Boolean, default: false }, // Treasury fee paid
    royaltyTxSignature: { type: String }, // Royalty payment transaction
  },
  { timestamps: true }
);

// ========== INDEXES ==========
EscrowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
EscrowSchema.index({ saleMode: 1, status: 1 }); // Query by sale mode + status
EscrowSchema.index({ sellerWallet: 1, status: 1 }); // Vendor queries
EscrowSchema.index({ shipmentStatus: 1 }); // Shipment verification queries
EscrowSchema.index({ convertedToPool: 1 }); // Pool conversion queries

// ========== PRE-SAVE HOOKS ==========
EscrowSchema.pre('save', function (next) {
  // Calculate royalty (3% of listing price)
  if (this.isModified('listingPriceUSD') && this.listingPriceUSD) {
    this.royaltyAmount = this.listingPriceUSD * 0.03;
  }

  // Auto-set acceptingOffers based on saleMode
  if (this.isModified('saleMode')) {
    this.acceptingOffers = this.saleMode === 'accepting_offers';
  }

  // Update status to 'listed' when escrow is initialized and has price
  if (this.status === 'initiated' && this.listingPrice) {
    this.status = 'listed';
  }

  next();
});

export const Escrow = models.Escrow || model('Escrow', EscrowSchema);
