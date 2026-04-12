// src/models/PoolDistribution.ts
import { Schema, model, models } from 'mongoose';

const PoolDistributionSchema = new Schema(
  {
    pool: { type: Schema.Types.ObjectId, ref: 'Pool', required: true },
    salePriceUSD: { type: Number, required: true }, // Final sale amount
    luxhubRoyaltyUSD: { type: Number, required: true }, // 3% to LuxHub treasury PDA
    totalDistributedUSD: Number, // 97% pro-rata to users

    // Phase 11: distribution kind and claim lifecycle fields
    distributionKind: {
      type: String,
      enum: ['resale', 'abort_refund'],
      default: 'resale',
      required: true,
    },
    snapshotTakenAt: { type: Date, required: false },
    claimDeadlineAt: { type: Date, required: false }, // snapshotTakenAt + 90 days
    sourceEscrowPda: { type: String, required: false }, // backing escrow for 'resale', refund escrow for 'abort_refund'
    sourceTxSignature: { type: String, required: false }, // confirm_delivery tx for resale, refund tx for abort

    distributions: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        shares: Number,
        payoutUSD: Number, // Per-user amount
        txSignature: String, // On-chain payout tx
        payoutWallet: String, // User's wallet for distribution
        paidAt: Date,

        // Phase 11: per-holder claim lifecycle fields
        burnTxSignature: { type: String, required: false }, // client-signed burn tx, verified by claim endpoint
        paidTxSignature: { type: String, required: false }, // Squads proposal execution tx for the USDC payout
        claimedAt: { type: Date, required: false },
        claimTxSignature: { type: String, required: false },
        notifiedAt60days: { type: Date, required: false },
        notifiedAt30days: { type: Date, required: false },
        notifiedAt7days: { type: Date, required: false },
        notifiedAt1day: { type: Date, required: false },
        squadsProposalIndex: { type: Number, required: false }, // for deep-linking + idempotency
        _id: false,
      },
    ],
    treasuryPda: String, // LuxHub royalty receiver PDA
    status: {
      type: String,
      enum: ['pending', 'partial_distributed', 'distributed', 'failed', 'snapshot_failed', 'expired'],
      default: 'pending',
    },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Pre-save hook: auto-calc royalty and auto-compute claimDeadlineAt
PoolDistributionSchema.pre('save', function (next) {
  // Auto-calc royalty and distributions
  if (typeof this.salePriceUSD === 'number') {
    this.luxhubRoyaltyUSD = Math.round(this.salePriceUSD * 0.03 * 100) / 100;
    this.totalDistributedUSD = this.salePriceUSD - this.luxhubRoyaltyUSD;
  }

  // Phase 11: auto-compute claimDeadlineAt from snapshotTakenAt + 90 days
  if (this.snapshotTakenAt && !this.claimDeadlineAt) {
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    this.claimDeadlineAt = new Date(
      (this.snapshotTakenAt as Date).getTime() + NINETY_DAYS_MS
    );
  }

  next();
});

// Phase 11: compound indexes for cron hot paths
PoolDistributionSchema.index({ claimDeadlineAt: 1, status: 1 }); // sweep + notify crons
PoolDistributionSchema.index({ pool: 1, distributionKind: 1 });
PoolDistributionSchema.index({ 'distributions.wallet': 1 }); // holder-lookup for claim endpoint

// Idempotency guard: one PoolDistribution per (pool, sourceTxSignature).
// Prevents duplicate distribution records if confirm-resale or abort webhook replays.
// sparse: true because legacy records created before sourceTxSignature existed will have null.
PoolDistributionSchema.index(
  { pool: 1, sourceTxSignature: 1 },
  { unique: true, sparse: true }
);

export const PoolDistribution =
  models.PoolDistribution || model('PoolDistribution', PoolDistributionSchema);
