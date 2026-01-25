// models/SaleRequest.ts
import mongoose from 'mongoose';

const SaleRequestSchema = new mongoose.Schema({
  nftId: { type: String, required: true },
  ipfs_pin_hash: { type: String, required: true },
  seller: { type: String, required: true },
  seed: { type: Number, required: true },
  initializerAmount: { type: Number, required: true },
  takerAmount: { type: Number, required: true },
  fileCid: { type: String, required: true },
  salePrice: { type: Number, required: true },
  timestamp: { type: Number, required: true },
  buyer: { type: String, required: false },
  marketStatus: {
    type: String,
    enum: ['pending', 'active', 'sold', 'rejected'],
    default: 'pending',
  },
  rejectedAt: { type: Date, required: false },
});

// If the model already exists, reuse it.
export default mongoose.models.SaleRequest || mongoose.model('SaleRequest', SaleRequestSchema);
