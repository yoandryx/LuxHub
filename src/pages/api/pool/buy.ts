// src/pages/api/pool/buy.ts
// Buy tokens via bonding curve (dynamic minting)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface BuyRequest {
  poolId: string;
  buyerWallet: string;
  inputMint: string; // SOL or USDC mint
  inputAmount: string; // Amount in lamports or base units
  slippageBps?: number; // Slippage tolerance (default 100 = 1%)
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      buyerWallet,
      inputMint,
      inputAmount,
      slippageBps = 100,
    } = req.body as BuyRequest;

    // Validation
    if (!poolId || !buyerWallet || !inputMint || !inputAmount) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, buyerWallet, inputMint, inputAmount',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({
        error: 'BAGS_API_KEY not configured',
      });
    }

    await dbConnect();

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if pool has a token
    if (!pool.bagsTokenMint) {
      return res.status(400).json({
        error: 'Pool does not have a token yet. Token must be created first.',
      });
    }

    // Check if bonding curve is active (not graduated yet)
    if (pool.graduated) {
      return res.status(400).json({
        error: 'Pool has graduated from bonding curve. Use DEX to trade.',
        graduated: true,
        graduatedAt: pool.graduatedAt,
      });
    }

    // Step 1: Get quote from Bags bonding curve
    const quoteResponse = await fetch(`${BAGS_API_BASE}/bonding-curve/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        tokenMint: pool.bagsTokenMint,
        inputMint,
        inputAmount,
        tradeType: 'buy',
        slippageBps,
      }),
    });

    if (!quoteResponse.ok) {
      const errorData = await quoteResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to get quote from Bags bonding curve',
        details: errorData,
      });
    }

    const quote = await quoteResponse.json();

    // Step 2: Build swap transaction
    const swapResponse = await fetch(`${BAGS_API_BASE}/bonding-curve/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        tokenMint: pool.bagsTokenMint,
        buyer: buyerWallet,
        inputMint,
        inputAmount,
        minOutputAmount: quote.minOutputAmount,
        slippageBps,
      }),
    });

    if (!swapResponse.ok) {
      const errorData = await swapResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to build swap transaction from Bags',
        details: errorData,
      });
    }

    const swapResult = await swapResponse.json();

    return res.status(200).json({
      success: true,
      quote: {
        inputMint,
        inputAmount,
        outputMint: pool.bagsTokenMint,
        outputAmount: quote.outputAmount,
        minOutputAmount: quote.minOutputAmount,
        pricePerToken: quote.pricePerToken,
        priceImpact: quote.priceImpact,
        newPrice: quote.newPrice,
        fees: {
          creatorFee: quote.creatorFee,
          holderDividend: quote.holderDividend,
          platformFee: quote.platformFee,
        },
      },
      transaction: swapResult.transaction,
      pool: {
        _id: pool._id,
        bagsTokenMint: pool.bagsTokenMint,
        currentBondingPrice: pool.currentBondingPrice,
        bondingCurveActive: pool.bondingCurveActive,
        bondingCurveType: pool.bondingCurveType,
        targetMarketCap: pool.targetAmountUSD,
        currentMarketCap: pool.lastMarketCap,
      },
      message: 'Swap transaction ready for signing. Sign and submit to complete purchase.',
      instructions: [
        'Transaction must be signed by the buyer wallet',
        'Submit to Solana network after signing',
        'Pool stats update automatically via webhook',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/buy] Error:', error);
    return res.status(500).json({
      error: 'Failed to create buy transaction',
      details: error?.message || 'Unknown error',
    });
  }
}
