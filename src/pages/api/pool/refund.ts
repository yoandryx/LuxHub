// src/pages/api/pool/refund.ts
// Refund investors when a pool fails (vendor doesn't ship, asset not verified, etc.)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import {
  buildMultiTransferProposal,
  TransferRecipient,
} from '../../../lib/services/squadsTransferService';
import { getSquadsAutoApprove } from '../../../lib/config/squadsConfig';

interface RefundRequest {
  poolId: string;
  adminWallet: string;
  reason: string;
  createSquadsProposal?: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, reason, createSquadsProposal = true } = req.body as RefundRequest;

    if (!poolId || !adminWallet || !reason) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet, reason',
      });
    }

    await dbConnect();

    // Verify admin
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Can only refund pools that haven't distributed yet
    const refundableStatuses = ['open', 'filled', 'funded', 'custody', 'active', 'failed'];
    if (!refundableStatuses.includes(pool.status)) {
      return res.status(400).json({
        error: `Cannot refund pool in '${pool.status}' status`,
        refundableStatuses,
      });
    }

    // Can't refund if vendor already paid and asset is sold
    if (pool.vendorPaidAt && pool.resaleSoldAt) {
      return res.status(400).json({
        error:
          'Cannot refund — vendor paid and asset already sold. Use /api/pool/distribute instead.',
      });
    }

    // Calculate refund amounts per participant
    const participants = pool.participants || [];
    if (participants.length === 0) {
      // No investors — just mark as failed
      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          status: 'failed',
          burnReason: reason,
        },
      });
      return res.status(200).json({
        success: true,
        message: 'Pool marked as failed (no investors to refund).',
        pool: { _id: pool._id, status: 'failed' },
      });
    }

    const refunds = participants.map((p: any) => ({
      wallet: p.wallet,
      refundAmount: p.investedUSD || 0,
      shares: p.shares || 0,
    }));

    const totalRefund = refunds.reduce((sum: number, r: any) => sum + r.refundAmount, 0);

    // Create Squads proposal for refunds
    let squadsResult = null;
    if (createSquadsProposal && totalRefund > 0) {
      const recipients: TransferRecipient[] = refunds
        .filter((r: any) => r.refundAmount > 0)
        .map((r: any) => ({
          wallet: r.wallet,
          amountUSD: r.refundAmount,
          label: `Refund ${r.wallet.slice(0, 8)}... ($${r.refundAmount.toFixed(2)})`,
        }));

      squadsResult = await buildMultiTransferProposal(recipients, {
        autoApprove: getSquadsAutoApprove(),
        memo: `Refund for failed pool ${pool._id}: ${reason}`,
      });

      if (squadsResult.success) {
        await Pool.findByIdAndUpdate(poolId, {
          $set: {
            status: 'failed',
            burnReason: reason,
            distributionStatus: 'proposed',
            distributionAmount: totalRefund,
            squadsDistributionIndex: squadsResult.transactionIndex,
            distributions: refunds.map((r: any) => ({
              wallet: r.wallet,
              shares: r.shares,
              amount: r.refundAmount,
            })),
          },
        });
      }
    }

    // If no proposal requested, just mark as failed
    if (!createSquadsProposal) {
      await Pool.findByIdAndUpdate(poolId, {
        $set: { status: 'failed', burnReason: reason },
      });
    }

    return res.status(200).json({
      success: true,
      reason,
      refunds: refunds.map((r: any) => ({
        wallet: r.wallet,
        refundAmount: `$${r.refundAmount.toFixed(2)}`,
        shares: r.shares,
      })),
      totalRefund: `$${totalRefund.toFixed(2)}`,
      investorCount: refunds.filter((r: any) => r.refundAmount > 0).length,
      pool: {
        _id: pool._id,
        status: 'failed',
        previousStatus: pool.status,
      },
      squadsProposal: squadsResult,
      message: squadsResult?.success
        ? 'Refund proposal created in Squads. Awaiting multisig approval.'
        : 'Pool marked as failed. Create Squads proposal to execute refunds.',
      nextSteps: [
        '1. Multisig members approve refund in Squads UI',
        '2. Execute refund via /api/squads/execute',
        '3. Investors receive their original investment back',
        '4. Pool tokens will be burned (if minted)',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/refund] Error:', error);
    return res.status(500).json({
      error: 'Failed to process refund',
      details: error?.message || 'Unknown error',
    });
  }
}
