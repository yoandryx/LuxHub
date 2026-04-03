// src/pages/api/cron/reconcile-pools.ts
// Vercel cron job: reconcile Bags graduation status every 6 hours (INFRA-03).
// Detects pools where graduated=false in MongoDB but graduated on Bags API,
// syncs the graduation state, and triggers Squad DAO creation.
import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring, errorMonitor } from '../../../lib/monitoring/errorHandler';
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

/**
 * Trigger Squad DAO creation for a graduated pool.
 * Mirrors the pattern from src/pages/api/webhooks/bags.ts triggerSquadCreation.
 */
async function triggerSquadCreation(poolId: string): Promise<void> {
  const adminWallet = process.env.ADMIN_WALLETS?.split(',')[0];
  if (!adminWallet) {
    console.warn('[reconcile-pools] No ADMIN_WALLETS configured, cannot trigger Squad creation');
    return;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const finalizeUrl = `${baseUrl}/api/pool/finalize`;

  const response = await fetch(finalizeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-webhook': process.env.BAGS_WEBHOOK_SECRET || 'internal',
    },
    body: JSON.stringify({
      poolId,
      adminWallet,
      skipNftTransfer: true,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Squad creation failed: ${JSON.stringify(errorData)}`);
  }
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

    // Find all pools with a Bags token that haven't graduated yet
    const pools = await Pool.find({
      bagsTokenMint: { $exists: true, $ne: null },
      graduated: false,
      status: { $in: ['open', 'funded', 'filled', 'custody', 'active'] },
      deleted: { $ne: true },
    }).select('_id bagsTokenMint bagsTokenStatus status');

    if (pools.length === 0) {
      return res.status(200).json({
        success: true,
        checked: 0,
        reconciled: 0,
        errors: 0,
        message: 'No pre-graduation pools found to reconcile.',
      });
    }

    let reconciled = 0;
    let errors = 0;
    const bagsApiKey = process.env.BAGS_API_KEY;

    for (const pool of pools) {
      try {
        // Check Bags API for token status
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

        // Check if Bags says graduated but MongoDB doesn't
        const isGraduatedOnBags =
          tokenData.status === 'MIGRATED' || tokenData.graduated === true;

        if (isGraduatedOnBags) {
          // Reconcile: update MongoDB to reflect graduation
          const updateFields: Record<string, unknown> = {
            graduated: true,
            graduatedAt: new Date(),
            bagsTokenStatus: 'MIGRATED',
            bondingCurveActive: false,
          };

          if (tokenData.marketCap) {
            updateFields.graduationMarketCap = tokenData.marketCap;
          }
          if (tokenData.priceUSD) {
            updateFields.graduationPriceUSD = tokenData.priceUSD;
          }

          await Pool.findByIdAndUpdate(pool._id, { $set: updateFields });

          // Log reconciliation event to Sentry
          errorMonitor.captureMessage('Reconciliation: Pool graduation detected', {
            extra: {
              poolId: pool._id.toString(),
              bagsTokenMint: pool.bagsTokenMint,
              marketCap: tokenData.marketCap,
              priceUSD: tokenData.priceUSD,
            },
          });

          // Trigger Squad DAO creation (non-blocking)
          triggerSquadCreation(pool._id.toString()).catch((err) => {
            console.error(
              `[reconcile-pools] Squad creation failed for pool ${pool._id}:`,
              err.message
            );
            errorMonitor.captureException(err as Error, {
              extra: {
                poolId: pool._id.toString(),
                bagsTokenMint: pool.bagsTokenMint,
                context: 'reconciliation-squad-creation',
              },
            });
          });

          reconciled++;
        }
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
      reconciled,
      errors,
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
