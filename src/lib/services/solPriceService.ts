// src/lib/services/solPriceService.ts
// Server-side SOL/USD price service with Pyth Hermes primary + CoinGecko fallback.
// Extracted from src/pages/api/price/sol.ts for reuse in graduation math,
// bridge calculations, and other server-side code without HTTP roundtrips.

// Pyth SOL/USD price feed ID (Hermes mainnet)
const PYTH_SOL_USD_FEED =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';

// In-memory cache — avoids hammering price APIs.
// Per-server-instance on Vercel (cold starts get fresh cache).
const CACHE_TTL_MS = 15_000; // 15 seconds
let cache: { rate: number; fetchedAt: number } | null = null;

/**
 * Fetch SOL/USD from Pyth Hermes (Solana-native oracle).
 * Returns 0 on any parse failure so the caller can fall through to CoinGecko.
 */
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

/**
 * Fetch SOL/USD from CoinGecko free API (no auth required server-side).
 */
async function fetchFromCoinGecko(): Promise<number> {
  const res = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data?.solana?.usd || 0;
}

/**
 * Returns current SOL/USD rate from Pyth Hermes (primary) with CoinGecko fallback.
 * In-memory 15s cache. Returns last known price if both sources fail but cache exists.
 * Returns 0 only if no price has ever been fetched.
 */
export async function getSolUsdRate(): Promise<number> {
  // Return cache if fresh
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rate;
  }

  // Try Pyth first (Solana-native oracle, fastest)
  let price = await fetchFromPyth().catch(() => 0);

  // Fallback to CoinGecko
  if (!price || price <= 0) {
    price = await fetchFromCoinGecko().catch(() => 0);
  }

  if (price > 0) {
    cache = { rate: price, fetchedAt: Date.now() };
  }

  return price || cache?.rate || 0;
}

/**
 * Convert USD to SOL lamports (9 decimals).
 * Example: usdToLamports(100) with rate=200 returns 500_000_000 (0.5 SOL).
 */
export async function usdToLamports(usd: number): Promise<number> {
  const rate = await getSolUsdRate();
  if (rate <= 0) throw new Error('SOL/USD rate unavailable');
  return Math.round((usd / rate) * 1_000_000_000);
}

/**
 * Convert SOL lamports to USD.
 * Example: lamportsToUsd(1_000_000_000) with rate=200 returns 200.
 */
export async function lamportsToUsd(lamports: number): Promise<number> {
  const rate = await getSolUsdRate();
  return (lamports / 1_000_000_000) * rate;
}

/**
 * Convert USD to USDC base units (6 decimals). Pure math, no oracle call.
 * Example: usdToUsdcUnits(100) returns 100_000_000.
 */
export function usdToUsdcUnits(usd: number): number {
  return Math.round(usd * 1_000_000);
}

/**
 * Convert USDC base units to USD.
 * Example: usdcUnitsToUsd(100_000_000) returns 100.
 */
export function usdcUnitsToUsd(units: number): number {
  return units / 1_000_000;
}

/**
 * For tests only -- reset the in-memory cache.
 */
export function __resetCacheForTesting(): void {
  cache = null;
}
