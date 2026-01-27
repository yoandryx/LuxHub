// src/lib/models/PoolProposal.ts
import { Schema, model, models } from 'mongoose';

/**
 * PoolProposal Model
 * Governance proposals for graduated pool DAOs
 *
 * Token holders can vote on:
 * - relist_for_sale: Set asking price, list watch for sale
 * - accept_offer: Accept/reject incoming purchase offers
 */
const PoolProposalSchema = new Schema(
  {
    // ========== POOL REFERENCE ==========
    pool: { type: Schema.Types.ObjectId, ref: 'Pool', required: true, index: true },

    // ========== PROPOSAL TYPE ==========
    proposalType: {
      type: String,
      enum: ['relist_for_sale', 'accept_offer', 'change_threshold', 'add_member', 'remove_member'],
      required: true,
    },

    // ========== PROPOSAL CONTENT ==========
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },

    // ========== PROPOSER ==========
    proposedBy: { type: String, required: true, index: true }, // Wallet address
    proposedByUser: { type: Schema.Types.ObjectId, ref: 'User' },
    proposedAt: { type: Date, default: Date.now },

    // ========== PROPOSAL-SPECIFIC DATA ==========
    // For relist_for_sale
    askingPriceUSD: { type: Number },
    listingDurationDays: { type: Number, default: 30 },

    // For accept_offer
    offerAmountUSD: { type: Number },
    buyerWallet: { type: String },
    offerExpiresAt: { type: Date },

    // For change_threshold
    newThreshold: { type: Number },

    // For add_member / remove_member
    memberWallet: { type: String },
    memberPermissions: { type: Number },

    // ========== SQUADS INTEGRATION ==========
    squadsTransactionIndex: { type: String },
    squadsProposalPda: { type: String },
    squadsVaultTransactionPda: { type: String },

    // ========== VOTING CONFIG ==========
    approvalThreshold: { type: Number, required: true, default: 60 }, // 60% default
    votingDeadline: { type: Date }, // When voting ends

    // ========== VOTES ==========
    votesFor: [
      {
        wallet: { type: String, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        tokenBalance: { type: Number, required: true },
        votePower: { type: Number, required: true }, // Ownership % at time of vote
        votedAt: { type: Date, default: Date.now },
      },
    ],
    votesAgainst: [
      {
        wallet: { type: String, required: true },
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        tokenBalance: { type: Number, required: true },
        votePower: { type: Number, required: true },
        votedAt: { type: Date, default: Date.now },
      },
    ],

    // ========== VOTE TOTALS (cached for performance) ==========
    totalVotePower: { type: Number, default: 0 }, // Total vote power of all eligible voters
    forVotePower: { type: Number, default: 0 }, // Sum of votePower for votes
    againstVotePower: { type: Number, default: 0 }, // Sum of votePower against votes
    forVoteCount: { type: Number, default: 0 },
    againstVoteCount: { type: Number, default: 0 },

    // ========== STATUS ==========
    status: {
      type: String,
      enum: [
        'draft', // Being prepared
        'active', // Open for voting
        'approved', // Threshold met, pending execution
        'rejected', // Failed to meet threshold
        'executed', // Successfully executed
        'cancelled', // Cancelled by proposer
        'expired', // Voting deadline passed without quorum
      ],
      default: 'draft',
      index: true,
    },

    // ========== EXECUTION ==========
    executedAt: { type: Date },
    executedBy: { type: String }, // Wallet that triggered execution
    executionTx: { type: String }, // Transaction signature

    // ========== RESULT ==========
    resultType: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
    },
    resultMessage: { type: String },
    resultData: { type: Schema.Types.Mixed }, // Any additional result data

    // ========== METADATA ==========
    tags: [{ type: String }],
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ========== INDEXES ==========
PoolProposalSchema.index({ pool: 1, status: 1 });
PoolProposalSchema.index({ proposedBy: 1, status: 1 });
PoolProposalSchema.index({ status: 1, votingDeadline: 1 });
PoolProposalSchema.index({ 'votesFor.wallet': 1 });
PoolProposalSchema.index({ 'votesAgainst.wallet': 1 });

// ========== VIRTUALS ==========
PoolProposalSchema.virtual('approvalPercent').get(function () {
  if (this.totalVotePower === 0) return 0;
  return Math.round((this.forVotePower / this.totalVotePower) * 100);
});

PoolProposalSchema.virtual('rejectionPercent').get(function () {
  if (this.totalVotePower === 0) return 0;
  return Math.round((this.againstVotePower / this.totalVotePower) * 100);
});

PoolProposalSchema.virtual('participationPercent').get(function () {
  if (this.totalVotePower === 0) return 0;
  const voted = this.forVotePower + this.againstVotePower;
  return Math.round((voted / this.totalVotePower) * 100);
});

PoolProposalSchema.virtual('hasReachedThreshold').get(function () {
  if (this.totalVotePower === 0) return false;
  const approvalPercent = Math.round((this.forVotePower / this.totalVotePower) * 100);
  return approvalPercent >= this.approvalThreshold;
});

PoolProposalSchema.virtual('isExpired').get(function () {
  if (!this.votingDeadline) return false;
  return new Date() > this.votingDeadline;
});

// ========== METHODS ==========
PoolProposalSchema.methods.hasVoted = function (wallet: string): 'for' | 'against' | null {
  if (this.votesFor.some((v: { wallet: string }) => v.wallet === wallet)) return 'for';
  if (this.votesAgainst.some((v: { wallet: string }) => v.wallet === wallet)) return 'against';
  return null;
};

PoolProposalSchema.methods.canVote = function (wallet: string): boolean {
  // Can't vote if already voted
  if (this.hasVoted(wallet)) return false;
  // Can't vote if not active
  if (this.status !== 'active') return false;
  // Can't vote if expired
  if (this.isExpired) return false;
  return true;
};

// ========== PRE-SAVE HOOKS ==========
PoolProposalSchema.pre('save', function (next) {
  // Update vote totals
  this.forVoteCount = this.votesFor.length;
  this.againstVoteCount = this.votesAgainst.length;
  this.forVotePower = this.votesFor.reduce(
    (sum: number, v: { votePower: number }) => sum + (v.votePower || 0),
    0
  );
  this.againstVotePower = this.votesAgainst.reduce(
    (sum: number, v: { votePower: number }) => sum + (v.votePower || 0),
    0
  );

  // Auto-approve if threshold met
  if (this.status === 'active' && this.totalVotePower > 0) {
    const approvalPercent = (this.forVotePower / this.totalVotePower) * 100;
    if (approvalPercent >= this.approvalThreshold) {
      this.status = 'approved';
    }
  }

  // Auto-reject if majority against
  if (this.status === 'active' && this.totalVotePower > 0) {
    const rejectionPercent = (this.againstVotePower / this.totalVotePower) * 100;
    if (rejectionPercent > 100 - this.approvalThreshold) {
      this.status = 'rejected';
    }
  }

  next();
});

// ========== STATICS ==========
PoolProposalSchema.statics.getActiveProposals = async function (poolId: string) {
  return this.find({
    pool: poolId,
    status: 'active',
    deleted: false,
  }).sort({ createdAt: -1 });
};

PoolProposalSchema.statics.getPendingExecution = async function (poolId: string) {
  return this.find({
    pool: poolId,
    status: 'approved',
    deleted: false,
  }).sort({ createdAt: -1 });
};

PoolProposalSchema.statics.getProposalsByVoter = async function (wallet: string) {
  return this.find({
    $or: [{ 'votesFor.wallet': wallet }, { 'votesAgainst.wallet': wallet }],
    deleted: false,
  })
    .populate('pool')
    .sort({ createdAt: -1 });
};

export const PoolProposal = models.PoolProposal || model('PoolProposal', PoolProposalSchema);
