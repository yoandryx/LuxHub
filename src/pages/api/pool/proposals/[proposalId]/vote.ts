// src/pages/api/pool/proposals/[proposalId]/vote.ts
// Vote on a governance proposal
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../../lib/database/mongodb';
import { Pool } from '../../../../../lib/models/Pool';
import { PoolProposal } from '../../../../../lib/models/PoolProposal';
import { User } from '../../../../../lib/models/User';
import { verifyTokenHolder } from '../../../../../lib/services/heliusService';

interface VoteRequest {
  voterWallet: string;
  vote: 'for' | 'against';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { proposalId } = req.query;
    const { voterWallet, vote } = req.body as VoteRequest;

    // Validation
    if (!proposalId || !voterWallet || !vote) {
      return res.status(400).json({
        error: 'Missing required fields: voterWallet, vote (for/against)',
      });
    }

    if (vote !== 'for' && vote !== 'against') {
      return res.status(400).json({
        error: 'Vote must be "for" or "against"',
      });
    }

    await dbConnect();

    // Find the proposal
    const proposal = await PoolProposal.findById(proposalId);
    if (!proposal || proposal.deleted) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Check proposal status
    if (proposal.status !== 'active') {
      return res.status(400).json({
        error: `Cannot vote on proposal with status: ${proposal.status}`,
        status: proposal.status,
      });
    }

    // Check voting deadline
    if (proposal.votingDeadline && new Date() > proposal.votingDeadline) {
      // Update status to expired
      proposal.status = 'expired';
      await proposal.save();
      return res.status(400).json({
        error: 'Voting deadline has passed',
        votingDeadline: proposal.votingDeadline,
      });
    }

    // Check if already voted
    const existingVoteFor = proposal.votesFor.find(
      (v: { wallet: string }) => v.wallet === voterWallet
    );
    const existingVoteAgainst = proposal.votesAgainst.find(
      (v: { wallet: string }) => v.wallet === voterWallet
    );

    if (existingVoteFor || existingVoteAgainst) {
      return res.status(400).json({
        error: 'Already voted on this proposal',
        existingVote: existingVoteFor ? 'for' : 'against',
      });
    }

    // Find the pool
    const pool = await Pool.findById(proposal.pool);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Verify voter is a token holder
    if (!pool.bagsTokenMint) {
      return res.status(400).json({ error: 'Pool does not have a token' });
    }

    const holderCheck = await verifyTokenHolder(voterWallet, pool.bagsTokenMint, 1);
    if (!holderCheck.isHolder) {
      return res.status(403).json({
        error: 'Only token holders can vote',
        balance: holderCheck.balance,
      });
    }

    // Calculate vote power based on token balance
    // Find voter in squad members for ownership percent
    const squadMember = pool.squadMembers.find((m: { wallet: string }) => m.wallet === voterWallet);
    const votePower = squadMember?.ownershipPercent || 0;

    if (votePower === 0) {
      // Voter not in squad members - calculate based on token balance
      // This happens if the holder bought after graduation
      // For now, allow voting but with 0 power (they can still participate)
      console.warn(`[vote] Voter ${voterWallet} not in squad members, voting with 0 power`);
    }

    // Get or create user
    const user = await User.findOneAndUpdate(
      { wallet: voterWallet },
      { $setOnInsert: { wallet: voterWallet, role: 'buyer' } },
      { upsert: true, new: true }
    );

    // Create vote record
    const voteRecord = {
      wallet: voterWallet,
      user: user._id,
      tokenBalance: holderCheck.balance,
      votePower,
      votedAt: new Date(),
    };

    // Add vote to appropriate array
    if (vote === 'for') {
      proposal.votesFor.push(voteRecord);
    } else {
      proposal.votesAgainst.push(voteRecord);
    }

    // Save proposal (pre-save hook will update totals and check threshold)
    await proposal.save();

    // Reload to get updated values
    const updatedProposal = await PoolProposal.findById(proposalId);

    // Calculate current percentages
    const approvalPercent =
      updatedProposal.totalVotePower > 0
        ? Math.round((updatedProposal.forVotePower / updatedProposal.totalVotePower) * 100)
        : 0;
    const rejectionPercent =
      updatedProposal.totalVotePower > 0
        ? Math.round((updatedProposal.againstVotePower / updatedProposal.totalVotePower) * 100)
        : 0;

    return res.status(200).json({
      success: true,
      vote: {
        voterWallet,
        vote,
        votePower,
        tokenBalance: holderCheck.balance,
      },
      proposal: {
        _id: updatedProposal._id,
        status: updatedProposal.status,
        forVotePower: updatedProposal.forVotePower,
        againstVotePower: updatedProposal.againstVotePower,
        totalVotePower: updatedProposal.totalVotePower,
        forVoteCount: updatedProposal.forVoteCount,
        againstVoteCount: updatedProposal.againstVoteCount,
        approvalPercent,
        rejectionPercent,
        approvalThreshold: updatedProposal.approvalThreshold,
        hasReachedThreshold: approvalPercent >= updatedProposal.approvalThreshold,
      },
      message:
        updatedProposal.status === 'approved'
          ? 'Vote recorded! Proposal has reached approval threshold and can now be executed.'
          : updatedProposal.status === 'rejected'
            ? 'Vote recorded! Proposal has been rejected.'
            : `Vote recorded! Current approval: ${approvalPercent}% (need ${updatedProposal.approvalThreshold}%)`,
    });
  } catch (error: any) {
    console.error('[POST /api/pool/proposals/[proposalId]/vote] Error:', error);
    return res.status(500).json({
      error: 'Failed to record vote',
      details: error?.message,
    });
  }
}
