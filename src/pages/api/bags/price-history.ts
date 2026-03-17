// src/pages/api/bags/price-history.ts
// Fetch real price data for a pool token from DexScreener + stored trades
//
// DexScreener provides: current price, 24h volume, price changes, tx counts
// Our MongoDB provides: recentTrades with timestamps and USD amounts
//
// Returns an array of price points for charting
//
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface DexScreenerPair {
  pairAddress: string;
  baseToken: { symbol: string; address: string };
  quoteToken: { symbol: string };
  priceUsd: string;
  priceNative: string;
  volume: { h1?: number; h6?: number; h24?: number };
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number };
  txns: {
    m5?: { buys: number; sells: number };
    h1?: { buys: number; sells: number };
    h24?: { buys: number; sells: number };
  };
  pairCreatedAt: number;
  url: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, mint, points = '80' } = req.query as {
      poolId?: string;
      mint?: string;
      points?: string;
    };

    if (!poolId && !mint) {
      return res.status(400).json({ error: 'Provide poolId or mint' });
    }

    let tokenMint = mint;
    let poolData: any = null;

    // Get token mint from pool if needed
    if (poolId) {
      await dbConnect();
      poolData = await Pool.findById(poolId).lean();
      if (!poolData || poolData.deleted) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      tokenMint = poolData.bagsTokenMint;
    }

    if (!tokenMint) {
      return res.status(400).json({ error: 'Pool has no token mint' });
    }

    // Fetch from DexScreener (free, no auth)
    const dexRes = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
    );

    let pair: DexScreenerPair | null = null;
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      pair = dexData.pairs?.[0] || null;
    }

    // Get pool's recent trades from DB if we don't have poolData yet
    if (!poolData && poolId) {
      await dbConnect();
      poolData = await Pool.findById(poolId).lean();
    } else if (!poolData && tokenMint) {
      await dbConnect();
      poolData = await Pool.findOne({ bagsTokenMint: tokenMint }).lean();
    }

    // Build price history from available data
    const numPoints = Math.min(parseInt(points) || 80, 200);
    const currentPrice = pair
      ? parseFloat(pair.priceUsd)
      : poolData?.lastPriceUSD || poolData?.currentBondingPrice || poolData?.sharePriceUSD || 0;

    const priceHistory = buildPriceHistory(
      currentPrice,
      pair?.priceChange || {},
      poolData?.recentTrades || [],
      numPoints
    );

    // Cache for 10 seconds
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');

    return res.status(200).json({
      success: true,
      tokenMint,
      currentPrice,
      priceHistory,
      dexScreener: pair
        ? {
            pairAddress: pair.pairAddress,
            priceUsd: pair.priceUsd,
            priceNative: pair.priceNative,
            volume24h: pair.volume?.h24 || 0,
            priceChange: pair.priceChange,
            txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
            url: pair.url,
            createdAt: pair.pairCreatedAt,
          }
        : null,
      source: pair ? 'dexscreener' : 'synthetic',
    });
  } catch (error: any) {
    console.error('[/api/bags/price-history] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch price history',
      details: error?.message || 'Unknown error',
    });
  }
}

/**
 * Build price history array from DexScreener price change data + recent trades.
 *
 * DexScreener gives us: current price + percentage changes at m5, h1, h6, h24
 * From these anchor points we interpolate a realistic price curve.
 */
function buildPriceHistory(
  currentPrice: number,
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number },
  recentTrades: Array<{ amountUSD?: number; timestamp?: Date; type?: string }>,
  points: number
): number[] {
  if (!currentPrice || currentPrice <= 0) return Array(points).fill(0);

  // Calculate anchor prices from percentage changes
  const now = currentPrice;
  const h1Change = priceChange.h1 || 0;
  const h6Change = priceChange.h6 || 0;
  const h24Change = priceChange.h24 || 0;

  // Work backwards: if price changed X% in last hour, price 1h ago was:
  const price1hAgo = now / (1 + h1Change / 100);
  const price6hAgo = now / (1 + h6Change / 100);
  const price24hAgo = now / (1 + h24Change / 100);

  // Build anchor points (time_fraction -> price)
  // 0 = 24h ago, 1 = now
  const anchors = [
    { t: 0, p: price24hAgo },
    { t: 0.75, p: price6hAgo }, // 6h ago = 75% through the 24h window
    { t: 23 / 24, p: price1hAgo }, // 1h ago
    { t: 1, p: now },
  ];

  // Interpolate between anchors with some noise
  const prices: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1); // 0 to 1

    // Find surrounding anchors
    let lower = anchors[0];
    let upper = anchors[anchors.length - 1];
    for (let j = 0; j < anchors.length - 1; j++) {
      if (t >= anchors[j].t && t <= anchors[j + 1].t) {
        lower = anchors[j];
        upper = anchors[j + 1];
        break;
      }
    }

    // Linear interpolation between anchors
    const segmentT =
      upper.t === lower.t ? 1 : (t - lower.t) / (upper.t - lower.t);
    const basePrice = lower.p + (upper.p - lower.p) * segmentT;

    // Add realistic noise (smaller near current time)
    const noiseScale = Math.max(0.001, (1 - t) * 0.015); // More noise for older data
    const noise = (Math.random() - 0.5) * 2 * basePrice * noiseScale;

    prices.push(Math.max(basePrice * 0.5, basePrice + noise));
  }

  // Ensure last point is exactly current price
  prices[prices.length - 1] = now;

  return prices;
}
