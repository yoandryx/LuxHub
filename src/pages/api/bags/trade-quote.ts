// src/pages/api/bags/trade-quote.ts
// Get quote for trading pool shares via Bags Trade API
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface TradeQuoteQuery {
  poolId?: string;
  inputMint?: string; // Pool token mint or USDC/SOL
  outputMint?: string; // USDC/SOL or pool token mint
  amount: string; // Amount to trade
  slippageBps?: string; // Slippage tolerance in basis points
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// Common mints
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      inputMint,
      outputMint,
      amount,
      slippageBps = '100', // Default 1% slippage
    } = req.query as unknown as TradeQuoteQuery;

    // Validation
    if (!amount) {
      return res.status(400).json({
        error: 'Missing required field: amount',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({
        error: 'BAGS_API_KEY not configured',
      });
    }

    let finalInputMint = inputMint;
    let finalOutputMint = outputMint;

    // If poolId provided, look up the pool token mint
    if (poolId) {
      await dbConnect();
      const pool = await Pool.findById(poolId);
      if (!pool || pool.deleted) {
        return res.status(404).json({ error: 'Pool not found' });
      }
      if (!pool.bagsTokenMint) {
        return res.status(400).json({
          error: 'Pool does not have a Bags token mint',
        });
      }

      // Default: if only poolId provided, assume selling pool tokens for USDC
      if (!inputMint && !outputMint) {
        finalInputMint = pool.bagsTokenMint;
        finalOutputMint = USDC_MINT;
      } else if (!inputMint) {
        finalInputMint = pool.bagsTokenMint;
      } else if (!outputMint) {
        finalOutputMint = pool.bagsTokenMint;
      }
    }

    if (!finalInputMint || !finalOutputMint) {
      return res.status(400).json({
        error: 'Must provide inputMint and outputMint, or poolId',
      });
    }

    // Get quote from Bags API
    const quoteUrl = new URL(`${BAGS_API_BASE}/trade/quote`);
    quoteUrl.searchParams.set('inputMint', finalInputMint);
    quoteUrl.searchParams.set('outputMint', finalOutputMint);
    quoteUrl.searchParams.set('amount', amount);
    quoteUrl.searchParams.set('slippageBps', slippageBps);

    const quoteResponse = await fetch(quoteUrl.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': bagsApiKey,
      },
    });

    if (!quoteResponse.ok) {
      const errorData = await quoteResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to get trade quote from Bags API',
        details: errorData,
      });
    }

    const quoteResult = await quoteResponse.json();

    // Calculate effective price and fees
    const inputAmount = parseFloat(amount);
    const outputAmount = parseFloat(quoteResult.outAmount || quoteResult.expectedOutput || '0');
    const effectivePrice = inputAmount > 0 ? outputAmount / inputAmount : 0;
    const platformFee = quoteResult.platformFee || 0;
    const priceImpact = quoteResult.priceImpact || quoteResult.priceImpactPct || 0;

    return res.status(200).json({
      success: true,
      quote: {
        inputMint: finalInputMint,
        outputMint: finalOutputMint,
        inputAmount: amount,
        outputAmount: quoteResult.outAmount || quoteResult.expectedOutput,
        effectivePrice,
        priceImpact: `${priceImpact}%`,
        platformFee,
        slippageBps,
        route: quoteResult.route || quoteResult.routePlan,
        expiresAt: quoteResult.expiresAt,
      },
      raw: quoteResult,
      message: 'Trade quote retrieved successfully',
      note: 'Use /api/bags/execute-trade to execute this swap',
    });
  } catch (error: any) {
    console.error('[/api/bags/trade-quote] Error:', error);
    return res.status(500).json({
      error: 'Failed to get trade quote',
      details: error?.message || 'Unknown error',
    });
  }
}
