// src/pages/api/pool/distribute.ts
// Distribute proceeds to token holders when pool asset is resold.
// Supports two actions:
//   - 'propose' (default): Snapshot holders, calculate distribution, create Squads proposal
//   - 'finalize': After Squads execution, close pool and mark tokens as burned
import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import {
  buildMultiTransferProposal,
  TransferRecipient,
} from '../../../lib/services/squadsTransferService';
import { getAllTokenHolders } from '../../../lib/services/dasApi';
import { calculateDistribution } from '../../../lib/services/distributionCalc';
import { getTreasury } from '../../../lib/config/treasuryConfig';

interface DistributeRequest {
  poolId: string;
  adminWallet: string;
  resalePriceUSD?: number; // If not already set on pool
  createSquadsProposal?: boolean;
  action?: 'propose' | 'finalize'; // default: 'propose'
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      resalePriceUSD,
      createSquadsProposal = true,
      action = 'propose',
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

    // ========== FINALIZE ACTION ==========
    if (action === 'finalize') {
      if (!['proposed', 'executed', 'approved', 'completed'].includes(pool.distributionStatus)) {
        return res.status(400).json({
          error: `Cannot finalize: distribution status must be proposed, approved, executed, or completed. Current: ${pool.distributionStatus}`,
        });
      }

      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          status: 'closed',
          tokenStatus: 'burned',
          distributionStatus: 'completed',
          closedAt: new Date(),
        },
      });

      const closedPool = await Pool.findById(poolId);

      return res.status(200).json({
        success: true,
        action: 'finalize',
        pool: {
          _id: closedPool._id,
          status: closedPool.status,
          tokenStatus: closedPool.tokenStatus,
          distributionStatus: closedPool.distributionStatus,
          closedAt: closedPool.closedAt,
        },
        message: 'Pool closed. Tokens marked as burned. Distribution complete.',
        note: 'On-chain token burn deferred to v2. Tokens exist on-chain but have no redemption value.',
      });
    }

    // ========== PROPOSE ACTION (default) ==========

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

    // Fetch live on-chain token holders and calculate distribution
    let distributions: {
      wallet: string;
      balance: number;
      ownershipPercent: number;
      distributionAmount: number;
    }[];
    let royaltyAmount: number;
    let distributionPool: number;
    let dustFiltered = 0;
    let holderSource: string;

    if (pool.bagsTokenMint) {
      // Paginated on-chain snapshot — fetches ALL holders, not just first 200
      const holders = await getAllTokenHolders(pool.bagsTokenMint);

      if (holders.length === 0) {
        return res.status(400).json({
          error: 'No token holders found for this pool',
          bagsTokenMint: pool.bagsTokenMint,
        });
      }

      const result = calculateDistribution(holders, finalResalePrice);
      distributions = result.distributions;
      royaltyAmount = result.royaltyAmount;
      distributionPool = result.distributionPool;
      dustFiltered = result.dustFiltered;
      holderSource = 'on-chain snapshot (paginated)';
    } else {
      // Fallback to MongoDB participants if no token minted
      const mongoHolders = (pool.participants || []).map((p: any) => {
        const pct = pool.totalShares > 0 ? (p.shares / pool.totalShares) * 100 : 0;
        return {
          wallet: p.wallet,
          balance: p.shares,
          ownershipPercent: pct,
        };
      });

      const result = calculateDistribution(mongoHolders, finalResalePrice);
      distributions = result.distributions;
      royaltyAmount = result.royaltyAmount;
      distributionPool = result.distributionPool;
      dustFiltered = result.dustFiltered;
      holderSource = 'MongoDB participants';
    }

    // Transition pool to distributing
    await Pool.findByIdAndUpdate(poolId, {
      $set: { status: 'distributing' },
    });

    // Create Squads proposal for distribution
    let squadsResult = null;
    if (createSquadsProposal) {
      const treasuryWallet = getTreasury('pools');

      // Build recipient list: all holders + Pools Treasury fee
      const recipients: TransferRecipient[] = [
        ...distributions
          .filter((d) => d.distributionAmount > 0)
          .map((d) => ({
            wallet: d.wallet,
            amountUSD: d.distributionAmount,
            label: `Holder ${d.wallet.slice(0, 8)}... (${d.ownershipPercent.toFixed(1)}%)`,
          })),
        { wallet: treasuryWallet, amountUSD: royaltyAmount, label: 'Pools Treasury 3% royalty' },
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
            distributions: distributions.map((d) => ({
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
      action: 'propose',
      resale: {
        resalePriceUSD: finalResalePrice,
        royaltyAmount,
        royaltyPercent: '3%',
        distributionPool,
        distributionPercent: '97%',
      },
      distributions: distributions.map((d) => ({
        wallet: d.wallet,
        balance: d.balance,
        ownershipPercent: `${d.ownershipPercent.toFixed(2)}%`,
        receives: `$${d.distributionAmount.toFixed(2)}`,
      })),
      dustFiltered,
      holderSource,
      pool: {
        _id: pool._id,
        status: 'distributing',
        distributionStatus: 'proposed',
      },
      squadsProposal: squadsResult,
      message: squadsResult?.success
        ? 'Distribution proposal created in Squads. Awaiting multisig approval.'
        : 'Distribution calculated. Create Squads proposal to execute.',
      nextSteps: [
        'Multisig members approve distribution in Squads UI',
        'Execute distribution via /api/squads/execute',
        'Finalize pool: POST /api/pool/distribute with action: "finalize"',
        'Pool will be closed, tokens marked as burned',
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

export default withErrorMonitoring(handler);
