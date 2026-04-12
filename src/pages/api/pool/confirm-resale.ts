// src/pages/api/pool/confirm-resale.ts
// Phase 11-11: Confirm resale hook + distribution snapshot.
//
// Fires when marketplace confirm_delivery completes on a pool-backed escrow.
// Takes a Helius DAS snapshot of ALL token holders via getAllTokenHolders,
// computes each holder's proportional USD payout (97% of resale price),
// creates a PoolDistribution record with distributionKind: 'resale',
// and transitions pool state resale_listed -> resold.
//
// Route: POST /api/pool/confirm-resale?poolId=xxx
// Body: { confirmDeliveryTxSignature: string, resalePriceUsdc: number }
// Auth: Admin wallet via x-wallet-address header OR internal via CRON_SECRET

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring, errorMonitor } from '@/lib/monitoring/errorHandler';
import { getAdminConfig } from '@/lib/config/adminConfig';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { PoolDistribution } from '@/lib/models/PoolDistribution';
import { getAllTokenHolders } from '@/lib/services/dasApi';
import { transitionPoolState } from '@/lib/services/poolStateTransition';

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: internal CRON_SECRET or admin wallet
  const isCron =
    req.headers.authorization === `Bearer ${process.env.CRON_SECRET}` &&
    !!process.env.CRON_SECRET;

  if (!isCron) {
    const wallet =
      (req.headers['x-wallet-address'] as string) ||
      req.body?.wallet ||
      (req.query.wallet as string);

    if (!wallet) {
      return res.status(401).json({ error: 'Missing wallet for admin authentication' });
    }

    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(wallet)) {
      return res.status(401).json({ error: 'Unauthorized: admin wallet required' });
    }
  }

  // Pool ID from query or body
  const poolId = (req.query.poolId as string) || req.body?.poolId;
  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  const { confirmDeliveryTxSignature, resalePriceUsdc } = req.body || {};
  if (!confirmDeliveryTxSignature || typeof confirmDeliveryTxSignature !== 'string') {
    return res.status(400).json({ error: 'missing_confirm_delivery_tx_signature' });
  }
  if (typeof resalePriceUsdc !== 'number' || resalePriceUsdc <= 0) {
    return res.status(400).json({ error: 'invalid_resale_price' });
  }

  await dbConnect();

  const pool = await Pool.findById(poolId);
  if (!pool) {
    return res.status(404).json({ error: 'pool_not_found' });
  }

  if ((pool as any).tokenStatus !== 'resale_listed') {
    return res.status(400).json({
      error: 'wrong_state',
      current: (pool as any).tokenStatus,
      expected: 'resale_listed',
    });
  }

  if (!(pool as any).bagsTokenMint) {
    return res.status(400).json({ error: 'no_bags_token' });
  }

  // Idempotency: if a distribution already exists for this resale tx, return it
  const existing = await PoolDistribution.findOne({
    pool: poolId,
    distributionKind: 'resale',
    sourceTxSignature: confirmDeliveryTxSignature,
  });
  if (existing) {
    return res.status(200).json({
      success: true,
      distribution: existing,
      idempotent: true,
    });
  }

  // Take the holder snapshot via Helius DAS
  // Pitfall 6: snapshot is taken AFTER confirm_delivery, not before
  let holders: Awaited<ReturnType<typeof getAllTokenHolders>>;
  try {
    holders = await getAllTokenHolders((pool as any).bagsTokenMint);
  } catch (firstErr: any) {
    // Retry once, then fail gracefully
    try {
      holders = await getAllTokenHolders((pool as any).bagsTokenMint);
    } catch (retryErr: any) {
      const failedDist = await PoolDistribution.create({
        pool: poolId,
        distributionKind: 'resale',
        status: 'snapshot_failed',
        sourceTxSignature: confirmDeliveryTxSignature,
        salePriceUSD: resalePriceUsdc,
        snapshotTakenAt: new Date(),
        distributions: [],
      });
      errorMonitor.captureException(
        retryErr instanceof Error ? retryErr : new Error(String(retryErr)),
        { extra: { poolId, confirmDeliveryTxSignature } }
      );
      return res.status(500).json({
        error: 'snapshot_failed',
        distributionId: failedDist._id,
      });
    }
  }

  // Compute per-holder payout
  // 97% of resale price goes to holders (3% treasury handled by confirm_delivery fee_bps=300)
  const holderPool = resalePriceUsdc * 0.97;
  const totalBalance = holders.reduce((s, h) => s + h.balance, 0);

  const distributions = holders.map((h) => ({
    payoutWallet: h.wallet,
    shares: h.balance,
    payoutUSD: totalBalance > 0 ? (h.balance / totalBalance) * holderPool : 0,
    claimedAt: null,
    claimTxSignature: null,
    burnTxSignature: null,
    paidTxSignature: null,
    paidAt: null,
  }));

  const snapshotTakenAt = new Date();

  const distribution = await PoolDistribution.create({
    pool: poolId,
    distributionKind: 'resale',
    status: 'pending',
    snapshotTakenAt,
    // claimDeadlineAt auto-computed by pre-save hook (snapshotTakenAt + 90 days)
    salePriceUSD: resalePriceUsdc,
    // totalDistributedUSD auto-computed by pre-save hook (salePriceUSD * 0.97)
    sourceEscrowPda: (pool as any).resaleEscrowPda || undefined,
    sourceTxSignature: confirmDeliveryTxSignature,
    distributions,
  });

  // Transition state: resale_listed -> resold
  const transition = await transitionPoolState({
    poolId,
    fromState: 'resale_listed',
    toState: 'resold',
    reason: `resale confirmed, ${holders.length} holders snapshotted`,
    txContext: confirmDeliveryTxSignature,
  });

  if (!transition.success) {
    // State transition failed but distribution was created — log but still respond ok
    // The distribution is the critical artifact; state can be fixed manually
    errorMonitor.captureException(
      new Error(`State transition failed after distribution created: ${transition.error}`),
      { extra: { poolId, distributionId: distribution._id, error: transition.error } }
    );
  }

  return res.status(200).json({
    success: true,
    distribution: {
      id: distribution._id,
      holders: holders.length,
      totalDistributedUSD: distribution.totalDistributedUSD,
      claimDeadlineAt: distribution.claimDeadlineAt,
    },
    stateTransition: transition.success
      ? { newState: 'resold', memoTxSignature: transition.memoTxSignature }
      : { error: transition.error },
  });
}

export default withErrorMonitoring(handler);
