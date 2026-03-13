// src/pages/api/pool/distribute.ts
// Distribute proceeds to investors when pool asset is resold
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import {
  buildMultiTransferProposal,
  getTopTokenHolders,
  TransferRecipient,
} from '../../../lib/services/squadsTransferService';

interface DistributeRequest {
  poolId: string;
  adminWallet: string;
  resalePriceUSD?: number; // If not already set on pool
  createSquadsProposal?: boolean;
}

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

    // Verify admin privileges
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check pool status
    if (pool.status !== 'sold') {
      return res.status(400).json({
        error: `Pool must be in 'sold' status to distribute. Current status: ${pool.status}`,
      });
    }

    // Idempotency guard — prevent duplicate distribution proposals
    if (pool.distributionStatus && pool.distributionStatus !== 'pending') {
      return res.status(400).json({
        error: `Distribution already initiated. Current status: ${pool.distributionStatus}`,
        squadsDistributionIndex: pool.squadsDistributionIndex,
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

    // Fetch live on-chain token holders instead of stale MongoDB participants
    interface DistributionItem {
      wallet: string;
      balance: number;
      ownershipPercent: number;
      distributionAmount: number;
    }

    let distributions: DistributionItem[];

    if (pool.bagsTokenMint) {
      // On-chain snapshot — accurate even after secondary trading
      const holders = await getTopTokenHolders(pool.bagsTokenMint, 200);

      if (holders.length === 0) {
        return res.status(400).json({
          error: 'No token holders found for this pool',
          bagsTokenMint: pool.bagsTokenMint,
        });
      }

      distributions = holders.map((h) => ({
        wallet: h.wallet,
        balance: h.balance,
        ownershipPercent: h.ownershipPercent,
        distributionAmount: distributionPool * (h.ownershipPercent / 100),
      }));
    } else {
      // Fallback to MongoDB participants if no token minted
      distributions = (pool.participants || []).map((p: any) => {
        const pct = pool.totalShares > 0 ? (p.shares / pool.totalShares) * 100 : 0;
        return {
          wallet: p.wallet,
          balance: p.shares,
          ownershipPercent: pct,
          distributionAmount: distributionPool * (pct / 100),
        };
      });
    }

    // Create Squads proposal for distribution
    let squadsResult = null;
    if (createSquadsProposal) {
      const treasuryWallet = process.env.NEXT_PUBLIC_LUXHUB_WALLET;
      if (!treasuryWallet) {
        return res.status(500).json({ error: 'Missing NEXT_PUBLIC_LUXHUB_WALLET (treasury)' });
      }

      // Build recipient list: all holders + LuxHub fee
      const recipients: TransferRecipient[] = [
        ...distributions
          .filter((d) => d.distributionAmount > 0)
          .map((d) => ({
            wallet: d.wallet,
            amountUSD: d.distributionAmount,
            label: `Investor ${d.wallet.slice(0, 8)}... (${d.ownershipPercent.toFixed(1)}%)`,
          })),
        { wallet: treasuryWallet, amountUSD: royaltyAmount, label: 'LuxHub 3% royalty' },
      ];

      squadsResult = await buildMultiTransferProposal(recipients, {
        autoApprove: true,
        memo: `Distribution for pool ${pool._id}`,
      });

      if (squadsResult.success) {
        await Pool.findByIdAndUpdate(poolId, {
          $set: {
            distributionStatus: 'proposed',
            distributionAmount: distributionPool,
            distributionRoyalty: royaltyAmount,
            squadsDistributionIndex: squadsResult.transactionIndex,
            distributions: distributions.map((d: DistributionItem) => ({
              wallet: d.wallet,
              balance: d.balance,
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
        balance: d.balance,
        ownershipPercent: `${d.ownershipPercent.toFixed(2)}%`,
        receives: `$${d.distributionAmount.toFixed(2)}`,
      })),
      holderSource: pool.bagsTokenMint ? 'on-chain snapshot' : 'MongoDB participants',
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
