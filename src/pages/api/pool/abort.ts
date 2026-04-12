// src/pages/api/pool/abort.ts
// Phase 11-14: Per-pool abort/refund safety valve.
//
// Admin-gated endpoint that aborts a pool and creates a pro-rata refund
// distribution for current token holders. Behavior differs by current state:
//
//   - pending/minted: Pre-token-trading abort. No fees accumulated, no distribution.
//   - funding: Pool has trading fees in TREASURY_POOLS. Pro-rata abort-refund distribution.
//   - graduated/custody: Post-graduation. Creates distribution record + flags manual recovery.
//   - resale_listed/resale_unlisted: Custody abort. Pro-rata distribution from accumulated fees.
//
// Route: POST /api/pool/abort?poolId=xxx  (or body.poolId)
// Body: { reason: string }  (min 10 chars)
// Auth: Admin wallet via x-wallet-address header

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring, errorMonitor } from '@/lib/monitoring/errorHandler';
import { getAdminConfig } from '@/lib/config/adminConfig';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { PoolDistribution } from '@/lib/models/PoolDistribution';
import { transitionPoolState } from '@/lib/services/poolStateTransition';
import { getAllTokenHolders } from '@/lib/services/dasApi';
import { lamportsToUsd } from '@/lib/services/solPriceService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ABORTABLE_STATES = [
  'pending',
  'minted',
  'funding',
  'graduated',
  'custody',
  'resale_listed',
  'resale_unlisted',
] as const;

const PRE_TRADING_STATES = new Set(['pending', 'minted']);
const POST_GRADUATION_STATES = new Set(['graduated', 'custody']);

// ---------------------------------------------------------------------------
// Abort distribution helper
// ---------------------------------------------------------------------------

async function runAbortRefundDistribution(
  pool: any,
  reason: string,
  res: NextApiResponse,
  flowLabel: string
) {
  if (!pool.bagsTokenMint) {
    return res.status(400).json({ error: 'no_bags_token' });
  }

  // Snapshot current holders via Helius DAS
  let holders: Awaited<ReturnType<typeof getAllTokenHolders>>;
  try {
    holders = await getAllTokenHolders(pool.bagsTokenMint);
  } catch (firstErr: any) {
    // Retry once, then fail gracefully
    try {
      holders = await getAllTokenHolders(pool.bagsTokenMint);
    } catch (retryErr: any) {
      const failedDist = await PoolDistribution.create({
        pool: pool._id,
        distributionKind: 'abort_refund',
        status: 'snapshot_failed',
        snapshotTakenAt: new Date(),
        salePriceUSD: 0,
        distributions: [],
      });
      errorMonitor.captureException(
        retryErr instanceof Error ? retryErr : new Error(String(retryErr)),
        { extra: { poolId: pool._id, flow: flowLabel } }
      );
      return res.status(500).json({
        error: 'snapshot_failed',
        distributionId: failedDist._id,
      });
    }
  }

  // Calculate refund amount from accumulated fees
  const refundUsd = await lamportsToUsd(pool.accumulatedFeesLamports || 0);
  const totalBalance = holders.reduce((s: number, h: any) => s + h.balance, 0);

  const distributions = holders.map((h: any) => ({
    payoutWallet: h.wallet,
    shares: h.balance,
    payoutUSD: totalBalance > 0 ? (h.balance / totalBalance) * refundUsd : 0,
    claimedAt: null,
    claimTxSignature: null,
    burnTxSignature: null,
    paidTxSignature: null,
    paidAt: null,
  }));

  const snapshotTakenAt = new Date();

  const distribution = await PoolDistribution.create({
    pool: pool._id,
    distributionKind: 'abort_refund',
    status: 'pending',
    snapshotTakenAt,
    // claimDeadlineAt auto-computed by pre-save hook (snapshotTakenAt + 90 days)
    salePriceUSD: refundUsd,
    // totalDistributedUSD auto-computed by pre-save hook
    sourceEscrowPda: pool.backingEscrowPda || undefined,
    sourceTxSignature: null, // no single tx -- app-driven abort
    distributions,
  });

  // Transition to aborted state
  const transition = await transitionPoolState({
    poolId: pool._id.toString(),
    fromState: pool.tokenStatus,
    toState: 'aborted',
    reason: `${flowLabel}: ${reason}`,
  });

  if (!transition.success) {
    // Distribution was created but state transition failed -- log but still respond ok
    // The distribution is the critical artifact; state can be fixed manually
    errorMonitor.captureException(
      new Error(`State transition failed after abort distribution: ${transition.error}`),
      { extra: { poolId: pool._id, distributionId: distribution._id, error: transition.error } }
    );
  }

  return res.status(200).json({
    success: true,
    flow: flowLabel,
    distributionId: distribution._id,
    holders: holders.length,
    refundUsd,
    reason,
  });
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin auth -- follows getAdminConfig().isAdmin() pattern
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

  // Pool ID from query or body
  const poolId = (req.query.poolId as string) || req.body?.poolId;
  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  // Reason validation
  const { reason } = req.body || {};
  if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
    return res.status(400).json({
      error: 'reason_required',
      message: 'Abort reason must be at least 10 characters',
    });
  }

  await dbConnect();

  const pool = await Pool.findById(poolId);
  if (!pool) {
    return res.status(404).json({ error: 'pool_not_found' });
  }

  const currentState = (pool as any).tokenStatus;

  // Check abortable state
  if (!ABORTABLE_STATES.includes(currentState)) {
    return res.status(400).json({
      error: 'not_abortable',
      current: currentState,
    });
  }

  // --- Pre-trading abort (pending, minted) ---
  // No accumulated fees, no token holders to distribute to.
  if (PRE_TRADING_STATES.has(currentState)) {
    const transition = await transitionPoolState({
      poolId: poolId,
      fromState: currentState,
      toState: 'aborted',
      reason: `admin abort: ${reason.trim()}`,
    });

    if (!transition.success) {
      return res.status(409).json({
        error: 'transition_failed',
        detail: transition.error,
      });
    }

    return res.status(200).json({
      success: true,
      flow: 'pre_trading',
      reason: reason.trim(),
    });
  }

  // --- Funding abort ---
  // Pool has trading fees in TREASURY_POOLS. Distribute pro-rata to current holders.
  if (currentState === 'funding') {
    return await runAbortRefundDistribution(pool, reason.trim(), res, 'funding_abort');
  }

  // --- Post-graduation abort (graduated, custody) ---
  // USDC already left TREASURY_POOLS. Create distribution record + flag manual recovery.
  if (POST_GRADUATION_STATES.has(currentState)) {
    return await runAbortRefundDistribution(
      pool,
      reason.trim(),
      res,
      'post_graduation_abort_manual_recovery_required'
    );
  }

  // --- Resale-phase abort (resale_listed, resale_unlisted) ---
  // NFT in custody but not yet resold. Pro-rata distribution from accumulated fees.
  if (currentState === 'resale_listed' || currentState === 'resale_unlisted') {
    return await runAbortRefundDistribution(pool, reason.trim(), res, 'custody_abort');
  }

  // Should be unreachable given the ABORTABLE_STATES guard above
  return res.status(500).json({ error: 'unreachable' });
}

export default withErrorMonitoring(handler);
