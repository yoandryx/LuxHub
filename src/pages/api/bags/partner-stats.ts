// src/pages/api/bags/partner-stats.ts
// Get LuxHub partner earnings and claim stats from Bags API v2
//
// Partner fees = 25% of Bags platform fees on tokens launched with our partner config.
// This is SEPARATE from creator fees (1% of volume split via fee-share config).
//
// Bags API endpoints:
//   GET  /fee-share/partner-config/stats?partner=WALLET  → { claimedFees, unclaimedFees } (lamports)
//   POST /fee-share/partner-config/claim-tx { partnerWallet } → claim transactions
//
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTreasury } from '../../../lib/config/treasuryConfig';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const LAMPORTS_PER_SOL = 1_000_000_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const bagsApiKey = process.env.BAGS_API_KEY;
    let partnerWallet: string;
    try {
      partnerWallet = getTreasury('partner');
    } catch {
      return res.status(500).json({ error: 'TREASURY_PARTNER not configured' });
    }

    if (!bagsApiKey) {
      return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
    }
    // Get partner stats — GET with query param
    const statsUrl = new URL(`${BAGS_API_BASE}/fee-share/partner-config/stats`);
    statsUrl.searchParams.set('partner', partnerWallet);

    const statsResponse = await fetch(statsUrl.toString(), {
      method: 'GET',
      headers: { 'x-api-key': bagsApiKey },
    });

    if (!statsResponse.ok) {
      const errorData = await statsResponse.json().catch(() => ({}));
      // 404 means partner config not yet created
      if (statsResponse.status === 404) {
        return res.status(200).json({
          success: true,
          partnerConfigExists: false,
          partner: { wallet: partnerWallet },
          summary: {
            claimedFeesLamports: '0',
            claimedFeesSOL: 0,
            unclaimedFeesLamports: '0',
            unclaimedFeesSOL: 0,
          },
          message:
            'Partner config not found. Create one via POST /api/bags/create-partner-config to start earning partner fees.',
        });
      }
      return res.status(500).json({
        error: 'Failed to fetch partner stats from Bags API',
        details: errorData,
      });
    }

    const statsResult = await statsResponse.json();
    const statsData = statsResult.response || statsResult;

    // Parse lamport values
    const claimedFeesLamports = statsData.claimedFees || '0';
    const unclaimedFeesLamports = statsData.unclaimedFees || '0';
    const claimedFeesSOL = parseInt(claimedFeesLamports) / LAMPORTS_PER_SOL;
    const unclaimedFeesSOL = parseInt(unclaimedFeesLamports) / LAMPORTS_PER_SOL;

    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({
      success: true,
      partnerConfigExists: true,
      partner: {
        wallet: partnerWallet,
        description:
          'Partner fees = 25% of Bags platform fees on all tokens launched with LuxHub partner config',
      },
      summary: {
        claimedFeesLamports,
        claimedFeesSOL: parseFloat(claimedFeesSOL.toFixed(9)),
        unclaimedFeesLamports,
        unclaimedFeesSOL: parseFloat(unclaimedFeesSOL.toFixed(9)),
        totalFeesSOL: parseFloat((claimedFeesSOL + unclaimedFeesSOL).toFixed(9)),
      },
      raw: statsData,
      message:
        unclaimedFeesSOL > 0
          ? `${unclaimedFeesSOL.toFixed(4)} SOL available to claim. Use POST /api/bags/claim-fees?type=partner to claim.`
          : 'No unclaimed partner fees at this time.',
    });
  } catch (error: any) {
    console.error('[/api/bags/partner-stats] Error:', error);
    return res.status(500).json({
      error: 'Failed to get partner stats',
      details: error?.message || 'Unknown error',
    });
  }
}
