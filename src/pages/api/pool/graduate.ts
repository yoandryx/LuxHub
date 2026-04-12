// src/pages/api/pool/graduate.ts
// Phase 11 graduation trigger endpoint.
//
// Two entry paths:
//   1. Admin HTTP POST /api/pool/graduate?poolId=xxx (manual trigger)
//   2. Direct import: `triggerGraduationCheck(poolId)` from claim cron (11-06)
//
// Performs the USD-equivalent graduation check using solPriceService,
// transitions pool state from `funding -> graduated` via poolStateTransition,
// and fires the bridge via poolBridgeService.
//
// Bridge failure does NOT revert the graduation state -- admin retries
// manually via POST /api/pool/bridge-to-escrow.

import type { NextApiRequest, NextApiResponse } from 'next';
import { lamportsToUsd, usdcUnitsToUsd } from '@/lib/services/solPriceService';
import { transitionPoolState } from '@/lib/services/poolStateTransition';
import { bridgeToEscrow } from '@/lib/services/poolBridgeService';
import { Pool } from '@/lib/models/Pool';
import { getAdminConfig } from '@/lib/config/adminConfig';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import dbConnect from '@/lib/database/mongodb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraduationCheckResult {
  poolId: string;
  graduated: boolean;
  reason:
    | 'target_not_met'
    | 'already_graduated_or_later'
    | 'graduated_now'
    | 'no_target_set'
    | 'wrong_state';
  accumulatedUsd?: number;
  targetUsdWithBuffer?: number;
  bridgeResult?: any;
}

// States that indicate the pool has already graduated (or moved past graduation)
const POST_GRADUATION_STATES = [
  'graduated',
  'custody',
  'resale_listed',
  'resold',
  'distributed',
  'partial_distributed',
  'resale_unlisted',
];

// ---------------------------------------------------------------------------
// Core graduation check (exported for direct import by cron)
// ---------------------------------------------------------------------------

/**
 * Idempotent graduation check. Safe to call repeatedly.
 * If the pool has crossed the target, this function:
 *  1. Transitions tokenStatus funding -> graduated
 *  2. Calls bridgeToEscrow to fund the backing escrow
 *  3. Returns the combined result
 *
 * Requires dbConnect() to have been called beforehand.
 */
export async function triggerGraduationCheck(
  poolId: string
): Promise<GraduationCheckResult> {
  const pool = await Pool.findById(poolId);
  if (!pool) throw new Error('pool_not_found');

  // States BEYOND 'funding' are already graduated -- idempotent no-op
  if ((pool as any).tokenStatus !== 'funding') {
    if (POST_GRADUATION_STATES.includes((pool as any).tokenStatus)) {
      return { poolId, graduated: true, reason: 'already_graduated_or_later' };
    }
    return { poolId, graduated: false, reason: 'wrong_state' };
  }

  if (!(pool as any).fundingTargetUsdc) {
    return { poolId, graduated: false, reason: 'no_target_set' };
  }

  // USD-equivalent comparison per CONTEXT Gray area 5:
  //   accumulatedFeesLamports (SOL) converted to USD
  //   vs fundingTargetUsdc (USDC base units) converted to USD with slippage buffer
  const accumulatedUsd = await lamportsToUsd(
    (pool as any).accumulatedFeesLamports || 0
  );
  const targetUsd = usdcUnitsToUsd((pool as any).fundingTargetUsdc);
  const buffer = 1 + (((pool as any).slippageBufferBps || 200) / 10000);
  const targetUsdWithBuffer = targetUsd * buffer;

  if (accumulatedUsd < targetUsdWithBuffer) {
    return {
      poolId,
      graduated: false,
      reason: 'target_not_met',
      accumulatedUsd,
      targetUsdWithBuffer,
    };
  }

  // Transition funding -> graduated
  const transition = await transitionPoolState({
    poolId,
    fromState: 'funding',
    toState: 'graduated',
    reason: `accumulated ${accumulatedUsd.toFixed(2)} USD >= target ${targetUsdWithBuffer.toFixed(2)} USD`,
  });

  if (!transition.success) {
    // Race condition: another process beat us to it. Treat as idempotent.
    return { poolId, graduated: true, reason: 'already_graduated_or_later' };
  }

  // Trigger the bridge (SOL->USDC swap + exchange into backing escrow)
  let bridgeResult;
  try {
    bridgeResult = await bridgeToEscrow({
      poolId,
      adminWallet: 'cron', // attribution tag
    });
  } catch (e: any) {
    // Bridge failure does NOT revert the graduation transition.
    // State stays 'graduated' and admin can retry via bridge-to-escrow endpoint.
    bridgeResult = { success: false, error: e.message };
  }

  return {
    poolId,
    graduated: true,
    reason: 'graduated_now',
    accumulatedUsd,
    targetUsdWithBuffer,
    bridgeResult,
  };
}

// ---------------------------------------------------------------------------
// HTTP handler for admin manual trigger
// ---------------------------------------------------------------------------

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Two entry paths:
  //  1. Admin wallet (manual trigger)
  //  2. Cron with CRON_SECRET (not expected -- cron uses direct import, but allow for debug)
  const isCron =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;

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

  const poolId =
    (req.query.poolId as string) || req.body?.poolId;

  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'invalid_pool_id' });
  }

  try {
    await dbConnect();
    const result = await triggerGraduationCheck(poolId);
    return res.status(200).json(result);
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
}

export default withErrorMonitoring(handler);
