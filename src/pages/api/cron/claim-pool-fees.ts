// src/pages/api/cron/claim-pool-fees.ts
// Vercel Cron: hourly fee claim flywheel for pool trading fees.
// Iterates eligible pools, decides whether to claim based on threshold/schedule,
// calls poolFeeClaimService.claimPoolFees, and triggers graduation check on success.
import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import {
  claimPoolFees,
  getPendingFees,
} from '../../../lib/services/poolFeeClaimService';
import { lamportsToUsd } from '../../../lib/services/solPriceService';

// 0.5 SOL minimum before a claim is worth the on-chain cost
const CLAIM_THRESHOLD_LAMPORTS = 500_000_000;
// Stay under Bags 1000/hr rate limit (~2 API calls per pool)
const MAX_POOLS_PER_TICK = 20;
// When projected accumulation is within 5% of target, force claim
const GRADUATION_USD_BUFFER_HEAD = 0.95;

interface PoolDoc {
  _id: any;
  tokenStatus: string;
  bagsTokenMint?: string;
  accumulatedFeesLamports?: number;
  fundingTargetUsdc?: number;
  slippageBufferBps?: number;
  lastFeeClaimAt?: Date | string | null;
  deleted?: boolean;
}

interface PoolResult {
  poolId: string;
  skipped?: string;
  claimableLamports?: number;
  success?: boolean;
  withdrawalAmountLamports?: number;
  error?: string;
  graduationTriggered?: boolean;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  const isValidCron =
    typeof authHeader === 'string' &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isValidCron && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    await dbConnect();

    // Find pools eligible for fee claiming, oldest-claimed first
    const eligiblePools = await Pool.find({
      tokenStatus: { $in: ['funding', 'graduated'] },
      bagsTokenMint: { $exists: true, $ne: null },
      deleted: { $ne: true },
    })
      .sort({ lastFeeClaimAt: 1 })
      .limit(MAX_POOLS_PER_TICK)
      .lean() as unknown as PoolDoc[];

    const results: PoolResult[] = [];

    for (const pool of eligiblePools) {
      try {
        // Step 1: Check pending fees from Bags API
        const { claimableLamports } = await getPendingFees(pool.bagsTokenMint!);

        // Step 2: Decide whether to claim
        const shouldClaim =
          claimableLamports >= CLAIM_THRESHOLD_LAMPORTS ||
          (await isNearGraduation(pool, claimableLamports)) ||
          isStaleClaim(pool);

        if (!shouldClaim) {
          results.push({
            poolId: pool._id.toString(),
            skipped: 'below_threshold',
            claimableLamports,
          });
          continue;
        }

        // Step 3: Execute the claim
        const result = await claimPoolFees(pool._id.toString());
        const poolResult: PoolResult = {
          poolId: pool._id.toString(),
          success: result.success,
          withdrawalAmountLamports: result.withdrawalAmountLamports,
        };

        if (result.error) {
          poolResult.error = result.error;
        }

        // Step 4: Graduation check after successful claim
        if (result.success && result.withdrawalAmountLamports) {
          const triggered = await maybeTriggerGraduation(pool._id.toString());
          poolResult.graduationTriggered = triggered;
        }

        results.push(poolResult);
      } catch (err: any) {
        // Per-pool isolation -- one pool failing must not break the cron
        results.push({ poolId: pool._id.toString(), error: err.message });
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      eligible: eligiblePools.length,
      results,
    });
  } catch (error: any) {
    console.error('[claim-pool-fees] Error:', error);
    return res.status(500).json({
      error: 'Fee claim cron failed',
      details: error?.message || 'Unknown error',
    });
  }
}

/**
 * Check if claiming would bring the pool near its graduation target.
 * If projected accumulated fees (existing + pending) >= 95% of the
 * USD-equivalent target (with slippage buffer), force the claim.
 */
async function isNearGraduation(
  pool: any,
  claimableLamports: number
): Promise<boolean> {
  if (!pool.fundingTargetUsdc || !pool.accumulatedFeesLamports) return false;

  const projectedLamports =
    (pool.accumulatedFeesLamports || 0) + claimableLamports;
  const projectedUsd = await lamportsToUsd(projectedLamports);

  // fundingTargetUsdc is in USDC base units (6 decimals)
  const targetUsd =
    (pool.fundingTargetUsdc / 1_000_000) *
    (1 + (pool.slippageBufferBps || 200) / 10_000);

  return projectedUsd >= targetUsd * GRADUATION_USD_BUFFER_HEAD;
}

/**
 * Force claim if a pool hasn't been claimed in 24+ hours.
 * Catches low-volume pools that trickle fees slowly.
 */
function isStaleClaim(pool: any): boolean {
  if (!pool.lastFeeClaimAt) return true;
  const claimDate =
    pool.lastFeeClaimAt instanceof Date
      ? pool.lastFeeClaimAt
      : new Date(pool.lastFeeClaimAt);
  const hoursSince = (Date.now() - claimDate.getTime()) / 3_600_000;
  return hoursSince >= 24;
}

/**
 * Trigger graduation check for a pool after a successful fee claim.
 * Uses direct import from the graduation endpoint (11-08).
 */
async function maybeTriggerGraduation(poolId: string): Promise<boolean> {
  try {
    const { triggerGraduationCheck } = await import(
      '@/pages/api/pool/graduate'
    );
    const result = await triggerGraduationCheck(poolId);
    return result.graduated && result.reason === 'graduated_now';
  } catch (err: any) {
    console.error(
      `[claim-pool-fees] Graduation check failed for pool ${poolId}:`,
      err.message
    );
    return false;
  }
}

// Export for testing
export { isNearGraduation, isStaleClaim, maybeTriggerGraduation };
export { CLAIM_THRESHOLD_LAMPORTS, MAX_POOLS_PER_TICK, GRADUATION_USD_BUFFER_HEAD };

export default withErrorMonitoring(handler);
