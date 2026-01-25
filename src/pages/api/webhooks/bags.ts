// src/pages/api/webhooks/bags.ts
// Webhook handler for Bags API events (pool trades, partner fees, etc.)
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { Transaction } from '@/lib/models/Transaction';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { webhookLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring, errorMonitor } from '@/lib/monitoring/errorHandler';

// Bags API event types
type BagsEventType =
  | 'TRADE_EXECUTED'
  | 'POOL_CREATED'
  | 'POOL_UPDATED'
  | 'PARTNER_FEE_EARNED'
  | 'PARTNER_FEE_CLAIMED'
  | 'LIQUIDITY_ADDED'
  | 'LIQUIDITY_REMOVED'
  | 'TOKEN_GRADUATED';

interface BagsTradeEvent {
  type: 'TRADE_EXECUTED';
  timestamp: number;
  signature: string;
  tokenMint: string;
  tradeType: 'buy' | 'sell';
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceUSD?: number;
  traderWallet: string;
  partnerWallet?: string;
  partnerFee?: string;
}

interface BagsPoolEvent {
  type: 'POOL_CREATED' | 'POOL_UPDATED' | 'TOKEN_GRADUATED';
  timestamp: number;
  tokenMint: string;
  poolAddress?: string;
  name?: string;
  symbol?: string;
  totalSupply?: string;
  marketCap?: number;
  priceUSD?: number;
  graduatedAt?: number;
}

interface BagsPartnerFeeEvent {
  type: 'PARTNER_FEE_EARNED' | 'PARTNER_FEE_CLAIMED';
  timestamp: number;
  signature?: string;
  partnerWallet: string;
  amount: string;
  tokenMint: string;
  claimedAt?: number;
}

interface BagsLiquidityEvent {
  type: 'LIQUIDITY_ADDED' | 'LIQUIDITY_REMOVED';
  timestamp: number;
  signature: string;
  tokenMint: string;
  poolAddress: string;
  amount: string;
  providerWallet: string;
}

type BagsEvent = BagsTradeEvent | BagsPoolEvent | BagsPartnerFeeEvent | BagsLiquidityEvent;

/**
 * Verify the Bags webhook signature
 */
function verifyBagsSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    console.error('Bags signature verification error:', error);
    return false;
  }
}

/**
 * Handle trade execution events
 */
async function handleTradeExecuted(event: BagsTradeEvent): Promise<void> {
  const {
    tokenMint,
    signature,
    tradeType,
    inputAmount,
    outputAmount,
    priceUSD,
    traderWallet,
    partnerFee,
  } = event;

  try {
    // Find the pool by token mint
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    if (pool) {
      // Update pool stats
      const tradeAmountUSD = priceUSD ? parseFloat(outputAmount) * priceUSD : 0;

      await Pool.findByIdAndUpdate(pool._id, {
        $inc: {
          totalTrades: 1,
          totalVolumeUSD: tradeAmountUSD,
        },
        $set: {
          lastTradeAt: new Date(event.timestamp * 1000),
          lastPriceUSD: priceUSD,
        },
      });

      // Record transaction
      await Transaction.create({
        type: tradeType === 'buy' ? 'investment' : 'pool_distribution',
        pool: pool._id,
        fromWallet: traderWallet,
        amountUSD: tradeAmountUSD,
        txSignature: signature,
        status: 'success',
      });

      console.log(
        `[bags-webhook] Trade recorded: ${tradeType} ${outputAmount} tokens at $${priceUSD}, pool: ${pool._id}`
      );
    }

    // Track partner fee if earned
    if (partnerFee && parseFloat(partnerFee) > 0) {
      await TreasuryDeposit.create({
        txSignature: `${signature}-partner-fee`,
        blockTime: new Date(event.timestamp * 1000),
        amountLamports: parseInt(partnerFee),
        amountSOL: parseInt(partnerFee) / 1e9,
        fromWallet: traderWallet,
        toWallet: process.env.BAGS_PARTNER_WALLET || process.env.NEXT_PUBLIC_LUXHUB_WALLET,
        depositType: 'pool_royalty',
        pool: pool?._id,
        heliusEventType: 'BAGS_TRADE',
        description: `Partner fee from ${tradeType} trade`,
      });
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'TRADE_EXECUTED', tokenMint, signature },
    });
  }
}

/**
 * Handle pool creation events
 */
async function handlePoolCreated(event: BagsPoolEvent): Promise<void> {
  const { tokenMint, poolAddress, name, symbol, totalSupply, marketCap, priceUSD } = event;

  try {
    // Find existing pool by token mint
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    if (pool) {
      // Update pool with Bags data
      await Pool.findByIdAndUpdate(pool._id, {
        $set: {
          bagsPoolAddress: poolAddress,
          bagsPoolCreatedAt: new Date(event.timestamp * 1000),
          bagsTokenName: name,
          bagsTokenSymbol: symbol,
          bagsTotalSupply: totalSupply,
          lastMarketCap: marketCap,
          lastPriceUSD: priceUSD,
        },
      });

      console.log(`[bags-webhook] Pool created on Bags: ${tokenMint}, pool: ${pool._id}`);
    } else {
      console.log(`[bags-webhook] Pool created for unknown token: ${tokenMint}`);
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'POOL_CREATED', tokenMint },
    });
  }
}

/**
 * Handle pool update events (price changes, market cap updates)
 */
async function handlePoolUpdated(event: BagsPoolEvent): Promise<void> {
  const { tokenMint, marketCap, priceUSD } = event;

  try {
    const result = await Pool.findOneAndUpdate(
      { bagsTokenMint: tokenMint },
      {
        $set: {
          lastMarketCap: marketCap,
          lastPriceUSD: priceUSD,
          lastUpdatedAt: new Date(event.timestamp * 1000),
        },
      },
      { new: true }
    );

    if (result) {
      console.log(`[bags-webhook] Pool updated: ${tokenMint}, price: $${priceUSD}`);
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'POOL_UPDATED', tokenMint },
    });
  }
}

/**
 * Handle token graduation events (bonding curve completed)
 */
async function handleTokenGraduated(event: BagsPoolEvent): Promise<void> {
  const { tokenMint, graduatedAt, marketCap, priceUSD } = event;

  try {
    const result = await Pool.findOneAndUpdate(
      { bagsTokenMint: tokenMint },
      {
        $set: {
          graduated: true,
          graduatedAt: graduatedAt
            ? new Date(graduatedAt * 1000)
            : new Date(event.timestamp * 1000),
          graduationMarketCap: marketCap,
          graduationPriceUSD: priceUSD,
          status: 'graduated',
        },
      },
      { new: true }
    );

    if (result) {
      console.log(`[bags-webhook] Token graduated: ${tokenMint}, market cap: $${marketCap}`);
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'TOKEN_GRADUATED', tokenMint },
    });
  }
}

/**
 * Handle partner fee earned events
 */
async function handlePartnerFeeEarned(event: BagsPartnerFeeEvent): Promise<void> {
  const { partnerWallet, amount, tokenMint, signature } = event;

  try {
    // Find pool by token mint
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    // Create treasury deposit record
    await TreasuryDeposit.create({
      txSignature: signature || `bags-fee-${event.timestamp}`,
      blockTime: new Date(event.timestamp * 1000),
      amountLamports: parseInt(amount),
      amountSOL: parseInt(amount) / 1e9,
      fromWallet: 'bags-protocol',
      toWallet: partnerWallet,
      depositType: 'pool_royalty',
      pool: pool?._id,
      heliusEventType: 'BAGS_PARTNER_FEE',
      description: `Partner fee earned from pool trading`,
    });

    console.log(`[bags-webhook] Partner fee earned: ${parseInt(amount) / 1e9} SOL`);
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'PARTNER_FEE_EARNED', partnerWallet, amount },
    });
  }
}

/**
 * Handle partner fee claimed events
 */
async function handlePartnerFeeClaimed(event: BagsPartnerFeeEvent): Promise<void> {
  const { partnerWallet, amount, signature, claimedAt } = event;

  try {
    // Update the treasury deposit record as claimed
    if (signature) {
      await TreasuryDeposit.findOneAndUpdate(
        { txSignature: signature },
        {
          $set: {
            verified: true,
            verifiedAt: claimedAt ? new Date(claimedAt * 1000) : new Date(),
            description: 'Partner fee claimed',
          },
        }
      );
    }

    console.log(
      `[bags-webhook] Partner fee claimed: ${parseInt(amount) / 1e9} SOL by ${partnerWallet}`
    );
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'PARTNER_FEE_CLAIMED', partnerWallet },
    });
  }
}

/**
 * Handle liquidity events
 */
async function handleLiquidityEvent(event: BagsLiquidityEvent): Promise<void> {
  const { type, tokenMint, amount, providerWallet, signature } = event;

  try {
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    if (pool) {
      const isAdd = type === 'LIQUIDITY_ADDED';

      await Pool.findByIdAndUpdate(pool._id, {
        $inc: {
          totalLiquidityEvents: 1,
        },
        $set: {
          lastLiquidityEventAt: new Date(event.timestamp * 1000),
        },
      });

      // Record transaction
      await Transaction.create({
        type: isAdd ? 'investment' : 'pool_distribution',
        pool: pool._id,
        fromWallet: providerWallet,
        amountUSD: parseFloat(amount),
        txSignature: signature,
        status: 'success',
      });

      console.log(
        `[bags-webhook] Liquidity ${isAdd ? 'added' : 'removed'}: ${amount} for pool ${pool._id}`
      );
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: type, tokenMint },
    });
  }
}

/**
 * Main webhook handler
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify webhook signature
  const secret = process.env.BAGS_WEBHOOK_SECRET;
  const signature = req.headers['x-bags-signature'] as string | undefined;

  // In development, allow requests without signature verification
  if (process.env.NODE_ENV === 'production' && secret) {
    const payload = JSON.stringify(req.body);
    if (!verifyBagsSignature(payload, signature, secret)) {
      console.warn('[bags-webhook] Invalid signature received');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
  }

  try {
    await dbConnect();

    const events: BagsEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    console.log(`[bags-webhook] Received ${events.length} event(s)`);

    // Process events in parallel with error handling
    const results = await Promise.allSettled(
      events.map(async (event) => {
        switch (event.type) {
          case 'TRADE_EXECUTED':
            await handleTradeExecuted(event as BagsTradeEvent);
            break;
          case 'POOL_CREATED':
            await handlePoolCreated(event as BagsPoolEvent);
            break;
          case 'POOL_UPDATED':
            await handlePoolUpdated(event as BagsPoolEvent);
            break;
          case 'TOKEN_GRADUATED':
            await handleTokenGraduated(event as BagsPoolEvent);
            break;
          case 'PARTNER_FEE_EARNED':
            await handlePartnerFeeEarned(event as BagsPartnerFeeEvent);
            break;
          case 'PARTNER_FEE_CLAIMED':
            await handlePartnerFeeClaimed(event as BagsPartnerFeeEvent);
            break;
          case 'LIQUIDITY_ADDED':
          case 'LIQUIDITY_REMOVED':
            await handleLiquidityEvent(event as BagsLiquidityEvent);
            break;
          default:
            console.log(`[bags-webhook] Unhandled event type: ${(event as BagsEvent).type}`);
        }
      })
    );

    // Count successes and failures
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`[bags-webhook] ${failed}/${events.length} events failed to process`);
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[bags-webhook] Event ${i} failed:`, r.reason);
        }
      });
    }

    return res.status(200).json({
      success: true,
      processed: succeeded,
      failed: failed,
      total: events.length,
    });
  } catch (error: unknown) {
    console.error('[bags-webhook] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}

// Apply rate limiting and error monitoring
export default webhookLimiter(withErrorMonitoring(handler));
