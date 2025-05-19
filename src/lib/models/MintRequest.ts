import mongoose from 'mongoose';

const MintRequestSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  brand: String,
  serialNumber: String,
  fileCid: { type: String, required: true },
  wallet: { type: String, required: true },
  timestamp: { type: Number, required: true },
  status: { type: String, default: 'pending' } // pending | approved | rejected
});

export default mongoose.models.MintRequest || mongoose.model('MintRequest', MintRequestSchema);
