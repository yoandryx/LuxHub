// src/pages/api/pool/sell.ts
// Sell pool tokens via Bags bonding curve (burn tokens, receive SOL from reserve)
// Falls back to MongoDB-only accounting for pools without Bags token
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface SellRequest {
  poolId: string;
  sellerWallet: string;
  tokenAmount: number;
  slippageBps?: number; // Slippage tolerance (default 200 = 2%)
  minSolOutput?: number; // Legacy: USD-based minimum (for non-Bags fallback)
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      sellerWallet,
      tokenAmount,
      slippageBps = 200,
      minSolOutput,
    } = req.body as SellRequest;

    // Validation
    if (!poolId || !sellerWallet || !tokenAmount) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, sellerWallet, tokenAmount',
      });
    }

    if (tokenAmount <= 0 || !Number.isFinite(tokenAmount)) {
      return res.status(400).json({ error: 'tokenAmount must be a positive number' });
    }

    await dbConnect();

    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Must be in tradeable status
    const tradeableStatuses = ['open', 'active', 'funded', 'filled', 'graduated'];
    if (!tradeableStatuses.includes(pool.status)) {
      return res.status(400).json({
        error: `Pool is not open for trading. Current status: ${pool.status}`,
      });
    }

    // ── BAGS BONDING CURVE SELL ──
    if (pool.bagsTokenMint && !pool.graduated) {
      const bagsApiKey = process.env.BAGS_API_KEY;
      if (!bagsApiKey) {
        return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
      }

      // Step 1: Get sell quote from Bags trade API (GET with query params)
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const quoteUrl = new URL(`${BAGS_API_BASE}/trade/quote`);
      quoteUrl.searchParams.set('inputMint', pool.bagsTokenMint);
      quoteUrl.searchParams.set('outputMint', SOL_MINT);
      quoteUrl.searchParams.set('amount', String(tokenAmount));
      quoteUrl.searchParams.set('slippageBps', String(slippageBps));

      const quoteRes = await fetch(quoteUrl.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': bagsApiKey,
        },
      });

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Failed to get sell quote from Bags trade API',
          details: errData,
        });
      }

      const quoteResult = await quoteRes.json();
      const quote = quoteResult.response || quoteResult;

      // Step 2: Build swap (sell) transaction via Bags
      const swapRes = await fetch(`${BAGS_API_BASE}/trade/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: sellerWallet,
        }),
      });

      if (!swapRes.ok) {
        const errData = await swapRes.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Failed to build sell transaction from Bags',
          details: errData,
        });
      }

      const swapResult = await swapRes.json();
      const swapData = swapResult.response || swapResult;

      // Pool stats update automatically via Bags webhook (TRADE_EXECUTED event)
      // No MongoDB update needed here — webhook handles it

      console.log(
        `[/api/pool/sell] Bags sell tx built for ${sellerWallet}: ${tokenAmount} tokens, ` +
          `quote output: ${quote.outAmount}, price impact: ${quote.priceImpactPct}`
      );

      return res.status(200).json({
        success: true,
        quote: {
          tokenAmount,
          outputMint: SOL_MINT,
          outputAmount: quote.outAmount,
          minOutputAmount: quote.minOutAmount,
          priceImpact: quote.priceImpactPct,
          slippageBps: quote.slippageBps,
          routePlan: quote.routePlan,
        },
        transaction: swapData.swapTransaction,
        pool: {
          _id: pool._id,
          bagsTokenMint: pool.bagsTokenMint,
          bondingCurveActive: pool.bondingCurveActive,
        },
        message: 'Sell transaction ready for signing. Sign and submit to complete sale.',
      });
    }

    // ── BAGS DEX SELL (graduated pools) ──
    if (pool.bagsTokenMint && pool.graduated) {
      const bagsApiKey = process.env.BAGS_API_KEY;
      if (!bagsApiKey) {
        return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
      }

      // Use DEX trade endpoint for graduated pools
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const quoteRes = await fetch(
        `${BAGS_API_BASE}/trade/quote?inputMint=${pool.bagsTokenMint}&outputMint=${SOL_MINT}&amount=${tokenAmount}&slippageBps=${slippageBps}`,
        { headers: { 'x-api-key': bagsApiKey } }
      );

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Failed to get DEX sell quote',
          details: errData,
        });
      }

      const quoteJson = await quoteRes.json();
      const dexQuote = quoteJson.response || quoteJson;

      const swapRes = await fetch(`${BAGS_API_BASE}/trade/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({
          quoteResponse: dexQuote,
          userPublicKey: sellerWallet,
        }),
      });

      if (!swapRes.ok) {
        const errData = await swapRes.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Failed to build DEX sell transaction',
          details: errData,
        });
      }

      const swapResult = await swapRes.json();
      const dexSwapData = swapResult.response || swapResult;

      return res.status(200).json({
        success: true,
        quote: dexQuote,
        transaction: dexSwapData.swapTransaction,
        graduated: true,
        message: 'DEX sell transaction ready. Sign and submit.',
      });
    }

    // ── FALLBACK: MongoDB-only accounting (no Bags token) ──
    const participantIndex = pool.participants.findIndex((p: any) => p.wallet === sellerWallet);

    if (participantIndex === -1) {
      return res.status(400).json({ error: 'You have no tokens in this pool' });
    }

    const participant = pool.participants[participantIndex];
    if (tokenAmount > (participant.shares || 0)) {
      return res.status(400).json({
        error: `Insufficient tokens. You have ${participant.shares}, tried to sell ${tokenAmount}`,
        available: participant.shares,
      });
    }

    // Calculate output
    const priceUSD = pool.currentBondingPrice || pool.lastPriceUSD || pool.sharePriceUSD;
    const grossUSD = tokenAmount * priceUSD;
    const feeUSD = grossUSD * 0.03;
    const netUSD = grossUSD - feeUSD;

    // Slippage check
    if (minSolOutput !== undefined && minSolOutput > 0 && netUSD < minSolOutput) {
      return res.status(400).json({
        error: 'Slippage protection: output below minimum',
        expectedOutput: netUSD,
        minRequested: minSolOutput,
      });
    }

    // Update participant
    const sellRatio = tokenAmount / participant.shares;
    participant.shares -= tokenAmount;
    participant.investedUSD = Math.max(0, (participant.investedUSD || 0) * (1 - sellRatio));
    participant.ownershipPercent =
      pool.totalShares > 0 ? (participant.shares / pool.totalShares) * 100 : 0;

    if (participant.shares <= 0) {
      pool.participants.splice(participantIndex, 1);
    }

    pool.sharesSold = Math.max(0, pool.sharesSold - tokenAmount);
    pool.totalTrades = (pool.totalTrades || 0) + 1;
    pool.totalVolumeUSD = (pool.totalVolumeUSD || 0) + grossUSD;
    pool.accumulatedTradingFees = (pool.accumulatedTradingFees || 0) + feeUSD;

    if (!pool.recentTrades) pool.recentTrades = [];
    pool.recentTrades.push({
      wallet: sellerWallet,
      type: 'sell',
      amount: tokenAmount,
      amountUSD: grossUSD,
      timestamp: new Date(),
    });
    if (pool.recentTrades.length > 5) {
      pool.recentTrades = pool.recentTrades.slice(-5);
    }

    if (pool.status === 'filled' && pool.sharesSold < pool.totalShares) {
      pool.status = 'open';
    }

    await pool.save();

    console.log(
      `[/api/pool/sell] Fallback sell: ${sellerWallet} sold ${tokenAmount} tokens, $${netUSD.toFixed(2)} net`
    );

    return res.status(200).json({
      success: true,
      sell: {
        tokenAmount,
        grossOutputUSD: grossUSD,
        netOutputUSD: netUSD,
        feeUSD,
        pricePerToken: priceUSD,
      },
      position: pool.participants.find((p: any) => p.wallet === sellerWallet)
        ? { remainingShares: participant.shares, ownershipPercent: participant.ownershipPercent }
        : { remainingShares: 0, ownershipPercent: 0 },
      pool: {
        _id: pool._id,
        status: pool.status,
        sharesSold: pool.sharesSold,
      },
      message: `Sold ${tokenAmount} tokens (fallback mode — no Bags token on this pool)`,
    });
  } catch (error: any) {
    console.error('[/api/pool/sell] Error:', error);
    return res.status(500).json({
      error: 'Failed to process sell',
      details: error?.message || 'Unknown error',
    });
  }
}
