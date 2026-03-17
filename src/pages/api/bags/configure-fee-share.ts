// src/pages/api/bags/configure-fee-share.ts
// Configure fee share for automatic royalty routing via Bags API v2
// Bags creator fee = 1% of all trade volume. The 10,000 BPS here splits that 1% among claimers.
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';

interface FeeShareClaimer {
  wallet: string;
  basisPoints: number; // Share of creator fee (must total 10,000 across all claimers)
  label?: string;
}

interface ConfigureFeeShareRequest {
  poolId: string;
  adminWallet: string;
  feeClaimers?: FeeShareClaimer[];
  // Optional partner integration (LuxHub partner key)
  includePartner?: boolean;
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// LuxHub treasury wallet — receives creator fee share
const LUXHUB_TREASURY = process.env.NEXT_PUBLIC_LUXHUB_WALLET;

/**
 * Build the default fee claimers array for a pool.
 * 10,000 BPS = 100% of the creator's 1% fee on every trade.
 *
 * Default split:
 *  - LuxHub Treasury: 8,333 BPS (83.33%) — platform ops + holder rewards + trade rewards
 *  - Vendor Wallet:   1,667 BPS (16.67%) — vendor's automatic on-chain cut
 *
 * If no vendor wallet, treasury gets 10,000 BPS (100%).
 */
function buildDefaultClaimers(
  treasuryWallet: string,
  vendorWallet?: string
): FeeShareClaimer[] {
  if (vendorWallet && vendorWallet !== treasuryWallet) {
    return [
      { wallet: treasuryWallet, basisPoints: 8333, label: 'LuxHub Treasury' },
      { wallet: vendorWallet, basisPoints: 1667, label: 'Vendor' },
    ];
  }
  return [{ wallet: treasuryWallet, basisPoints: 10000, label: 'LuxHub Treasury' }];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, feeClaimers, includePartner } =
      req.body as ConfigureFeeShareRequest;

    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
    }
    if (!LUXHUB_TREASURY) {
      return res.status(500).json({ error: 'LUXHUB_WALLET not configured' });
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
    if (!pool.bagsTokenMint) {
      return res.status(400).json({
        error: 'Pool does not have a Bags token. Create token first via /api/bags/create-pool-token',
      });
    }
    if (pool.meteoraConfigKey) {
      return res.status(400).json({
        error: 'Fee share config already exists for this pool',
        meteoraConfigKey: pool.meteoraConfigKey,
      });
    }

    // Build claimers — use custom or defaults
    const finalClaimers = feeClaimers || buildDefaultClaimers(LUXHUB_TREASURY, pool.vendorWallet);

    // Validate BPS totals exactly 10,000
    const totalBps = finalClaimers.reduce((sum, c) => sum + c.basisPoints, 0);
    if (totalBps !== 10000) {
      return res.status(400).json({
        error: `Basis points must total exactly 10,000 (got ${totalBps}). This represents 100% of the creator's 1% trading fee.`,
        totalBps,
        claimers: finalClaimers,
      });
    }

    // Validate individual claimers
    const invalidClaimer = finalClaimers.find(
      (c) => c.basisPoints <= 0 || c.basisPoints > 10000
    );
    if (invalidClaimer) {
      return res.status(400).json({
        error: 'Each claimer must have basisPoints between 1 and 10,000',
        invalidWallet: invalidClaimer.wallet,
      });
    }

    // Build Bags API request — separate arrays per v2 spec
    const claimersArray = finalClaimers.map((c) => c.wallet);
    const basisPointsArray = finalClaimers.map((c) => c.basisPoints);

    const requestBody: Record<string, unknown> = {
      baseMint: pool.bagsTokenMint,
      payer: adminWallet,
      claimersArray,
      basisPointsArray,
    };

    // Include partner config if requested and available
    const partnerWallet = process.env.BAGS_PARTNER_WALLET || LUXHUB_TREASURY;
    const partnerConfigPda = process.env.BAGS_PARTNER_CONFIG_PDA;
    if (includePartner !== false && partnerWallet && partnerConfigPda) {
      requestBody.partner = partnerWallet;
      requestBody.partnerConfig = partnerConfigPda;
    }

    // Call Bags fee-share/config endpoint
    const feeShareResponse = await fetch(`${BAGS_API_BASE}/fee-share/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!feeShareResponse.ok) {
      const errorData = await feeShareResponse.json().catch(() => ({}));
      console.error('[configure-fee-share] Bags API error:', errorData);
      return res.status(500).json({
        error: 'Failed to create fee share config via Bags API',
        details: errorData,
      });
    }

    const feeShareResult = await feeShareResponse.json();
    const responseData = feeShareResult.response || feeShareResult;

    // Extract key fields from response
    const meteoraConfigKey = responseData.meteoraConfigKey;
    const feeShareAuthority = responseData.feeShareAuthority;
    const needsCreation = responseData.needsCreation;
    const transactions = responseData.transactions || [];
    const bundles = responseData.bundles || [];

    // Update pool with fee share config
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        meteoraConfigKey,
        feeShareAuthority,
        bagsFeeShareConfigId: meteoraConfigKey, // backwards compat
        feeShareClaimers: finalClaimers.map((c) => ({
          wallet: c.wallet,
          basisPoints: c.basisPoints,
          label: c.label,
        })),
      },
    });

    return res.status(200).json({
      success: true,
      feeShareConfig: {
        meteoraConfigKey,
        feeShareAuthority,
        needsCreation,
        baseMint: pool.bagsTokenMint,
        claimers: finalClaimers,
        totalBps: 10000,
        description:
          'Splits 100% of the creator 1% trading fee among claimers. Bags charges 1% on every trade — this config determines who gets what portion.',
      },
      // Transactions to sign (may be multiple if config needs creation)
      transactions,
      bundles,
      pool: {
        _id: pool._id,
        meteoraConfigKey,
      },
      message: needsCreation
        ? 'Fee share config created. Sign all transactions in order to activate.'
        : 'Fee share config already exists on-chain. Config key returned.',
      note: 'The meteoraConfigKey is needed for the token launch transaction.',
    });
  } catch (error: any) {
    console.error('[/api/bags/configure-fee-share] Error:', error);
    return res.status(500).json({
      error: 'Failed to configure fee share',
      details: error?.message || 'Unknown error',
    });
  }
}

/**
 * Internal helper — configure fee share for a pool without going through HTTP.
 * Called by create-pool-token during the token launch flow.
 *
 * Returns the meteoraConfigKey needed for the launch transaction.
 */
export async function configureFeeShareInternal(
  poolId: string,
  tokenMint: string,
  payerWallet: string,
  vendorWallet?: string
): Promise<{
  success: boolean;
  meteoraConfigKey?: string;
  feeShareAuthority?: string;
  transactions?: any[];
  error?: string;
}> {
  const bagsApiKey = process.env.BAGS_API_KEY;
  const treasury = LUXHUB_TREASURY;
  if (!bagsApiKey || !treasury) {
    return { success: false, error: 'Missing BAGS_API_KEY or LUXHUB_WALLET' };
  }

  // Build claimers
  const claimers = buildDefaultClaimers(treasury, vendorWallet);
  const claimersArray = claimers.map((c) => c.wallet);
  const basisPointsArray = claimers.map((c) => c.basisPoints);

  const requestBody: Record<string, unknown> = {
    baseMint: tokenMint,
    payer: payerWallet,
    claimersArray,
    basisPointsArray,
  };

  // Include partner config if available
  const partnerWallet = process.env.BAGS_PARTNER_WALLET || treasury;
  const partnerConfigPda = process.env.BAGS_PARTNER_CONFIG_PDA;
  if (partnerWallet && partnerConfigPda) {
    requestBody.partner = partnerWallet;
    requestBody.partnerConfig = partnerConfigPda;
  }

  try {
    const response = await fetch(`${BAGS_API_BASE}/fee-share/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: JSON.stringify(errorData) };
    }

    const result = await response.json();
    const data = result.response || result;

    const meteoraConfigKey = data.meteoraConfigKey;
    const feeShareAuthority = data.feeShareAuthority;

    // Update pool
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        meteoraConfigKey,
        feeShareAuthority,
        bagsFeeShareConfigId: meteoraConfigKey,
        feeShareClaimers: claimers.map((c) => ({
          wallet: c.wallet,
          basisPoints: c.basisPoints,
          label: c.label,
        })),
      },
    });

    return {
      success: true,
      meteoraConfigKey,
      feeShareAuthority,
      transactions: data.transactions || [],
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
