// src/pages/api/cron/drift-check-pool-fees.ts
// Vercel Cron: daily reconciliation of Pool.accumulatedFeesLamports (primary counter)
// vs sum of TreasuryDeposit audit records. Alerts via Sentry on >1% drift.

import type { NextApiRequest, NextApiResponse } from 'next';
import * as Sentry from '@sentry/nextjs';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { reconcilePoolFeeCounters } from '../../../lib/services/poolFeeClaimService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  await dbConnect();
  const result = await reconcilePoolFeeCounters();

  // Alert Sentry for each drifted pool
  for (const drift of result.drifted) {
    Sentry.captureException(
      new Error(
        `Pool fee drift detected: pool ${drift.poolId} drifted ${drift.diffPct.toFixed(2)}%`
      ),
      {
        level: 'warning',
        tags: {
          category: 'pool_fee_drift',
          poolId: drift.poolId,
        },
        extra: {
          primaryLamports: drift.primaryLamports,
          auditLamports: drift.auditLamports,
          diffLamports: drift.diffLamports,
          diffPct: drift.diffPct,
        },
      }
    );
  }

  return res.status(200).json({
    success: true,
    checked: result.checked,
    driftedCount: result.drifted.length,
    drifted: result.drifted,
  });
}

export default withErrorMonitoring(handler);
