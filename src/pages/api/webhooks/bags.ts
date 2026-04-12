// src/pages/api/webhooks/bags.ts
// Webhook handler for Bags API events (pool trades, partner fees, etc.)
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { Transaction } from '@/lib/models/Transaction';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { TreasuryVesting } from '@/lib/models/TreasuryVesting';
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
  | 'TOKEN_GRADUATED'
  | 'HOLDER_DIVIDEND_DISTRIBUTED'
  | 'CREATOR_FEE_VESTED';

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

interface BagsHolderDividendEvent {
  type: 'HOLDER_DIVIDEND_DISTRIBUTED';
  timestamp: number;
  signature: string;
  tokenMint: string;
  totalAmount: string;
  recipients: number;
  amountPerHolder?: string;
}

interface BagsCreatorFeeVestedEvent {
  type: 'CREATOR_FEE_VESTED';
  timestamp: number;
  tokenMint: string;
  creatorWallet: string;
  vestingTokens: string;
  vestingStartAt: number;
  vestingEndAt?: number;
  vestingType: 'linear' | 'cliff' | 'continuous';
}

type BagsEvent =
  | BagsTradeEvent
  | BagsPoolEvent
  | BagsPartnerFeeEvent
  | BagsLiquidityEvent
  | BagsHolderDividendEvent
  | BagsCreatorFeeVestedEvent;

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
 * Handle trade execution events.
 *
 * Phase 11: this handler is the TERTIARY fee counter. It only increments
 * Pool.accumulatedFeesLamportsPending (the live UI estimate) and updates
 * trade statistics. It MUST NOT write to Pool.accumulatedFeesLamports —
 * that authoritative counter is owned exclusively by
 * poolFeeClaimService.claimPoolFees.
 *
 * The creator fee is derived from the Bags partnerFee field (lamports) if
 * present, otherwise estimated as 1% of trade volume in lamports for UI
 * feedback (the primary claim cron will reconcile the real amount later).
 */
async function handleTradeExecuted(event: BagsTradeEvent): Promise<void> {
  const {
    tokenMint,
    signature,
    tradeType,
    outputAmount,
    priceUSD,
    traderWallet,
    partnerFee,
  } = event;

  try {
    // Find the pool by token mint
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    if (!pool) {
      return; // Unknown token — no-op
    }

    const tradeAmountUSD = priceUSD ? parseFloat(outputAmount) * priceUSD : 0;
    const volumeUsd = Number.isFinite(tradeAmountUSD) ? tradeAmountUSD : 0;

    // Derive the creator fee in lamports. Prefer the exact partnerFee from the
    // Bags event payload if present (lamports). Fall back to 1% of the USD
    // volume converted to lamports via a coarse $150/SOL assumption — this is
    // the live-UI "pending" estimate only; the claim cron writes the
    // authoritative value.
    let tradeFeeLamports = 0;
    if (partnerFee && !Number.isNaN(parseInt(partnerFee))) {
      tradeFeeLamports = parseInt(partnerFee);
    } else if (volumeUsd > 0) {
      const estCreatorFeeUsd = volumeUsd * 0.01;
      const approxSolPrice = 150;
      tradeFeeLamports = Math.floor((estCreatorFeeUsd / approxSolPrice) * 1e9);
    }

    const tradeEntry = {
      wallet: traderWallet.slice(0, 4) + '...' + traderWallet.slice(-4),
      type: tradeType,
      amount: parseFloat(outputAmount),
      amountUSD: volumeUsd,
      timestamp: new Date(event.timestamp * 1000),
      txSignature: signature,
    };

    // Single atomic update: pending counter + trade stats.
    // DO NOT write to accumulatedFeesLamports (authoritative counter).
    // DO NOT call graduation logic here — graduation is fee-driven via
    // claim-pool-fees cron + /api/pool/graduate.
    await Pool.findByIdAndUpdate(pool._id, {
      $inc: {
        accumulatedFeesLamportsPending: tradeFeeLamports,
        totalTrades: 1,
        totalVolumeUSD: volumeUsd,
      },
      $set: {
        lastTradeAt: new Date(event.timestamp * 1000),
        lastPriceUSD: priceUSD || pool.lastPriceUSD,
      },
      $push: {
        recentTrades: {
          $each: [tradeEntry],
          $slice: -20, // Keep last 20 trades for the live feed
        },
      },
    });

    // Record transaction for analytics (unchanged — legacy Transaction feed)
    await Transaction.create({
      type: tradeType === 'buy' ? 'contribution' : 'pool_distribution',
      pool: pool._id,
      fromWallet: traderWallet,
      amountUSD: volumeUsd,
      txSignature: signature,
      status: 'success',
    });
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
    } else {
      // Pool created for unknown token
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
      // Pool updated successfully
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'POOL_UPDATED', tokenMint },
    });
  }
}

/**
 * Handle token graduation events (Bags DBC bonding curve completed).
 *
 * Phase 11: Bags DBC graduation is INFORMATIONAL-ONLY. LuxHub graduation is
 * fee-driven via poolFeeClaimService + /api/pool/graduate, and the pool
 * lifecycle is gated on accumulated trading fees (not Bags DBC state). This
 * handler is a no-op: it logs the observation so the dual progress bar in
 * Feature 3 can reflect Bags state, but it does NOT change Pool state,
 * does NOT create a Squad DAO, and does NOT flip bondingCurveActive.
 */
async function handleTokenGraduated(event: BagsPoolEvent): Promise<void> {
  // Phase 11: Bags DBC graduation is informational-only.
  // LuxHub graduation is fee-driven (see poolFeeClaimService + graduate.ts).
  console.log('[bags webhook] Bags DBC graduation observed (no-op):', {
    mint: event.tokenMint,
    timestamp: new Date().toISOString(),
    marketCap: event.marketCap,
    priceUSD: event.priceUSD,
  });
  // No Pool state change, no Squad DAO creation, no triggerSquadCreation.
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
        type: isAdd ? 'contribution' : 'pool_distribution',
        pool: pool._id,
        fromWallet: providerWallet,
        amountUSD: parseFloat(amount),
        txSignature: signature,
        status: 'success',
      });
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: type, tokenMint },
    });
  }
}

/**
 * Handle holder dividend distribution events.
 *
 * Phase 11: orphan. The phase 8 holder-dividend model was replaced with the
 * phase 11 claim-driven distribution (distributions[] + holder claim flow).
 * This handler is a log-only observer so the webhook endpoint still
 * acknowledges the event type if Bags ever emits it. No Pool state change.
 */
async function handleHolderDividend(event: BagsHolderDividendEvent): Promise<void> {
  console.log('[bags webhook] HOLDER_DIVIDEND_DISTRIBUTED observed (no-op):', {
    mint: event.tokenMint,
    totalAmount: event.totalAmount,
    recipients: event.recipients,
    timestamp: new Date().toISOString(),
  });
  // No-op: phase 11 distributes via claim-driven pull model, not push dividends.
}

/**
 * Handle creator fee vested events (Bags new vesting model)
 */
async function handleCreatorFeeVested(event: BagsCreatorFeeVestedEvent): Promise<void> {
  const { tokenMint, vestingTokens, vestingStartAt, vestingEndAt, vestingType } = event;

  try {
    const pool = await Pool.findOne({ bagsTokenMint: tokenMint });

    if (pool) {
      // Create or update treasury vesting record
      await TreasuryVesting.findOneAndUpdate(
        { pool: pool._id, feeType: 'creator_fee' },
        {
          $set: {
            bagsTokenMint: tokenMint,
            vestingType,
            vestingStartAt: new Date(vestingStartAt * 1000),
            vestingEndAt: vestingEndAt ? new Date(vestingEndAt * 1000) : undefined,
            status: 'vesting',
          },
          $inc: {
            vestingTokens: parseFloat(vestingTokens),
          },
        },
        { upsert: true, new: true }
      );
    }
  } catch (error) {
    errorMonitor.captureException(error as Error, {
      endpoint: '/api/webhooks/bags',
      extra: { event: 'CREATOR_FEE_VESTED', tokenMint },
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

  if (secret) {
    const payload = JSON.stringify(req.body);
    if (!verifyBagsSignature(payload, signature, secret)) {
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('[bags-webhook] BAGS_WEBHOOK_SECRET not set in production — rejecting');
    return res.status(500).json({ success: false, error: 'Webhook secret not configured' });
  }

  try {
    await dbConnect();

    const events: BagsEvent[] = Array.isArray(req.body) ? req.body : [req.body];

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
          case 'HOLDER_DIVIDEND_DISTRIBUTED':
            await handleHolderDividend(event as BagsHolderDividendEvent);
            break;
          case 'CREATOR_FEE_VESTED':
            await handleCreatorFeeVested(event as BagsCreatorFeeVestedEvent);
            break;
          default:
            break;
        }
      })
    );

    // Count successes and failures
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
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
