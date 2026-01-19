// src/pages/api/bags/execute-trade.ts
// Execute a pool share swap via Bags Trade API
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

interface ExecuteTradeRequest {
  poolId?: string;
  inputMint?: string;
  outputMint?: string;
  amount: string;
  userWallet: string; // Wallet executing the trade
  slippageBps?: string;
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// Common mints
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      inputMint,
      outputMint,
      amount,
      userWallet,
      slippageBps = '100',
    } = req.body as ExecuteTradeRequest;

    // Validation
    if (!amount || !userWallet) {
      return res.status(400).json({
        error: 'Missing required fields: amount, userWallet',
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
    let poolInfo = null;

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

      poolInfo = {
        _id: pool._id,
        bagsTokenMint: pool.bagsTokenMint,
        sharePriceUSD: pool.sharePriceUSD,
      };

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

    // Step 1: Get fresh quote
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
        error: 'Failed to get trade quote',
        details: errorData,
      });
    }

    const quoteResult = await quoteResponse.json();

    // Step 2: Build swap transaction
    const swapResponse = await fetch(`${BAGS_API_BASE}/trade/swap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        quote: quoteResult,
        userPublicKey: userWallet,
        wrapAndUnwrapSol: true, // Auto-handle SOL wrapping
        computeUnitPriceMicroLamports: 'auto', // Auto-set compute price
      }),
    });

    if (!swapResponse.ok) {
      const errorData = await swapResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to build swap transaction',
        details: errorData,
      });
    }

    const swapResult = await swapResponse.json();

    return res.status(200).json({
      success: true,
      trade: {
        inputMint: finalInputMint,
        outputMint: finalOutputMint,
        inputAmount: amount,
        expectedOutput: quoteResult.outAmount || quoteResult.expectedOutput,
        priceImpact: quoteResult.priceImpact,
        slippageBps,
      },
      pool: poolInfo,
      transaction: {
        // The serialized transaction for the user to sign
        serialized: swapResult.swapTransaction || swapResult.transaction,
        // Versioned transaction if applicable
        isVersioned: swapResult.isVersionedTransaction,
        // Last valid block height for the transaction
        lastValidBlockHeight: swapResult.lastValidBlockHeight,
      },
      message: 'Swap transaction built successfully. Sign and send to execute.',
      instructions: [
        'Deserialize the transaction using @solana/web3.js',
        'Sign with user wallet',
        'Send to network using sendRawTransaction',
        'Wait for confirmation',
      ],
    });
  } catch (error: any) {
    console.error('[/api/bags/execute-trade] Error:', error);
    return res.status(500).json({
      error: 'Failed to execute trade',
      details: error?.message || 'Unknown error',
    });
  }
}
