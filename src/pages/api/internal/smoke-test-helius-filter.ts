// src/pages/api/internal/smoke-test-helius-filter.ts
// Phase 11 plan 15 Task 15.5: FAIL-LOUD smoke test for Helius webhook filter.
//
// Why: Task 15.1 requires a MANUAL Helius dashboard update to add
// TREASURY_POOLS to the account filter. If a deploy goes out without this
// filter update, fee arrivals to the Pools Treasury will not trigger the
// Helius webhook and the audit ledger silently degrades. This endpoint is
// the canary: it calls the Helius webhook API and asserts that
// `accountAddresses` includes the current TREASURY_POOLS wallet.
//
// Admin-gated. Returns `{ ok: true, filter: [...] }` on success or
// `{ ok: false, reason, actionRequired }` on failure. Emits a Sentry error
// on failure so the on-call admin is paged.

import type { NextApiRequest, NextApiResponse } from 'next';
import * as Sentry from '@sentry/nextjs';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { getAdminConfig } from '@/lib/config/adminConfig';
import { getTreasury } from '@/lib/config/treasuryConfig';

interface HeliusWebhookConfig {
  webhookID?: string;
  accountAddresses?: string[];
  transactionTypes?: string[];
  webhookURL?: string;
  [key: string]: unknown;
}

type SmokeResult =
  | {
      ok: true;
      webhookId: string;
      filter: string[];
      poolsTreasury: string;
    }
  | {
      ok: false;
      reason: string;
      actionRequired: string;
      webhookId?: string;
      filter?: string[];
      poolsTreasury?: string;
    };

/**
 * Run the smoke test. Exported so the daily drift-check cron and the
 * post-deploy health endpoint can reuse it without going through HTTP.
 */
export async function runHeliusFilterSmokeTest(): Promise<SmokeResult> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  const webhookId = process.env.HELIUS_WEBHOOK_ID;

  if (!heliusApiKey) {
    return {
      ok: false,
      reason: 'HELIUS_API_KEY not set — cannot verify webhook filter',
      actionRequired: 'Set HELIUS_API_KEY in the environment (see .env.example).',
    };
  }
  if (!webhookId) {
    return {
      ok: false,
      reason: 'HELIUS_WEBHOOK_ID not set — cannot verify webhook filter',
      actionRequired:
        'Set HELIUS_WEBHOOK_ID to the webhook id shown in the Helius dashboard.',
    };
  }

  let poolsTreasury: string;
  try {
    poolsTreasury = getTreasury('pools');
  } catch (e: any) {
    return {
      ok: false,
      reason: `TREASURY_POOLS not configured: ${e?.message || 'unknown error'}`,
      actionRequired: 'Set TREASURY_POOLS in the environment to the pools vault PDA.',
    };
  }

  let config: HeliusWebhookConfig;
  try {
    const response = await fetch(
      `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${heliusApiKey}`,
      { method: 'GET', headers: { Accept: 'application/json' } }
    );
    if (!response.ok) {
      return {
        ok: false,
        reason: `Helius API returned ${response.status} when fetching webhook ${webhookId}`,
        actionRequired:
          'Verify HELIUS_WEBHOOK_ID and HELIUS_API_KEY are correct, and that the webhook still exists in the Helius dashboard.',
        webhookId,
        poolsTreasury,
      };
    }
    config = (await response.json()) as HeliusWebhookConfig;
  } catch (e: any) {
    return {
      ok: false,
      reason: `Failed to reach Helius webhook API: ${e?.message || 'network error'}`,
      actionRequired:
        'Check Helius API reachability and the HELIUS_API_KEY credential.',
      webhookId,
      poolsTreasury,
    };
  }

  const filter = Array.isArray(config.accountAddresses) ? config.accountAddresses : [];

  if (!filter.includes(poolsTreasury)) {
    return {
      ok: false,
      reason: `TREASURY_POOLS (${poolsTreasury}) is NOT in the Helius webhook account filter`,
      actionRequired:
        'Update the Helius webhook in the Helius dashboard to include TREASURY_POOLS in accountAddresses. See plan 11-15 Task 15.1.',
      webhookId,
      filter,
      poolsTreasury,
    };
  }

  return {
    ok: true,
    webhookId,
    filter,
    poolsTreasury,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin auth: accept either CRON_SECRET (for scheduled health probes) or
  // an admin wallet via header (for manual post-deploy verification).
  const authHeader = req.headers['authorization'];
  const isCron =
    typeof authHeader === 'string' && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const wallet =
    (req.headers['x-wallet-address'] as string) ||
    (req.query.wallet as string) ||
    '';

  let isAdmin = false;
  if (wallet) {
    try {
      isAdmin = getAdminConfig().isAdmin(wallet);
    } catch {
      isAdmin = false;
    }
  }

  if (!isCron && !isAdmin && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'Unauthorized: admin wallet or CRON_SECRET required' });
  }

  const result = await runHeliusFilterSmokeTest();

  if (!result.ok) {
    // FAIL-LOUD: Sentry error (not warning) so the on-call admin is paged.
    Sentry.captureException(
      new Error(`Helius webhook filter smoke test FAILED: ${result.reason}`),
      {
        level: 'error',
        tags: { category: 'helius_filter_smoke_test' },
        extra: {
          reason: result.reason,
          actionRequired: result.actionRequired,
          webhookId: result.webhookId,
          filter: result.filter,
          poolsTreasury: result.poolsTreasury,
        },
      }
    );
    return res.status(503).json(result);
  }

  return res.status(200).json(result);
}

export default withErrorMonitoring(handler);
