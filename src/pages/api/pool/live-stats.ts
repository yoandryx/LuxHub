// src/pages/api/pool/live-stats.ts
// Bulk live on-chain stats for pool tokens.
// Sources:
//   - Helius RPC (getTokenSupply) for circulating supply + decimals
//   - Helius DAS (getTokenAccounts) for holder count
//   - DexScreener for price, 24h volume, price change
//
// Usage: GET /api/pool/live-stats?mints=mint1,mint2,mint3
// Returns: { stats: { [mint]: LiveStats } }
//
// Server-side in-memory cache keeps each mint's data for 30s to protect Helius rate limits.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getClusterConfig } from '@/lib/solana/clusterConfig';

interface LiveStats {
  mint: string;
  holderCount: number;
  circulatingSupply: number;
  decimals: number;
  priceUSD: number;
  marketCapUSD: number;
  volume24hUSD: number;
  priceChange24h: number | null;
  graduated: boolean;
  source: 'dexscreener' | 'bags' | 'none';
  lastUpdated: string;
}

interface CacheEntry {
  data: LiveStats;
  expiresAt: number;
}

// In-memory cache — 30s TTL per mint.
// Serverless note: this cache resets on cold start, which is fine.
// Warm instances share it across requests, which is what we want.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function getRpcUrl(): string {
  return getClusterConfig().endpoint;
}

/**
 * Solana RPC: getTokenSupply
 * Returns circulating supply + decimals for an SPL mint.
 */
async function fetchTokenSupply(mint: string): Promise<{ supply: number; decimals: number } | null> {
  try {
    const res = await fetch(getRpcUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-supply',
        method: 'getTokenSupply',
        params: [mint],
      }),
    });
    const json = await res.json();
    const value = json?.result?.value;
    if (!value) return null;
    return {
      supply: Number(value.uiAmount || 0),
      decimals: value.decimals || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Helius DAS: getTokenAccounts
 * Returns holder count by counting accounts with balance > 0.
 * Paginates up to 3 pages (3000 holders max) to keep latency bounded.
 */
async function fetchHolderCount(mint: string): Promise<number> {
  try {
    let holderCount = 0;
    const MAX_PAGES = 3;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(getRpcUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-token-accounts',
          method: 'getTokenAccounts',
          params: { mint, page, limit: 1000 },
        }),
      });
      const json = await res.json();
      const accounts = json?.result?.token_accounts || [];
      const active = accounts.filter((ta: { amount: number }) => ta.amount > 0);
      holderCount += active.length;
      if (accounts.length < 1000) break; // Last page
    }
    return holderCount;
  } catch {
    return 0;
  }
}

/**
 * DexScreener: token pair data
 * Returns price, 24h volume, price change, graduated flag.
 * Graduation is inferred from the presence of a DexScreener pair.
 */
async function fetchDexScreener(mint: string): Promise<{
  priceUSD: number;
  volume24hUSD: number;
  priceChange24h: number | null;
  graduated: boolean;
} | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;
    return {
      priceUSD: parseFloat(pair.priceUsd) || 0,
      volume24hUSD: pair.volume?.h24 || 0,
      priceChange24h: typeof pair.priceChange?.h24 === 'number' ? pair.priceChange.h24 : null,
      graduated: true, // DexScreener pair = graduated from bonding curve
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all on-chain stats for a single mint.
 * Runs all three data sources in parallel for latency.
 */
async function fetchLiveStatsForMint(mint: string): Promise<LiveStats> {
  const [supplyData, holderCount, dexData] = await Promise.all([
    fetchTokenSupply(mint),
    fetchHolderCount(mint),
    fetchDexScreener(mint),
  ]);

  const circulatingSupply = supplyData?.supply || 0;
  const decimals = supplyData?.decimals || 0;
  const priceUSD = dexData?.priceUSD || 0;
  const marketCapUSD = priceUSD * circulatingSupply;

  return {
    mint,
    holderCount,
    circulatingSupply,
    decimals,
    priceUSD,
    marketCapUSD,
    volume24hUSD: dexData?.volume24hUSD || 0,
    priceChange24h: dexData?.priceChange24h ?? null,
    graduated: dexData?.graduated || false,
    source: dexData ? 'dexscreener' : priceUSD > 0 ? 'bags' : 'none',
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get stats from cache or fetch fresh.
 */
async function getStatsForMint(mint: string): Promise<LiveStats> {
  const cached = cache.get(mint);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const data = await fetchLiveStatsForMint(mint);
  cache.set(mint, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mints } = req.query as { mints?: string };
  if (!mints) {
    return res.status(400).json({ error: 'Provide mints query param (comma-separated)' });
  }

  // Parse + dedupe mints
  const mintList = Array.from(
    new Set(
      mints
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    )
  );

  // Cap batch size to prevent abuse
  const MAX_BATCH = 50;
  if (mintList.length > MAX_BATCH) {
    return res.status(400).json({ error: `Max ${MAX_BATCH} mints per request` });
  }

  try {
    // Parallel fetch (cache hits are instant; misses fan out to Helius/DexScreener)
    const results = await Promise.allSettled(mintList.map((mint) => getStatsForMint(mint)));

    const stats: Record<string, LiveStats> = {};
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        stats[mintList[i]] = result.value;
      }
    });

    // Edge cache for 15s (half of cache TTL) — safe since we return fresh-enough data
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

    return res.status(200).json({
      success: true,
      stats,
      count: Object.keys(stats).length,
    });
  } catch (error: unknown) {
    console.error('[/api/pool/live-stats] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch live stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
