// src/pages/api/bags/partner-stats.ts
// Get LuxHub partner earnings and stats from Bags API
import type { NextApiRequest, NextApiResponse } from 'next';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const bagsApiKey = process.env.BAGS_API_KEY;
    const partnerWallet = process.env.BAGS_PARTNER_WALLET || process.env.NEXT_PUBLIC_LUXHUB_WALLET;

    if (!bagsApiKey) {
      return res.status(500).json({
        error: 'BAGS_API_KEY not configured',
      });
    }

    if (!partnerWallet) {
      return res.status(500).json({
        error: 'BAGS_PARTNER_WALLET not configured',
      });
    }

    // Get partner stats from Bags API
    const statsResponse = await fetch(`${BAGS_API_BASE}/partner/stats?wallet=${partnerWallet}`, {
      method: 'GET',
      headers: {
        'x-api-key': bagsApiKey,
      },
    });

    if (!statsResponse.ok) {
      const errorData = await statsResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to fetch partner stats from Bags API',
        details: errorData,
      });
    }

    const statsResult = await statsResponse.json();

    // Get claimable fees
    const claimableResponse = await fetch(
      `${BAGS_API_BASE}/partner/claimable?wallet=${partnerWallet}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': bagsApiKey,
        },
      }
    );

    let claimableResult = null;
    if (claimableResponse.ok) {
      claimableResult = await claimableResponse.json();
    }

    return res.status(200).json({
      success: true,
      partner: {
        wallet: partnerWallet,
        stats: statsResult,
        claimable: claimableResult,
      },
      summary: {
        totalEarnings: statsResult.totalEarnings || 0,
        totalTransactions: statsResult.totalTransactions || 0,
        pendingClaims: claimableResult?.pendingAmount || 0,
        lastClaimed: statsResult.lastClaimedAt,
      },
      message: 'Partner stats retrieved successfully',
    });
  } catch (error: any) {
    console.error('[/api/bags/partner-stats] Error:', error);
    return res.status(500).json({
      error: 'Failed to get partner stats',
      details: error?.message || 'Unknown error',
    });
  }
}
