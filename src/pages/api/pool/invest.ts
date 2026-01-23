// src/pages/api/pool/invest.ts
// User buys shares in a crowdfunded pool
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface InvestRequest {
  poolId: string;
  investorWallet: string;
  shares: number;
  investedUSD: number;
  txSignature?: string; // On-chain transaction signature (if payment already made)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, investorWallet, shares, investedUSD, txSignature } = req.body as InvestRequest;

    // Validation
    if (!poolId || !investorWallet || !shares || !investedUSD) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, investorWallet, shares, investedUSD',
      });
    }

    if (shares <= 0 || investedUSD <= 0) {
      return res.status(400).json({
        error: 'shares and investedUSD must be positive',
      });
    }

    await dbConnect();

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check pool status
    if (pool.status !== 'open') {
      return res.status(400).json({
        error: `Pool is not open for investment. Current status: ${pool.status}`,
      });
    }

    // Check shares availability
    const availableShares = pool.totalShares - pool.sharesSold;
    if (shares > availableShares) {
      return res.status(400).json({
        error: `Not enough shares available. Requested: ${shares}, Available: ${availableShares}`,
        availableShares,
      });
    }

    // Check minimum buy-in
    if (investedUSD < pool.minBuyInUSD) {
      return res.status(400).json({
        error: `Investment below minimum. Minimum: $${pool.minBuyInUSD}, Provided: $${investedUSD}`,
        minBuyInUSD: pool.minBuyInUSD,
      });
    }

    // Verify investment amount matches shares
    const expectedAmount = shares * pool.sharePriceUSD;
    const tolerance = 0.01; // 1 cent tolerance for rounding
    if (Math.abs(investedUSD - expectedAmount) > tolerance) {
      return res.status(400).json({
        error: `Investment amount mismatch. Expected: $${expectedAmount.toFixed(2)} for ${shares} shares at $${pool.sharePriceUSD}/share`,
        expected: expectedAmount,
        provided: investedUSD,
        sharePriceUSD: pool.sharePriceUSD,
      });
    }

    // Check max investors
    const uniqueInvestors = new Set(pool.participants.map((p: any) => p.wallet));
    if (!uniqueInvestors.has(investorWallet) && uniqueInvestors.size >= pool.maxInvestors) {
      return res.status(400).json({
        error: `Pool has reached maximum investors (${pool.maxInvestors})`,
        maxInvestors: pool.maxInvestors,
      });
    }

    // Get or create investor user (using upsert for efficiency - single DB round-trip)
    const investorUser = await User.findOneAndUpdate(
      { wallet: investorWallet },
      { $setOnInsert: { wallet: investorWallet, role: 'buyer' } },
      { upsert: true, new: true }
    );

    // Check if investor already has shares
    const existingParticipant = pool.participants.find((p: any) => p.wallet === investorWallet);

    if (existingParticipant) {
      // Add to existing position
      existingParticipant.shares += shares;
      existingParticipant.investedUSD += investedUSD;
      existingParticipant.ownershipPercent = (existingParticipant.shares / pool.totalShares) * 100;
      existingParticipant.projectedReturnUSD = existingParticipant.investedUSD * pool.projectedROI;
      if (txSignature) {
        existingParticipant.txSignature = txSignature;
      }
    } else {
      // Add new participant
      pool.participants.push({
        user: investorUser._id,
        wallet: investorWallet,
        shares,
        ownershipPercent: (shares / pool.totalShares) * 100,
        investedUSD,
        projectedReturnUSD: investedUSD * pool.projectedROI,
        investedAt: new Date(),
        txSignature,
      });
    }

    // Update shares sold
    pool.sharesSold += shares;

    // Check if pool is now filled
    if (pool.sharesSold >= pool.totalShares) {
      pool.status = 'filled';
    }

    await pool.save();

    // Get updated participant info
    const updatedParticipant = pool.participants.find((p: any) => p.wallet === investorWallet);

    return res.status(200).json({
      success: true,
      investment: {
        shares,
        investedUSD,
        txSignature,
      },
      participant: {
        totalShares: updatedParticipant?.shares,
        ownershipPercent: updatedParticipant?.ownershipPercent,
        totalInvestedUSD: updatedParticipant?.investedUSD,
        projectedReturnUSD: updatedParticipant?.projectedReturnUSD,
      },
      pool: {
        _id: pool._id,
        status: pool.status,
        totalShares: pool.totalShares,
        sharesSold: pool.sharesSold,
        sharesRemaining: pool.totalShares - pool.sharesSold,
        percentFilled: ((pool.sharesSold / pool.totalShares) * 100).toFixed(2),
        targetAmountUSD: pool.targetAmountUSD,
        currentAmountUSD: pool.sharesSold * pool.sharePriceUSD,
      },
      message:
        pool.status === 'filled'
          ? 'Investment successful! Pool is now filled. Vendor payment will be processed.'
          : 'Investment successful!',
    });
  } catch (error: any) {
    console.error('[/api/pool/invest] Error:', error);
    return res.status(500).json({
      error: 'Failed to process investment',
      details: error?.message || 'Unknown error',
    });
  }
}
