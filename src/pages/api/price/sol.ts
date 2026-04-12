// src/pages/api/price/sol.ts
// Server-side SOL/USD price endpoint — thin wrapper around solPriceService.
//
// Response shape: { solana: { usd: number }, source: string, timestamp: number }
// Consumers: PriceDisplay.tsx, offers/create.ts, offers/respond.ts, confirm-mint.ts
//
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSolUsdRate } from '@/lib/services/solPriceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const price = await getSolUsdRate();

  if (price <= 0) {
    return res.status(503).json({ error: 'SOL/USD rate unavailable' });
  }

  // Cache at CDN level too
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');

  return res.status(200).json({
    solana: { usd: parseFloat(price.toFixed(2)) },
    source: 'pyth-or-coingecko',
    timestamp: Date.now(),
  });
}
