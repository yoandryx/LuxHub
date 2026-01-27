// src/pages/api/pool/proposals/index.ts
// List proposals for a pool (GET) or create a new proposal (POST)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import { Pool } from '../../../../lib/models/Pool';
import { PoolProposal } from '../../../../lib/models/PoolProposal';
import { User } from '../../../../lib/models/User';
import { verifyTokenHolder } from '../../../../lib/services/heliusService';
import { createGovernanceProposal } from '../../../../lib/services/squadService';

interface CreateProposalRequest {
  poolId: string;
  proposerWallet: string;
  proposalType: 'relist_for_sale' | 'accept_offer';
  title: string;
  description: string;
  // For relist_for_sale
  askingPriceUSD?: number;
  listingDurationDays?: number;
  // For accept_offer
  offerAmountUSD?: number;
  buyerWallet?: string;
  offerExpiresAt?: string;
  // Voting config
  votingDeadlineDays?: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  const { poolId } = req.query;

  if (req.method === 'GET') {
    return handleGetProposals(req, res, poolId as string);
  } else if (req.method === 'POST') {
    return handleCreateProposal(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * GET - List proposals for a pool
 */
async function handleGetProposals(req: NextApiRequest, res: NextApiResponse, poolId: string) {
  try {
    const { status, limit = '20', offset = '0' } = req.query;

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Build query
    const query: Record<string, unknown> = {
      pool: poolId,
      deleted: false,
    };

    if (status) {
      query.status = status;
    }

    const proposals = await PoolProposal.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset as string, 10))
      .limit(parseInt(limit as string, 10))
      .populate('proposedByUser', 'wallet username avatar');

    const total = await PoolProposal.countDocuments(query);

    return res.status(200).json({
      success: true,
      proposals: proposals.map((p) => ({
        _id: p._id,
        proposalType: p.proposalType,
        title: p.title,
        description: p.description,
        proposedBy: p.proposedBy,
        proposedAt: p.proposedAt,
        status: p.status,
        approvalThreshold: p.approvalThreshold,
        forVotePower: p.forVotePower,
        againstVotePower: p.againstVotePower,
        totalVotePower: p.totalVotePower,
        forVoteCount: p.forVoteCount,
        againstVoteCount: p.againstVoteCount,
        votingDeadline: p.votingDeadline,
        // Proposal-specific data
        askingPriceUSD: p.askingPriceUSD,
        offerAmountUSD: p.offerAmountUSD,
        buyerWallet: p.buyerWallet,
        // Computed
        approvalPercent:
          p.totalVotePower > 0 ? Math.round((p.forVotePower / p.totalVotePower) * 100) : 0,
        createdAt: p.createdAt,
      })),
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
        hasMore: parseInt(offset as string, 10) + proposals.length < total,
      },
    });
  } catch (error: any) {
    console.error('[GET /api/pool/proposals] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch proposals',
      details: error?.message,
    });
  }
}

/**
 * POST - Create a new proposal
 */
async function handleCreateProposal(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      poolId,
      proposerWallet,
      proposalType,
      title,
      description,
      askingPriceUSD,
      listingDurationDays = 30,
      offerAmountUSD,
      buyerWallet,
      offerExpiresAt,
      votingDeadlineDays = 7,
    } = req.body as CreateProposalRequest;

    // Validation
    if (!poolId || !proposerWallet || !proposalType || !title || !description) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, proposerWallet, proposalType, title, description',
      });
    }

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if pool has graduated and has a Squad
    if (!pool.graduated || !pool.squadMultisigPda) {
      return res.status(400).json({
        error: 'Pool must be graduated with an active Squad to create proposals',
        graduated: pool.graduated,
        hasSquad: !!pool.squadMultisigPda,
      });
    }

    // Verify proposer is a token holder
    if (!pool.bagsTokenMint) {
      return res.status(400).json({ error: 'Pool does not have a token' });
    }

    const holderCheck = await verifyTokenHolder(proposerWallet, pool.bagsTokenMint, 1);
    if (!holderCheck.isHolder) {
      return res.status(403).json({
        error: 'Only token holders can create proposals',
        balance: holderCheck.balance,
      });
    }

    // Validate proposal-specific data
    if (proposalType === 'relist_for_sale' && !askingPriceUSD) {
      return res.status(400).json({
        error: 'askingPriceUSD is required for relist_for_sale proposals',
      });
    }

    if (proposalType === 'accept_offer' && (!offerAmountUSD || !buyerWallet)) {
      return res.status(400).json({
        error: 'offerAmountUSD and buyerWallet are required for accept_offer proposals',
      });
    }

    // Get or create user
    const user = await User.findOneAndUpdate(
      { wallet: proposerWallet },
      { $setOnInsert: { wallet: proposerWallet, role: 'buyer' } },
      { upsert: true, new: true }
    );

    // Calculate total vote power from squad members
    const totalVotePower = pool.squadMembers.reduce(
      (sum: number, m: { ownershipPercent: number }) => sum + (m.ownershipPercent || 0),
      0
    );

    // Calculate voting deadline
    const votingDeadline = new Date();
    votingDeadline.setDate(votingDeadline.getDate() + votingDeadlineDays);

    // Create the proposal
    const proposal = await PoolProposal.create({
      pool: poolId,
      proposalType,
      title,
      description,
      proposedBy: proposerWallet,
      proposedByUser: user._id,
      approvalThreshold: pool.squadThreshold || 60,
      totalVotePower,
      votingDeadline,
      status: 'active',
      // Proposal-specific data
      ...(proposalType === 'relist_for_sale' && {
        askingPriceUSD,
        listingDurationDays,
      }),
      ...(proposalType === 'accept_offer' && {
        offerAmountUSD,
        buyerWallet,
        offerExpiresAt: offerExpiresAt ? new Date(offerExpiresAt) : undefined,
      }),
    });

    return res.status(201).json({
      success: true,
      proposal: {
        _id: proposal._id,
        proposalType: proposal.proposalType,
        title: proposal.title,
        description: proposal.description,
        status: proposal.status,
        approvalThreshold: proposal.approvalThreshold,
        totalVotePower: proposal.totalVotePower,
        votingDeadline: proposal.votingDeadline,
        askingPriceUSD: proposal.askingPriceUSD,
        offerAmountUSD: proposal.offerAmountUSD,
      },
      pool: {
        _id: pool._id,
        squadMultisigPda: pool.squadMultisigPda,
      },
      message: 'Proposal created successfully. Token holders can now vote.',
      nextSteps: [
        'Share proposal with token holders for voting',
        `Voting ends: ${votingDeadline.toISOString()}`,
        `Approval threshold: ${pool.squadThreshold || 60}%`,
        'Once approved, proposal can be executed',
      ],
    });
  } catch (error: any) {
    console.error('[POST /api/pool/proposals] Error:', error);
    return res.status(500).json({
      error: 'Failed to create proposal',
      details: error?.message,
    });
  }
}
