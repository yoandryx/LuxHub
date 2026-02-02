// src/lib/models/DelistRequest.ts
// Model for vendor requests to delist/remove NFTs from marketplace
import { Schema, model, models, Document } from 'mongoose';

export interface IDelistRequest extends Document {
  asset: Schema.Types.ObjectId;
  mintAddress: string;
  vendor: Schema.Types.ObjectId;
  vendorWallet: string;
  reason: 'sold_externally' | 'damaged' | 'lost' | 'stolen' | 'returned' | 'other';
  reasonDetails: string;
  requestedAction: 'delist' | 'burn';
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DelistRequestSchema = new Schema(
  {
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    mintAddress: { type: String, required: true, index: true },
    vendor: { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    vendorWallet: { type: String, required: true },
    reason: {
      type: String,
      enum: ['sold_externally', 'damaged', 'lost', 'stolen', 'returned', 'other'],
      required: true,
    },
    reasonDetails: { type: String, required: true },
    requestedAction: {
      type: String,
      enum: ['delist', 'burn'],
      default: 'delist',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    reviewNotes: { type: String },
  },
  { timestamps: true }
);

// Prevent duplicate pending requests for same asset
DelistRequestSchema.index({ asset: 1, status: 1 }, { unique: false });

export const DelistRequest =
  models.DelistRequest || model<IDelistRequest>('DelistRequest', DelistRequestSchema);

export default DelistRequest;
