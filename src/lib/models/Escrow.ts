// src/models/Escrow.ts
import { Schema, model, models } from 'mongoose';

const EscrowSchema = new Schema(
  {
    asset: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User' },
    seller: { type: Schema.Types.ObjectId, ref: 'Vendor' },
    escrowPda: { type: String, required: true, unique: true }, // Solana PDA for on-chain escrow
    amountUSD: Number,
    royaltyAmount: Number,
    trackingNumber: String,
    status: {
      type: String,
      enum: ['initiated', 'funded', 'shipped', 'delivered', 'released', 'cancelled', 'failed'],
      default: 'initiated',
      index: true,
    },
    oracleConfirmed: { type: Boolean, default: false },
    txSignature: String,
    expiresAt: Date,
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

EscrowSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Escrow = models.Escrow || model('Escrow', EscrowSchema);
