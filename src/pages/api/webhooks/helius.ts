// src/pages/api/webhooks/helius.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '@/lib/models/Assets';
import { Escrow } from '@/lib/models/Escrow';
import { Transaction } from '@/lib/models/Transaction';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { webhookLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring, errorMonitor } from '@/lib/monitoring/errorHandler';

// LuxHub Treasury wallet address
const TREASURY_WALLET = process.env.NEXT_PUBLIC_LUXHUB_WALLET;

// Program ID for escrow account detection
const PROGRAM_ID = process.env.PROGRAM_ID;

// Helius webhook event types (enhanced)
type HeliusEventType =
  | 'NFT_SALE'
  | 'NFT_LISTING'
  | 'NFT_CANCEL_LISTING'
  | 'NFT_BID'
  | 'NFT_BID_CANCELLED'
  | 'NFT_TRANSFER'
  | 'NFT_MINT'
  | 'NFT_AUCTION_CREATED'
  | 'NFT_AUCTION_UPDATED'
  | 'NFT_AUCTION_CANCELLED'
  | 'NFT_PARTICIPATION_REWARD'
  | 'NFT_MINT_REJECTED'
  | 'ACCOUNT_UPDATE'
  | 'TOKEN_BURN'
  | 'TRANSFER'
  | 'SWAP'
  | 'UNKNOWN';

interface NativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // in lamports
}

interface TokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount?: string;
  toTokenAccount?: string;
  tokenAmount: number;
  mint: string;
  tokenStandard?: string;
}

interface AccountData {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: Array<{
    userAccount: string;
    tokenAccount: string;
    rawTokenAmount: {
      tokenAmount: string;
      decimals: number;
    };
    mint: string;
  }>;
}

interface HeliusEvent {
  type: HeliusEventType;
  signature: string;
  timestamp: number;
  slot?: number;
  fee?: number;
  feePayer?: string;
  description?: string;
  source?: string;
  nativeTransfers?: NativeTransfer[];
  tokenTransfers?: TokenTransfer[];
  accountData?: AccountData[];
  instructions?: Array<{
    programId: string;
    accounts: string[];
    data: string;
    innerInstructions?: Array<{
      programId: string;
      accounts: string[];
      data: string;
    }>;
  }>;
  events?: {
    nft?: {
      description?: string;
      type?: string;
      source?: string;
      amount?: number;
      fee?: number;
      buyer?: string;
      seller?: string;
      staker?: string;
      nfts?: Array<{
        mint: string;
        tokenStandard?: string;
      }>;
    };
    swap?: {
      nativeInput?: { account: string; amount: string };
      nativeOutput?: { account: string; amount: string };
      tokenInputs?: Array<{ mint: string; amount: string }>;
      tokenOutputs?: Array<{ mint: string; amount: string }>;
    };
  };
}

/**
 * Verify the Helius webhook signature
 */
function verifyHeliusSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Use timing-safe comparison
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Classify deposit type based on transaction context
 */
async function classifyDeposit(
  fromWallet: string,
  amount: number,
  event: HeliusEvent
): Promise<{
  depositType: string;
  escrowId?: string;
  poolId?: string;
  assetId?: string;
}> {
  // Check if this is from a known escrow
  const escrow = await Escrow.findOne({
    $or: [{ sellerWallet: fromWallet }, { escrowPda: fromWallet }],
  });

  if (escrow) {
    // Check if amount matches expected royalty (3%)
    const expectedRoyalty = escrow.listingPrice ? escrow.listingPrice * 0.03 : 0;
    const tolerance = expectedRoyalty * 0.01; // 1% tolerance

    if (Math.abs(amount - expectedRoyalty) <= tolerance) {
      return {
        depositType: 'escrow_fee',
        escrowId: escrow._id.toString(),
        assetId: escrow.asset?.toString(),
      };
    }
  }

  // Check program instructions for context
  if (event.instructions) {
    for (const ix of event.instructions) {
      if (ix.programId === PROGRAM_ID) {
        return { depositType: 'platform_fee' };
      }
    }
  }

  // Default to direct deposit
  return { depositType: 'direct_deposit' };
}

/**
 * Handle treasury wallet deposits (SOL transfers to LuxHub wallet)
 */
async function handleTreasuryDeposit(event: HeliusEvent): Promise<void> {
  if (!TREASURY_WALLET) {
    console.warn('[helius-webhook] TREASURY_WALLET not configured, skipping deposit tracking');
    return;
  }

  const nativeTransfers = event.nativeTransfers || [];

  for (const transfer of nativeTransfers) {
    // Only track transfers TO the treasury wallet
    if (transfer.toUserAccount !== TREASURY_WALLET) continue;
    if (transfer.amount <= 0) continue;

    const { fromUserAccount, amount } = transfer;

    try {
      // Check if we've already recorded this deposit
      const existing = await TreasuryDeposit.findOne({ txSignature: event.signature });
      if (existing) {
        console.log(`[helius-webhook] Treasury deposit already recorded: ${event.signature}`);
        continue;
      }

      // Classify the deposit type
      const classification = await classifyDeposit(fromUserAccount, amount, event);

      // Create treasury deposit record
      const deposit = await TreasuryDeposit.create({
        txSignature: event.signature,
        slot: event.slot,
        blockTime: new Date(event.timestamp * 1000),
        amountLamports: amount,
        amountSOL: amount / 1e9,
        fromWallet: fromUserAccount,
        toWallet: TREASURY_WALLET,
        depositType: classification.depositType,
        escrow: classification.escrowId,
        asset: classification.assetId,
        heliusEventType: event.type,
        description: event.description,
      });

      console.log(
        `[helius-webhook] Treasury deposit recorded: ${amount / 1e9} SOL from ${fromUserAccount} (${classification.depositType})`
      );

      // If this is an escrow fee, update the related escrow
      if (classification.escrowId) {
        await Escrow.findByIdAndUpdate(classification.escrowId, {
          $set: {
            royaltyPaid: true,
            royaltyTxSignature: event.signature,
          },
        });
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'TREASURY_DEPOSIT', fromWallet: fromUserAccount, amount },
      });
    }
  }
}

/**
 * Handle NFT transfer events
 */
async function handleNftTransfer(event: HeliusEvent): Promise<void> {
  const tokenTransfers = event.tokenTransfers || [];

  for (const transfer of tokenTransfers) {
    if (!transfer.mint) continue;

    const { mint, fromUserAccount, toUserAccount } = transfer;

    try {
      // Update asset owner
      const result = await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: { nftOwnerWallet: toUserAccount },
          $push: {
            transferHistory: {
              from: fromUserAccount,
              to: toUserAccount,
              transactionSignature: event.signature,
              transferredAt: new Date(event.timestamp * 1000),
            },
          },
        },
        { new: true }
      );

      if (result) {
        console.log(
          `[helius-webhook] NFT transfer recorded: ${mint} from ${fromUserAccount} to ${toUserAccount}`
        );
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'NFT_TRANSFER', mint },
      });
    }
  }
}

/**
 * Handle NFT sale events
 */
async function handleNftSale(event: HeliusEvent): Promise<void> {
  const nftEvent = event.events?.nft;
  if (!nftEvent?.nfts || nftEvent.nfts.length === 0) return;

  for (const nft of nftEvent.nfts) {
    const { mint } = nft;
    const buyer = nftEvent.buyer;
    const seller = nftEvent.seller;
    const saleAmount = nftEvent.amount || 0;

    try {
      // Update escrow status if exists
      const escrow = await Escrow.findOneAndUpdate(
        {
          nftMint: mint,
          status: { $in: ['initiated', 'funded', 'listed', 'shipped', 'delivered'] },
        },
        {
          $set: {
            status: 'released',
            buyerWallet: buyer,
            releasedAt: new Date(event.timestamp * 1000),
            txSignature: event.signature,
          },
        },
        { new: true }
      );

      // Update asset
      await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: {
            nftOwnerWallet: buyer,
            status: 'sold',
          },
          $push: {
            transferHistory: {
              from: seller,
              to: buyer,
              transactionSignature: event.signature,
              transferredAt: new Date(event.timestamp * 1000),
            },
          },
        }
      );

      // Record transaction
      if (escrow) {
        await Transaction.create({
          type: 'sale',
          escrow: escrow._id,
          asset: escrow.asset,
          fromWallet: seller,
          toWallet: buyer,
          amountUSD: saleAmount / 1e9, // Convert lamports to SOL (will need price conversion)
          txSignature: event.signature,
          status: 'success',
        });
      }

      console.log(
        `[helius-webhook] NFT sale recorded: ${mint}, buyer: ${buyer}, amount: ${saleAmount / 1e9} SOL`
      );
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'NFT_SALE', mint },
      });
    }
  }
}

/**
 * Handle NFT listing events
 */
async function handleNftListing(event: HeliusEvent): Promise<void> {
  const nftEvent = event.events?.nft;
  if (!nftEvent?.nfts || nftEvent.nfts.length === 0) return;

  for (const nft of nftEvent.nfts) {
    const { mint } = nft;
    const seller = nftEvent.seller;
    const listingPrice = nftEvent.amount;

    try {
      // Update escrow to listed status
      const escrow = await Escrow.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: {
            status: 'listed',
            listingPrice: listingPrice,
            listedAt: new Date(event.timestamp * 1000),
            listingTxSignature: event.signature,
          },
        },
        { new: true }
      );

      // Update asset status
      await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: { status: 'listed' },
        }
      );

      if (escrow) {
        console.log(
          `[helius-webhook] NFT listing recorded: ${mint}, seller: ${seller}, price: ${listingPrice ? listingPrice / 1e9 : 'unknown'} SOL`
        );
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'NFT_LISTING', mint },
      });
    }
  }
}

/**
 * Handle NFT listing cancellation events
 */
async function handleNftCancelListing(event: HeliusEvent): Promise<void> {
  const nftEvent = event.events?.nft;
  if (!nftEvent?.nfts || nftEvent.nfts.length === 0) return;

  for (const nft of nftEvent.nfts) {
    const { mint } = nft;

    try {
      // Revert escrow to initiated status
      await Escrow.findOneAndUpdate(
        { nftMint: mint, status: 'listed' },
        {
          $set: {
            status: 'initiated',
            cancelledAt: new Date(event.timestamp * 1000),
          },
          $unset: {
            listingPrice: 1,
            listedAt: 1,
            listingTxSignature: 1,
          },
        }
      );

      // Update asset status
      await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: { status: 'pending' },
        }
      );

      console.log(`[helius-webhook] NFT listing cancelled: ${mint}`);
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'NFT_CANCEL_LISTING', mint },
      });
    }
  }
}

/**
 * Handle NFT mint events
 */
async function handleNftMint(event: HeliusEvent): Promise<void> {
  const nftEvent = event.events?.nft;
  if (!nftEvent?.nfts || nftEvent.nfts.length === 0) return;

  for (const nft of nftEvent.nfts) {
    const { mint, tokenStandard } = nft;

    try {
      // Update asset if it exists (was pre-registered)
      const result = await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: {
            mintedAt: new Date(event.timestamp * 1000),
            mintTxSignature: event.signature,
            tokenStandard: tokenStandard,
          },
        },
        { new: true }
      );

      if (result) {
        console.log(`[helius-webhook] NFT mint recorded: ${mint}`);

        // Record mint transaction
        await Transaction.create({
          type: 'mint',
          asset: result._id,
          toWallet: result.nftOwnerWallet,
          txSignature: event.signature,
          status: 'success',
        });
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'NFT_MINT', mint },
      });
    }
  }
}

/**
 * Handle escrow account updates (PDA state changes)
 */
async function handleAccountUpdate(event: HeliusEvent): Promise<void> {
  const accountData = event.accountData || [];

  for (const data of accountData) {
    const { account, nativeBalanceChange } = data;

    try {
      // Check if this is an escrow PDA we're tracking
      const escrow = await Escrow.findOne({ escrowPda: account });

      if (escrow) {
        // Determine state change based on balance change
        let newStatus = escrow.status;
        const updateData: Record<string, unknown> = {
          lastSyncedAt: new Date(event.timestamp * 1000),
          lastTxSignature: event.signature,
        };

        // Positive balance change = funds deposited (buyer funded)
        if (nativeBalanceChange > 0 && escrow.status === 'listed') {
          newStatus = 'funded';
          updateData.fundedAt = new Date(event.timestamp * 1000);
          updateData.fundedAmount = nativeBalanceChange;
          console.log(
            `[helius-webhook] Escrow funded: ${account}, amount: ${nativeBalanceChange / 1e9} SOL`
          );
        }

        // Negative balance change = funds released
        if (nativeBalanceChange < 0 && escrow.status === 'funded') {
          newStatus = 'released';
          updateData.releasedAt = new Date(event.timestamp * 1000);
          console.log(`[helius-webhook] Escrow released: ${account}`);
        }

        updateData.status = newStatus;
        await Escrow.findByIdAndUpdate(escrow._id, { $set: updateData });

        console.log(`[helius-webhook] Escrow account updated: ${account}, status: ${newStatus}`);
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'ACCOUNT_UPDATE', account },
      });
    }
  }
}

/**
 * Handle token burn events
 */
async function handleTokenBurn(event: HeliusEvent): Promise<void> {
  const tokenTransfers = event.tokenTransfers || [];

  for (const transfer of tokenTransfers) {
    // A burn is typically a transfer to the system program or null address
    if (!transfer.mint) continue;

    const { mint } = transfer;

    try {
      // Mark asset as burned
      const result = await Asset.findOneAndUpdate(
        { nftMint: mint },
        {
          $set: {
            status: 'burned',
            burnedAt: new Date(event.timestamp * 1000),
            burnTxSignature: event.signature,
          },
        },
        { new: true }
      );

      if (result) {
        console.log(`[helius-webhook] NFT burn recorded: ${mint}`);

        // Record burn transaction
        await Transaction.create({
          type: 'burn',
          asset: result._id,
          fromWallet: result.nftOwnerWallet,
          txSignature: event.signature,
          status: 'success',
        });

        // Update any related escrow
        await Escrow.findOneAndUpdate(
          { nftMint: mint },
          {
            $set: {
              status: 'cancelled',
              cancelledAt: new Date(event.timestamp * 1000),
              cancelReason: 'NFT burned',
            },
          }
        );
      }
    } catch (error) {
      errorMonitor.captureException(error as Error, {
        endpoint: '/api/webhooks/helius',
        extra: { event: 'TOKEN_BURN', mint },
      });
    }
  }
}

/**
 * Handle generic SOL transfer events
 */
async function handleTransfer(event: HeliusEvent): Promise<void> {
  // Check for treasury deposits
  await handleTreasuryDeposit(event);

  // Could add additional transfer tracking logic here if needed
}

/**
 * Main webhook handler
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Verify webhook signature
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  const signature = req.headers['x-helius-signature'] as string | undefined;

  // In development, allow requests without signature verification
  if (process.env.NODE_ENV === 'production' && secret) {
    const payload = JSON.stringify(req.body);
    if (!verifyHeliusSignature(payload, signature, secret)) {
      console.warn('[helius-webhook] Invalid signature received');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }
  }

  try {
    await dbConnect();

    const events: HeliusEvent[] = Array.isArray(req.body) ? req.body : [req.body];

    console.log(`[helius-webhook] Received ${events.length} event(s)`);

    // Process events in parallel with error handling
    const results = await Promise.allSettled(
      events.map(async (event) => {
        // Always check for treasury deposits on any event with native transfers
        if (event.nativeTransfers && event.nativeTransfers.length > 0) {
          await handleTreasuryDeposit(event);
        }

        switch (event.type) {
          case 'NFT_TRANSFER':
            await handleNftTransfer(event);
            break;
          case 'NFT_SALE':
            await handleNftSale(event);
            break;
          case 'NFT_LISTING':
            await handleNftListing(event);
            break;
          case 'NFT_CANCEL_LISTING':
            await handleNftCancelListing(event);
            break;
          case 'NFT_MINT':
            await handleNftMint(event);
            break;
          case 'ACCOUNT_UPDATE':
            await handleAccountUpdate(event);
            break;
          case 'TOKEN_BURN':
            await handleTokenBurn(event);
            break;
          case 'TRANSFER':
            await handleTransfer(event);
            break;
          case 'SWAP':
            // Log swaps but don't process (not relevant to marketplace)
            console.log(`[helius-webhook] Swap event received: ${event.signature}`);
            break;
          default:
            console.log(`[helius-webhook] Unhandled event type: ${event.type}`);
        }
      })
    );

    // Count successes and failures
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`[helius-webhook] ${failed}/${events.length} events failed to process`);
      // Log failed events for debugging
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`[helius-webhook] Event ${i} failed:`, r.reason);
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
    console.error('[helius-webhook] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Webhook processing failed',
    });
  }
}

// Apply rate limiting and error monitoring
export default webhookLimiter(withErrorMonitoring(handler));
