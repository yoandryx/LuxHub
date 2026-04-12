// /pages/api/users/sol-price.ts
// Proxy to /api/price/sol for backwards compatibility
// The marketplace, BuyModal, and MakeOfferModal use this endpoint via useSolPrice() hook
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSolUsdRate } from '@/lib/services/solPriceService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const price = await getSolUsdRate();

  if (price <= 0) {
    return res.status(500).json({ error: 'Failed to fetch SOL price' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
  return res.status(200).json({ price: parseFloat(price.toFixed(2)) });
}
