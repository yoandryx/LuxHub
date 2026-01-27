// src/pages/api/test/setup-governance.ts
// Test endpoint to setup governance data for testing
// WARNING: Only for development/testing - do not enable in production!
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { PoolProposal } from '../../../lib/models/PoolProposal';
import { Keypair } from '@solana/web3.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'test-admin-secret';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminSecret, action = 'setup-squad' } = req.body;

    // Basic auth check
    if (adminSecret !== ADMIN_SECRET) {
      return res.status(403).json({ error: 'Invalid admin secret' });
    }

    await dbConnect();

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    if (action === 'setup-squad') {
      // Generate mock Squad addresses
      const mockMultisigPda = Keypair.generate().publicKey.toBase58();
      const mockVaultPda = Keypair.generate().publicKey.toBase58();

      // Create mock members from participants or generate
      const mockMembers =
        pool.participants?.map((p: { wallet: string; ownershipPercent: number }) => ({
          wallet: p.wallet,
          tokenBalance: 10000,
          ownershipPercent: p.ownershipPercent || 20,
          joinedAt: new Date(),
          permissions: 1,
        })) || [];

      // If no participants, create mock ones
      if (mockMembers.length === 0) {
        for (let i = 0; i < 5; i++) {
          mockMembers.push({
            wallet: Keypair.generate().publicKey.toBase58(),
            tokenBalance: 10000 * (5 - i),
            ownershipPercent: 20,
            joinedAt: new Date(),
            permissions: 1,
          });
        }
      }

      // Update pool with Squad data
      pool.squadMultisigPda = mockMultisigPda;
      pool.squadVaultPda = mockVaultPda;
      pool.squadThreshold = 60;
      pool.squadMembers = mockMembers;
      pool.squadCreatedAt = new Date();
      pool.graduated = true;
      pool.status = 'graduated';

      await pool.save();

      return res.status(200).json({
        success: true,
        message: 'Squad data configured for testing',
        pool: {
          _id: pool._id,
          status: pool.status,
          graduated: pool.graduated,
          squadMultisigPda: pool.squadMultisigPda,
          squadVaultPda: pool.squadVaultPda,
          squadThreshold: pool.squadThreshold,
          memberCount: pool.squadMembers?.length || 0,
        },
      });
    }

    if (action === 'create-proposal') {
      // Create a test proposal
      const { proposerWallet, proposalType = 'relist_for_sale', askingPriceUSD = 60000 } = req.body;

      if (!pool.squadMultisigPda) {
        return res
          .status(400)
          .json({ error: 'Pool does not have a Squad. Run setup-squad first.' });
      }

      // Calculate total vote power from members
      const totalVotePower =
        pool.squadMembers?.reduce(
          (sum: number, m: { ownershipPercent: number }) => sum + (m.ownershipPercent || 0),
          0
        ) || 100;

      const proposal = new PoolProposal({
        pool: pool._id,
        proposalType,
        title: `Test Proposal: List for $${askingPriceUSD.toLocaleString()}`,
        description: `Test proposal created via test setup endpoint.`,
        proposedBy: proposerWallet || pool.squadMembers?.[0]?.wallet || 'test-wallet',
        proposedAt: new Date(),
        askingPriceUSD,
        listingDurationDays: 30,
        approvalThreshold: 60,
        votingDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        totalVotePower,
        forVotePower: 0,
        againstVotePower: 0,
        forVoteCount: 0,
        againstVoteCount: 0,
        status: 'active',
      });

      await proposal.save();

      return res.status(200).json({
        success: true,
        message: 'Test proposal created',
        proposal: {
          _id: proposal._id,
          title: proposal.title,
          status: proposal.status,
          totalVotePower: proposal.totalVotePower,
          approvalThreshold: proposal.approvalThreshold,
          votingDeadline: proposal.votingDeadline,
        },
      });
    }

    if (action === 'setup-token') {
      // Add mock token to pool for testing
      const mockTokenMint = Keypair.generate().publicKey.toBase58();

      pool.bagsTokenMint = mockTokenMint;
      pool.tokenStatus = 'graduated';
      pool.liquidityModel = 'amm';
      pool.ammEnabled = true;
      pool.bondingCurveActive = false; // Token already graduated

      await pool.save();

      return res.status(200).json({
        success: true,
        message: 'Mock token configured',
        pool: {
          _id: pool._id,
          bagsTokenMint: pool.bagsTokenMint,
          tokenStatus: pool.tokenStatus,
        },
      });
    }

    if (action === 'add-vote') {
      // Add a vote to a proposal for testing
      const { proposalId, voterWallet, vote = 'for', votePower = 20 } = req.body;

      if (!proposalId || !voterWallet) {
        return res.status(400).json({ error: 'Missing proposalId or voterWallet' });
      }

      const proposal = await PoolProposal.findById(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
      }

      const voteRecord = {
        wallet: voterWallet,
        tokenBalance: 10000,
        votePower: votePower,
        votedAt: new Date(),
      };

      if (vote === 'for') {
        proposal.votesFor.push(voteRecord);
        proposal.forVotePower = (proposal.forVotePower || 0) + votePower;
        proposal.forVoteCount = (proposal.forVoteCount || 0) + 1;
      } else {
        proposal.votesAgainst.push(voteRecord);
        proposal.againstVotePower = (proposal.againstVotePower || 0) + votePower;
        proposal.againstVoteCount = (proposal.againstVoteCount || 0) + 1;
      }

      await proposal.save();

      return res.status(200).json({
        success: true,
        message: 'Vote added',
        proposal: {
          _id: proposal._id,
          forVotePower: proposal.forVotePower,
          againstVotePower: proposal.againstVotePower,
          forVoteCount: proposal.forVoteCount,
          againstVoteCount: proposal.againstVoteCount,
          status: proposal.status,
        },
      });
    }

    return res
      .status(400)
      .json({ error: 'Invalid action. Use: setup-squad, setup-token, create-proposal, add-vote' });
  } catch (error: any) {
    console.error('[test/setup-governance] Error:', error);
    return res.status(500).json({ error: error.message || 'Setup failed' });
  }
}
