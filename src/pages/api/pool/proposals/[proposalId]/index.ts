// src/pages/api/pool/proposals/[proposalId]/index.ts
// Get a single proposal by ID
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../../lib/database/mongodb';
import { Pool } from '../../../../../lib/models/Pool';
import { PoolProposal } from '../../../../../lib/models/PoolProposal';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { proposalId } = req.query;

    await dbConnect();

    // Find the proposal
    const proposal = await PoolProposal.findById(proposalId)
      .populate('proposedByUser', 'wallet username avatar')
      .populate('pool', 'bagsTokenMint squadMultisigPda squadVaultPda status');

    if (!proposal || proposal.deleted) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Calculate percentages
    const approvalPercent =
      proposal.totalVotePower > 0
        ? Math.round((proposal.forVotePower / proposal.totalVotePower) * 100)
        : 0;
    const rejectionPercent =
      proposal.totalVotePower > 0
        ? Math.round((proposal.againstVotePower / proposal.totalVotePower) * 100)
        : 0;
    const participationPercent =
      proposal.totalVotePower > 0
        ? Math.round(
            ((proposal.forVotePower + proposal.againstVotePower) / proposal.totalVotePower) * 100
          )
        : 0;

    return res.status(200).json({
      success: true,
      proposal: {
        _id: proposal._id,
        proposalType: proposal.proposalType,
        title: proposal.title,
        description: proposal.description,
        proposedBy: proposal.proposedBy,
        proposedByUser: proposal.proposedByUser,
        proposedAt: proposal.proposedAt,
        status: proposal.status,
        // Voting
        approvalThreshold: proposal.approvalThreshold,
        votingDeadline: proposal.votingDeadline,
        forVotePower: proposal.forVotePower,
        againstVotePower: proposal.againstVotePower,
        totalVotePower: proposal.totalVotePower,
        forVoteCount: proposal.forVoteCount,
        againstVoteCount: proposal.againstVoteCount,
        // Computed
        approvalPercent,
        rejectionPercent,
        participationPercent,
        hasReachedThreshold: approvalPercent >= proposal.approvalThreshold,
        isExpired: proposal.votingDeadline && new Date() > proposal.votingDeadline,
        // Proposal-specific data
        askingPriceUSD: proposal.askingPriceUSD,
        listingDurationDays: proposal.listingDurationDays,
        offerAmountUSD: proposal.offerAmountUSD,
        buyerWallet: proposal.buyerWallet,
        offerExpiresAt: proposal.offerExpiresAt,
        // Squads
        squadsTransactionIndex: proposal.squadsTransactionIndex,
        squadsProposalPda: proposal.squadsProposalPda,
        // Execution
        executedAt: proposal.executedAt,
        executedBy: proposal.executedBy,
        executionTx: proposal.executionTx,
        resultType: proposal.resultType,
        resultMessage: proposal.resultMessage,
        // Voters (show who voted, not how they voted for privacy)
        voters: [
          ...proposal.votesFor.map((v: { wallet: string; votePower: number; votedAt: Date }) => ({
            wallet: v.wallet,
            votePower: v.votePower,
            votedAt: v.votedAt,
            vote: 'for',
          })),
          ...proposal.votesAgainst.map(
            (v: { wallet: string; votePower: number; votedAt: Date }) => ({
              wallet: v.wallet,
              votePower: v.votePower,
              votedAt: v.votedAt,
              vote: 'against',
            })
          ),
        ].sort((a, b) => new Date(b.votedAt).getTime() - new Date(a.votedAt).getTime()),
        // Pool info
        pool: proposal.pool,
        // Timestamps
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/pool/proposals/[proposalId]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch proposal',
      details: error?.message,
    });
  }
}
