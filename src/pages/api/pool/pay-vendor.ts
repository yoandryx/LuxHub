// src/pages/api/pool/pay-vendor.ts
// Pay vendor from Pools Treasury after:
//   1. Pool token has graduated (bonding curve → DEX)
//   2. Accumulated trading fees cover watch price (accumulatedTradingFees >= target * 0.97)
//   3. Watch custody is verified by LuxHub admin
//
// Flow: Pools Treasury → 97% vendor (USDC via Squads) + 3% stays in treasury
// The 1% creator fee from ALL pool token trades accumulates in Pools Treasury.
// MongoDB tracks per-pool fee accumulation; one treasury wallet serves all pools.
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import {
  buildMultiTransferProposal,
  TransferRecipient,
} from '../../../lib/services/squadsTransferService';
import { getTreasury } from '../../../lib/config/treasuryConfig';
import { getSquadsAutoApprove } from '../../../lib/config/squadsConfig';

interface PayVendorRequest {
  poolId: string;
  adminWallet: string;
  createSquadsProposal?: boolean;
  skipCustodyCheck?: boolean; // Only for emergencies, requires special admin
  skipFundingCheck?: boolean; // Pay vendor before fees accumulate (treasury-funded)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      createSquadsProposal = true,
      skipCustodyCheck = false,
      skipFundingCheck = false,
    } = req.body as PayVendorRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    await dbConnect();

    // Verify admin privileges
    const adminConfig = getAdminConfig();
    const isAdmin = adminConfig.isAdmin(adminWallet);
    const isSuperAdmin = adminConfig.isSuperAdmin(adminWallet);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Skip custody check requires super admin
    if (skipCustodyCheck && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Super admin access required to skip custody verification',
      });
    }

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // ========== FUNDING CHECK ==========
    // Vendor payment requires accumulated trading fees to cover watch price.
    // Pools Treasury collects 1% of all pool token trades via Bags fee-share.
    // MongoDB tracks per-pool accumulation (accumulatedTradingFees).

    const vendorPayoutTarget = (pool.targetAmountUSD || 0) * 0.97;
    const accumulatedFees = pool.accumulatedTradingFees || 0;
    const fundingProgress = vendorPayoutTarget > 0
      ? Math.min((accumulatedFees / vendorPayoutTarget) * 100, 100)
      : 0;

    if (!skipFundingCheck) {
      if (accumulatedFees < vendorPayoutTarget) {
        return res.status(400).json({
          error: 'Pool has not accumulated enough trading fees to pay vendor',
          fundingProgress: `${fundingProgress.toFixed(1)}%`,
          accumulatedFees,
          vendorPayoutTarget,
          shortfall: vendorPayoutTarget - accumulatedFees,
          message: `Need $${(vendorPayoutTarget - accumulatedFees).toFixed(2)} more in trading fees. Current: $${accumulatedFees.toFixed(2)} / $${vendorPayoutTarget.toFixed(2)}`,
        });
      }
    }

    // Skip funding check requires super admin (treasury-funded early payout)
    if (skipFundingCheck && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Super admin access required to skip funding check (treasury-funded payout)',
      });
    }

    // Pool must have an active token (bonding curve launched)
    const allowedStatuses = ['open', 'filled', 'custody', 'active'];
    if (!allowedStatuses.includes(pool.status) && !pool.graduated) {
      return res.status(400).json({
        error: `Pool must have an active bonding curve or be graduated. Current status: ${pool.status}`,
        currentStatus: pool.status,
        graduated: pool.graduated,
      });
    }

    // ========== CUSTODY VERIFICATION CHECK ==========
    // This is the critical escrow protection - funds only released when asset is verified
    if (!skipCustodyCheck) {
      // Check custody status - must be 'verified' or 'stored'
      const allowedCustodyStatuses = ['verified', 'stored'];
      if (!allowedCustodyStatuses.includes(pool.custodyStatus)) {
        return res.status(400).json({
          error: 'Cannot pay vendor until asset custody is VERIFIED by LuxHub',
          currentCustodyStatus: pool.custodyStatus,
          requiredCustodyStatus: allowedCustodyStatuses,
          escrowProtection: true,
          message:
            'Funds are held in escrow until LuxHub verifies receipt of the physical asset. This protects participants from vendor fraud.',
          nextSteps: [
            '1. Vendor must ship asset to LuxHub',
            '2. LuxHub receives and photographs asset',
            '3. Admin updates custody status to "verified"',
            '4. Then vendor payment can be processed',
          ],
        });
      }

      // Ensure custody proof exists
      if (!pool.custodyProofUrls || pool.custodyProofUrls.length === 0) {
        return res.status(400).json({
          error: 'Custody proof (photos) required before vendor payment',
          message: 'Upload custody verification photos before releasing funds',
        });
      }

      // Ensure verified by an admin
      if (!pool.custodyVerifiedBy) {
        return res.status(400).json({
          error: 'Custody must be verified by an admin before vendor payment',
        });
      }
    }

    // Check if vendor already paid
    if (pool.vendorPaidAt) {
      return res.status(400).json({
        error: 'Vendor has already been paid',
        vendorPaidAt: pool.vendorPaidAt,
        vendorPaidAmount: pool.vendorPaidAmount,
      });
    }

    // ========== CALCULATE PAYMENT AMOUNTS ==========
    // Vendor gets 97% of watch price (targetAmountUSD).
    // 3% stays in Pools Treasury as platform fee.
    // Payment source: Pools Treasury wallet (funded by 1% trading fees across all pools).
    // AMM liquidity is handled by Bags automatically at graduation — not part of vendor payout.

    const watchPrice = pool.targetAmountUSD || 0;
    const vendorPayment = watchPrice * 0.97;
    const luxhubFee = watchPrice * 0.03; // Stays in treasury (not transferred)

    // Create Squads proposal for payment from Pools Treasury → vendor
    let squadsResult = null;
    if (createSquadsProposal) {
      squadsResult = await createVendorPaymentProposal(pool, vendorPayment);

      if (!squadsResult.success) {
        return res.status(500).json({
          error: 'Failed to create Squads payment proposal',
          details: squadsResult.error,
        });
      }

      // Update pool with proposal info
      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          squadsVendorPaymentIndex: squadsResult.transactionIndex,
          vendorPaidAmount: vendorPayment,
          vendorPaidAt: new Date(),
          status: 'funded',
          escrowReleasedAt: new Date(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      escrowProtection: {
        custodyVerified: !skipCustodyCheck,
        custodyStatus: pool.custodyStatus,
        custodyVerifiedBy: pool.custodyVerifiedBy,
        custodyProofCount: pool.custodyProofUrls?.length || 0,
      },
      funding: {
        watchPrice,
        accumulatedFees,
        vendorPayoutTarget,
        fundingProgress: `${fundingProgress.toFixed(1)}%`,
        fundingCheckSkipped: skipFundingCheck,
      },
      payment: {
        vendorPayment,
        vendorPaymentPercent: '97%',
        luxhubFee,
        luxhubFeePercent: '3%',
        source: 'Pools Treasury',
      },
      pool: {
        _id: pool._id,
        vendorWallet: pool.vendorWallet,
        status: 'funded',
        bagsTokenMint: pool.bagsTokenMint,
        graduated: pool.graduated,
      },
      squadsProposal: squadsResult,
      message: squadsResult?.success
        ? 'Vendor payment proposal created from Pools Treasury. Approve in Squads UI to execute.'
        : 'Payment amounts calculated. Create Squads proposal to execute payment.',
      nextSteps: [
        '1. Multisig members approve payment in Squads UI',
        '2. Execute payment via /api/squads/execute',
        '3. Vendor receives SOL/USDC from Pools Treasury',
        '4. Vendor ships watch to LuxHub custody',
        '5. Admin verifies custody, pool status → "custody"',
        '6. When watch resells → 97% distributed to token holders, 3% to Marketplace Treasury',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/pay-vendor] Error:', error);
    return res.status(500).json({
      error: 'Failed to process vendor payment',
      details: error?.message || 'Unknown error',
    });
  }
}

// Build Squads proposal: transfer vendor payout from Pools Treasury → vendor wallet.
// The 3% LuxHub fee is implicit — it stays in the treasury (never transferred out).
async function createVendorPaymentProposal(
  pool: any,
  vendorPayment: number
): Promise<{
  success: boolean;
  transactionIndex?: string;
  squadsDeepLink?: string;
  error?: string;
}> {
  if (!pool.vendorWallet) {
    return { success: false, error: 'Pool has no vendorWallet set' };
  }

  const recipients: TransferRecipient[] = [
    { wallet: pool.vendorWallet, amountUSD: vendorPayment, label: `Vendor payout (97% of $${pool.targetAmountUSD})` },
  ];

  const result = await buildMultiTransferProposal(recipients, {
    autoApprove: getSquadsAutoApprove(),
    memo: `Vendor payment for pool ${pool._id} — $${vendorPayment.toFixed(2)}`,
  });

  return {
    success: result.success,
    transactionIndex: result.transactionIndex,
    squadsDeepLink: result.squadsDeepLink,
    error: result.error,
  };
}
