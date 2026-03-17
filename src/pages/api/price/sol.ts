// src/pages/api/price/sol.ts
// Server-side SOL/USD price endpoint — no CORS issues, cached, reliable
//
// Sources (tried in order):
//   1. Pyth Network (Solana-native oracle, free, no auth)
//   2. CoinGecko (free tier, no auth server-side)
//
import type { NextApiRequest, NextApiResponse } from 'next';

// Pyth SOL/USD price feed ID
const PYTH_SOL_USD_FEED =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

// In-memory cache — avoids hammering price APIs
let cachedPrice = 0;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000; // 15 seconds

async function fetchFromPyth(): Promise<number> {
  const res = await fetch(
    `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_SOL_USD_FEED}`
  );
  if (!res.ok) return 0;
  const data = await res.json();
  const priceData = data?.parsed?.[0]?.price;
  if (!priceData) return 0;
  return parseFloat(priceData.price) * Math.pow(10, priceData.expo);
}

async function fetchFromCoinGecko(): Promise<number> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data?.solana?.usd || 0;
}

async function getSolPrice(): Promise<number> {
  // Return cache if fresh
  if (cachedPrice > 0 && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }

  // Try Pyth first (Solana-native oracle, fastest)
  let price = await fetchFromPyth().catch(() => 0);

  // Fallback to CoinGecko
  if (!price || price <= 0) {
    price = await fetchFromCoinGecko().catch(() => 0);
  }

  if (price > 0) {
    cachedPrice = price;
    cachedAt = Date.now();
  }

  return price || cachedPrice || 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const price = await getSolPrice();

  // Cache at CDN level too
  res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=30');

  return res.status(200).json({
    solana: { usd: parseFloat(price.toFixed(2)) },
    source: cachedAt > Date.now() - 1000 ? 'fresh' : 'cached',
    timestamp: Date.now(),
  });
}
