// src/pages/api/cron/reconcile-pools.ts
// Vercel cron job: informational Bags DBC state reconciliation (every 6 hours).
//
// Phase 11: Bags DBC graduation is informational-only. LuxHub graduation is
// fee-driven via poolFeeClaimService + /api/pool/graduate. This cron does NOT
// trigger Squad DAO creation, does NOT bridge funds, and does NOT gate the
// LuxHub lifecycle on Bags state. It simply polls the Bags public API and
// records the observed DBC state on Pool.bagsDbcState + price/volume sync so
// the Feature 3 dual progress bar has fresh data.
import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

interface BagsTokenResponse {
  status?: string;
  graduated?: boolean;
  marketCap?: number;
  priceUSD?: number;
  name?: string;
  symbol?: string;
  [key: string]: unknown;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel cron sends GET requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: CRON_SECRET via Authorization header (Vercel cron pattern)
  const authHeader = req.headers['authorization'];
  const isValidCron =
    typeof authHeader === 'string' && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isValidCron && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Invalid CRON_SECRET' });
  }

  try {
    await dbConnect();

    // Phase 11 state filter: only active lifecycle states with a Bags token.
    // minted / funding / graduated are the states where Bags DBC state can
    // still evolve and matters for the dual progress bar.
    const pools = await Pool.find({
      tokenStatus: { $in: ['minted', 'funding', 'graduated'] },
      bagsTokenMint: { $exists: true, $ne: null },
      deleted: { $ne: true },
    }).select('_id bagsTokenMint bagsTokenStatus tokenStatus');

    if (pools.length === 0) {
      return res.status(200).json({
        success: true,
        checked: 0,
        synced: 0,
        errors: 0,
        message: 'No active pools with a Bags token found.',
      });
    }

    let synced = 0;
    let errors = 0;
    const bagsApiKey = process.env.BAGS_API_KEY;

    for (const pool of pools) {
      try {
        const headers: Record<string, string> = {
          Accept: 'application/json',
        };
        if (bagsApiKey) {
          headers['x-api-key'] = bagsApiKey;
        }

        const response = await fetch(`${BAGS_API_BASE}/token/${pool.bagsTokenMint}`, { headers });

        if (!response.ok) {
          console.warn(
            `[reconcile-pools] Bags API returned ${response.status} for mint ${pool.bagsTokenMint}`
          );
          errors++;
          continue;
        }

        const tokenData: BagsTokenResponse = await response.json();

        // Informational sync: record Bags DBC state + latest price / market
        // cap. We do NOT trigger graduation here — that path lives in the
        // claim-pool-fees cron + /api/pool/graduate. We do NOT flip
        // Pool.tokenStatus on the basis of Bags DBC state.
        const bagsDbcState =
          typeof tokenData.status === 'string'
            ? tokenData.status
            : tokenData.graduated === true
              ? 'MIGRATED'
              : undefined;

        const updateFields: Record<string, unknown> = {
          lastUpdatedAt: new Date(),
        };
        if (bagsDbcState) {
          updateFields.bagsDbcState = bagsDbcState;
          // Keep the legacy bagsTokenStatus enum in sync when it maps cleanly
          // so existing UI that reads bagsTokenStatus still works.
          if (['PRE_LAUNCH', 'PRE_GRAD', 'MIGRATING', 'MIGRATED'].includes(bagsDbcState)) {
            updateFields.bagsTokenStatus = bagsDbcState;
          }
        }
        if (typeof tokenData.marketCap === 'number') {
          updateFields.lastMarketCap = tokenData.marketCap;
        }
        if (typeof tokenData.priceUSD === 'number') {
          updateFields.lastPriceUSD = tokenData.priceUSD;
        }

        await Pool.findByIdAndUpdate(pool._id, { $set: updateFields });
        synced++;
      } catch (poolError: any) {
        console.error(
          `[reconcile-pools] Error checking pool ${pool._id}:`,
          poolError.message
        );
        errors++;
      }
    }

    return res.status(200).json({
      success: true,
      checked: pools.length,
      synced,
      errors,
      note: 'Informational Bags DBC sync only. LuxHub graduation is fee-driven.',
    });
  } catch (error: any) {
    console.error('[reconcile-pools] Error:', error);
    return res.status(500).json({
      error: 'Reconciliation failed',
      details: error?.message || 'Unknown error',
    });
  }
}

export default withErrorMonitoring(handler);
