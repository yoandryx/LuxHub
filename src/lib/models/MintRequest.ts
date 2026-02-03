import mongoose from 'mongoose';

const MintRequestSchema = new mongoose.Schema(
  {
    // Required fields
    title: { type: String, required: true },
    brand: { type: String, required: true },
    model: { type: String, required: true },
    referenceNumber: { type: String, required: true }, // Alphanumeric (e.g., "116595RBOW-2024")
    priceUSD: { type: Number, required: true }, // USD as source of truth
    imageBase64: { type: String }, // Base64 encoded image (optional if imageUrl provided)
    wallet: { type: String, required: true },
    timestamp: { type: Number, required: true },

    // Optional fields
    description: { type: String },
    material: { type: String },
    productionYear: { type: String },
    movement: { type: String },
    caseSize: { type: String },
    waterResistance: { type: String },
    dialColor: { type: String },
    country: { type: String },
    condition: { type: String },
    boxPapers: { type: String },
    limitedEdition: { type: String },
    certificate: { type: String },
    warrantyInfo: { type: String },
    provenance: { type: String },
    features: { type: String },
    releaseDate: { type: String },
    imageCid: { type: String }, // IPFS CID if uploaded
    imageUrl: { type: String }, // Direct URL if provided

    // Legacy field support (maps to priceUSD for old data)
    priceSol: { type: Number },
    // Legacy field support (maps to referenceNumber)
    serialNumber: { type: String },

    // Admin fields
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'minted'],
      default: 'pending',
    },
    adminNotes: { type: String },

    // Review tracking (approval step)
    reviewedBy: { type: String }, // Wallet that approved/rejected
    reviewedAt: { type: Date },

    // Minting tracking (mint step - separate from review)
    mintedBy: { type: String }, // Wallet that executed the mint
    mintedAt: { type: Date },
    mintAddress: { type: String }, // NFT mint address after minting
    mintSignature: { type: String }, // Transaction signature

    // Pending mint state (metadata prepared, awaiting client-side mint)
    pendingMint: {
      type: {
        metadataUri: String,
        imageUrl: String,
        imageTxId: String,
        preparedAt: Date,
        preparedBy: String,
      },
      required: false,
    },

    // Squads integration
    squadsProposalIndex: { type: Number }, // If minted through Squads
    squadsMemberWallet: { type: String }, // Which Squads member authorized
  },
  { timestamps: true }
);

// Pre-save hook to handle legacy field migration
MintRequestSchema.pre('save', function (next) {
  // Map serialNumber to referenceNumber if provided
  if (this.serialNumber && !this.referenceNumber) {
    this.referenceNumber = this.serialNumber;
  }
  next();
});

// Virtual to get price in SOL (for display purposes)
MintRequestSchema.virtual('estimatedSolPrice').get(function () {
  // This would need to be calculated at runtime with current SOL price
  return this.priceUSD;
});

export default mongoose.models.MintRequest || mongoose.model('MintRequest', MintRequestSchema);
