// /pages/api/users/sol-price.ts
// Proxy to /api/price/sol for backwards compatibility
// The marketplace, BuyModal, and MakeOfferModal use this endpoint via useSolPrice() hook
import type { NextApiRequest, NextApiResponse } from 'next';

// Import the shared price fetching logic
// Re-use the same Pyth + CoinGecko sources with in-memory cache

const PYTH_SOL_USD_FEED =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

let cachedPrice = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

async function getSolPrice(): Promise<number> {
  if (cachedPrice > 0 && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  // Pyth first
  try {
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD_FEED}`
    );
    if (res.ok) {
      const data = await res.json();
      const pd = data?.parsed?.[0]?.price;
      if (pd) {
        const price = parseFloat(pd.price) * Math.pow(10, pd.expo);
        if (price > 0) {
          cachedPrice = price;
          cachedAt = Date.now();
          return price;
        }
      }
    }
  } catch {}

  // CoinGecko fallback
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
    );
    if (res.ok) {
      const data = await res.json();
      const price = data?.solana?.usd;
      if (price > 0) {
        cachedPrice = price;
        cachedAt = Date.now();
        return price;
      }
    }
  } catch {}

  return cachedPrice || 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const price = await getSolPrice();

  if (price <= 0) {
    return res.status(500).json({ error: 'Failed to fetch SOL price' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');
  return res.status(200).json({ price: parseFloat(price.toFixed(2)) });
}
