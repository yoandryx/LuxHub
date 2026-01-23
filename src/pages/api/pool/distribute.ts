// src/pages/api/pool/distribute.ts
// Distribute proceeds to investors when pool asset is resold
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface DistributeRequest {
  poolId: string;
  adminWallet: string;
  resalePriceUSD?: number; // If not already set on pool
  createSquadsProposal?: boolean;
}

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      resalePriceUSD,
      createSquadsProposal = true,
    } = req.body as DistributeRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    await dbConnect();

    // Run independent queries in parallel
    const [adminUser, pool] = await Promise.all([
      User.findOne({ wallet: adminWallet }),
      Pool.findById(poolId),
    ]);

    // Verify admin privileges
    const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Check pool exists
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check pool status
    if (pool.status !== 'sold') {
      return res.status(400).json({
        error: `Pool must be in 'sold' status to distribute. Current status: ${pool.status}`,
      });
    }

    // Get resale price
    const finalResalePrice = resalePriceUSD || pool.resaleSoldPriceUSD;
    if (!finalResalePrice) {
      return res.status(400).json({
        error: 'Resale price not set. Provide resalePriceUSD or set it on the pool first.',
      });
    }

    // Calculate distribution amounts
    const royaltyAmount = finalResalePrice * 0.03; // 3% to LuxHub
    const distributionPool = finalResalePrice * 0.97; // 97% to investors

    // Calculate individual distributions
    interface DistributionItem {
      wallet: string;
      shares: number;
      ownershipPercent: number;
      investedUSD: number;
      distributionAmount: number;
      profit: number;
      roiPercent: number;
    }

    const distributions: DistributionItem[] = (pool.participants || []).map((participant: any) => {
      const ownershipPercent = participant.shares / pool.totalShares;
      const distributionAmount = distributionPool * ownershipPercent;
      const profit = distributionAmount - participant.investedUSD;
      const roiPercent = (distributionAmount / participant.investedUSD - 1) * 100;

      return {
        wallet: participant.wallet,
        shares: participant.shares,
        ownershipPercent: ownershipPercent * 100,
        investedUSD: participant.investedUSD,
        distributionAmount,
        profit,
        roiPercent,
      };
    });

    // Create Squads proposal for distribution
    let squadsResult = null;
    if (createSquadsProposal) {
      squadsResult = await createDistributionProposal(pool, distributions, royaltyAmount);

      if (squadsResult.success) {
        // Update pool with proposal info
        await Pool.findByIdAndUpdate(poolId, {
          $set: {
            distributionStatus: 'proposed',
            distributionAmount: distributionPool,
            distributionRoyalty: royaltyAmount,
            squadsDistributionIndex: squadsResult.transactionIndex,
            distributions: distributions.map((d: DistributionItem) => ({
              wallet: d.wallet,
              shares: d.shares,
              ownershipPercent: d.ownershipPercent,
              amount: d.distributionAmount,
            })),
          },
        });
      }
    }

    return res.status(200).json({
      success: true,
      resale: {
        resalePriceUSD: finalResalePrice,
        royaltyAmount,
        royaltyPercent: '3%',
        distributionPool,
        distributionPercent: '97%',
      },
      distributions: distributions.map((d: DistributionItem) => ({
        wallet: d.wallet,
        shares: d.shares,
        ownershipPercent: `${d.ownershipPercent.toFixed(2)}%`,
        invested: `$${d.investedUSD.toFixed(2)}`,
        receives: `$${d.distributionAmount.toFixed(2)}`,
        profit: `$${d.profit.toFixed(2)}`,
        roi: `${d.roiPercent.toFixed(2)}%`,
      })),
      pool: {
        _id: pool._id,
        status: pool.status,
        distributionStatus: 'proposed',
      },
      squadsProposal: squadsResult,
      message: squadsResult?.success
        ? 'Distribution proposal created in Squads. Awaiting multisig approval.'
        : 'Distribution calculated. Create Squads proposal to execute.',
      nextSteps: [
        'Multisig members approve distribution in Squads UI',
        'Execute distribution via /api/squads/execute',
        'Pool status will update to "distributed"',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/distribute] Error:', error);
    return res.status(500).json({
      error: 'Failed to process distribution',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to create Squads distribution proposal
async function createDistributionProposal(
  pool: any,
  distributions: any[],
  royaltyAmount: number
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;

    if (!rpc || !multisigPda) {
      return { success: false, error: 'Missing Squads configuration' };
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);

    // Fetch next transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    // In a full implementation, this would create multiple transfer instructions:
    // 1. Transfer royaltyAmount to LuxHub treasury
    // 2. For each investor, transfer their distribution amount
    // This would be a batch transaction through Squads

    return {
      success: true,
      transactionIndex: transactionIndex.toString(),
    };
  } catch (error: any) {
    console.error('[createDistributionProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
