// src/lib/services/poolFeeClaimService.ts
// Authoritative fee accumulation engine for pool trading fees.
// This is the ONLY writer of Pool.accumulatedFeesLamports (via $inc).
// Wraps Bags claim-txs/v3 flow with Squads vault proposals, concurrency locking,
// on-chain withdrawal parsing, and TreasuryDeposit audit records.

import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { Pool } from '@/lib/models/Pool';
import { TreasuryDeposit } from '@/lib/models/TreasuryDeposit';
import { getTreasury } from '@/lib/config/treasuryConfig';
import { getConnection } from '@/lib/solana/clusterConfig';
import { lamportsToUsd } from '@/lib/services/solPriceService';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// Valid pool states for fee claiming
const CLAIMABLE_STATES = ['minted', 'funding', 'graduated'];

// ---------- Public API ----------

export interface PendingFeesResult {
  claimableLamports: number;
  lastChecked: Date;
}

export interface ClaimResult {
  success: boolean;
  txSignatures: string[];
  withdrawalTxSignature?: string;
  withdrawalAmountLamports?: number;
  skippedReason?: 'nothing_to_claim' | 'already_in_flight' | 'invalid_state';
  error?: string;
}

export interface DriftResult {
  checked: number;
  drifted: Array<{
    poolId: string;
    primaryLamports: number;
    auditLamports: number;
    diffLamports: number;
    diffPct: number;
  }>;
}

/**
 * Read Bags for claimable fees on a pool's token. Pure read, no chain state change.
 * Calls Bags claim-txs/v3 to get the transaction set, then estimates withdrawal
 * amount from the last tx without signing/sending.
 *
 * Falls back to { claimableLamports: 0 } on any API error.
 */
export async function getPendingFees(tokenMint: string): Promise<PendingFeesResult> {
  const lastChecked = new Date();

  try {
    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      console.warn('[poolFeeClaimService] BAGS_API_KEY not configured');
      return { claimableLamports: 0, lastChecked };
    }

    let feeClaimer: string;
    try {
      feeClaimer = getTreasury('pools');
    } catch {
      console.warn('[poolFeeClaimService] TREASURY_POOLS not configured');
      return { claimableLamports: 0, lastChecked };
    }

    const response = await fetch(`${BAGS_API_BASE}/token-launch/claim-txs/v3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({ feeClaimer, tokenMint }),
    });

    if (!response.ok) {
      // 400 typically means "nothing to claim"
      if (response.status === 400) {
        return { claimableLamports: 0, lastChecked };
      }
      console.warn(
        `[poolFeeClaimService] Bags API returned ${response.status} for getPendingFees`
      );
      return { claimableLamports: 0, lastChecked };
    }

    const result = await response.json();
    const claimTxs = result.response || result;
    const transactions = Array.isArray(claimTxs) ? claimTxs : [claimTxs];

    // If no transactions, nothing to claim
    if (transactions.length === 0 || !transactions[0]) {
      return { claimableLamports: 0, lastChecked };
    }

    // Return non-zero to indicate fees are available
    // Actual amount is only known after on-chain execution
    return { claimableLamports: transactions.length > 0 ? 1 : 0, lastChecked };
  } catch (err) {
    console.warn('[poolFeeClaimService] getPendingFees error:', err);
    return { claimableLamports: 0, lastChecked };
  }
}

/**
 * Execute a full fee claim for a single pool.
 * Idempotency: uses pool.feeClaimInFlight compare-and-set lock.
 * On success, increments accumulatedFeesLamports and writes TreasuryDeposit audit record.
 *
 * IMPORTANT: This is the ONLY function allowed to write to Pool.accumulatedFeesLamports.
 *
 * Flow:
 * 1. Load & validate pool
 * 2. Acquire CAS lock (feeClaimInFlight)
 * 3. Call Bags claim-txs/v3 for transaction set
 * 4. Wrap each tx in a Squads vault proposal (TREASURY_POOLS = vault index 1)
 * 5. Parse withdrawal amount from confirmed on-chain tx
 * 6. Atomically increment Pool.accumulatedFeesLamports
 * 7. Write TreasuryDeposit audit record
 */
export async function claimPoolFees(
  poolId: string,
  opts?: { adminWallet?: string }
): Promise<ClaimResult> {
  // Step 1: Load pool
  const pool = await Pool.findById(poolId);
  if (!pool) {
    return { success: false, txSignatures: [], error: 'Pool not found' };
  }

  // Step 2: Validate state
  if (!pool.bagsTokenMint) {
    return {
      success: false,
      txSignatures: [],
      skippedReason: 'invalid_state',
      error: 'Pool has no bagsTokenMint',
    };
  }

  const tokenStatus = pool.tokenStatus || pool.status;
  if (!CLAIMABLE_STATES.includes(tokenStatus)) {
    return {
      success: false,
      txSignatures: [],
      skippedReason: 'invalid_state',
      error: `Pool tokenStatus "${tokenStatus}" not claimable`,
    };
  }

  // Step 3: Compare-and-set lock
  const locked = await Pool.findOneAndUpdate(
    { _id: poolId, feeClaimInFlight: { $ne: true } },
    { $set: { feeClaimInFlight: true } }
  );
  if (!locked) {
    return { success: false, txSignatures: [], skippedReason: 'already_in_flight' };
  }

  try {
    // Step 4: Call Bags API for claim transactions
    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      throw new Error('BAGS_API_KEY not configured');
    }

    const poolsTreasury = getTreasury('pools');

    const response = await fetch(`${BAGS_API_BASE}/token-launch/claim-txs/v3`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        feeClaimer: poolsTreasury,
        tokenMint: pool.bagsTokenMint,
      }),
    });

    if (!response.ok) {
      if (response.status === 400) {
        return { success: true, txSignatures: [], skippedReason: 'nothing_to_claim' };
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Bags API error ${response.status}: ${JSON.stringify(errorData)}`
      );
    }

    const result = await response.json();
    const claimTxs = result.response || result;
    const transactions = Array.isArray(claimTxs) ? claimTxs : [claimTxs];

    if (transactions.length === 0 || !transactions[0]) {
      return { success: true, txSignatures: [], skippedReason: 'nothing_to_claim' };
    }

    // Step 5: Wrap in Squads vault proposal and execute
    // Import dynamically to avoid circular deps in test mocking
    const { buildVaultProposalFromBagsTxs } = await import(
      './poolFeeClaimSquadsHelper'
    );

    const proposalResult = await buildVaultProposalFromBagsTxs(
      transactions,
      poolsTreasury,
      pool.bagsTokenMint
    );

    if (!proposalResult.success) {
      throw new Error(`Squads proposal failed: ${proposalResult.error}`);
    }

    const txSignatures = proposalResult.txSignatures;
    const withdrawalTxSig =
      proposalResult.withdrawalTxSignature ||
      txSignatures[txSignatures.length - 1];

    // Step 6: Parse withdrawal amount from confirmed on-chain tx
    const withdrawalAmountLamports = await parseWithdrawalAmount(
      withdrawalTxSig,
      poolsTreasury
    );

    // Step 7: Atomic Pool update -- $inc is the ONLY writer of accumulatedFeesLamports
    await Pool.updateOne(
      { _id: poolId },
      {
        $inc: { accumulatedFeesLamports: withdrawalAmountLamports },
        $push: { feeClaimTxSignatures: withdrawalTxSig },
        $set: {
          lastFeeClaimAt: new Date(),
          lastFeeClaimError: null,
        },
      }
    );

    // Step 8: Write audit record
    let amountUSD: number | undefined;
    try {
      amountUSD = await lamportsToUsd(withdrawalAmountLamports);
    } catch {
      // Price service unavailable -- continue without USD amount
    }

    await TreasuryDeposit.create({
      depositType: 'pool_trading_fee',
      pool: poolId,
      amountLamports: withdrawalAmountLamports,
      amountSOL: withdrawalAmountLamports / 1_000_000_000,
      amountUSD,
      txSignature: withdrawalTxSig,
      fromWallet: 'bags_claim_vault',
      toWallet: poolsTreasury,
      description: `Pool fee claim for ${pool.bagsTokenMint}`,
    });

    return {
      success: true,
      txSignatures,
      withdrawalTxSignature: withdrawalTxSig,
      withdrawalAmountLamports,
    };
  } catch (err: any) {
    console.error(`[poolFeeClaimService] claimPoolFees error for pool ${poolId}:`, err);

    // Record the error on the pool
    await Pool.updateOne(
      { _id: poolId },
      { $set: { lastFeeClaimError: err?.message || 'Unknown error' } }
    ).catch(() => {});

    return {
      success: false,
      txSignatures: [],
      error: err?.message || 'Unknown error',
    };
  } finally {
    // ALWAYS release the lock
    await Pool.updateOne(
      { _id: poolId },
      { $set: { feeClaimInFlight: false } }
    );
  }
}

/**
 * Daily drift-check helper. Pure read. Compares primary counter against sum of audit records.
 * Returns list of drifted pools for Sentry alerting by the drift-check cron.
 */
export async function reconcilePoolFeeCounters(): Promise<DriftResult> {
  const pools: any[] = await Pool.find({
    tokenStatus: { $in: ['funding', 'graduated', 'custody'] },
  }).lean();

  const drifted: DriftResult['drifted'] = [];

  for (const pool of pools) {
    const deposits = await TreasuryDeposit.find({
      pool: pool._id,
      depositType: 'pool_trading_fee',
    }).lean();

    const auditSum = deposits.reduce(
      (s: number, d: any) => s + (d.amountLamports || 0),
      0
    );
    const primary = (pool as any).accumulatedFeesLamports || 0;
    const diff = Math.abs(primary - auditSum);
    // Threshold: 1% of primary counter or 0.1 SOL, whichever is greater
    const threshold = Math.max(primary * 0.01, 100_000_000);

    if (diff > threshold) {
      drifted.push({
        poolId: pool._id.toString(),
        primaryLamports: primary,
        auditLamports: auditSum,
        diffLamports: diff,
        diffPct: primary > 0 ? (diff / primary) * 100 : 0,
      });
    }
  }

  return { checked: pools.length, drifted };
}

// ---------- Internal helpers ----------

/**
 * Parse the SOL withdrawal amount from a confirmed on-chain transaction.
 * Compares pre/post balances for the TREASURY_POOLS address to determine
 * the exact delta. This is the authoritative number -- never trust
 * Bags's "expected amount" from the quote.
 */
export async function parseWithdrawalAmount(
  txSignature: string,
  treasuryAddress: string
): Promise<number> {
  const connection = getConnection();
  const tx = await connection.getTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx || !tx.meta) {
    throw new Error(`Transaction ${txSignature} not found or missing metadata`);
  }

  // Find the treasury address in account keys
  // getAccountKeys() returns MessageAccountKeys which exposes .get(idx) and .keySegments()
  // but for iteration we use the raw staticAccountKeys / accountKeys array
  const msg = tx.transaction.message as any;
  const accountKeys: PublicKey[] =
    msg.staticAccountKeys || msg.accountKeys || [];

  const treasuryIdx = accountKeys.findIndex(
    (k: PublicKey) => k.toBase58() === treasuryAddress
  );

  if (treasuryIdx === -1) {
    console.warn(
      `[poolFeeClaimService] Treasury ${treasuryAddress} not found in tx ${txSignature}`
    );
    return 0;
  }

  const preBal = tx.meta.preBalances[treasuryIdx];
  const postBal = tx.meta.postBalances[treasuryIdx];
  const delta = postBal - preBal;

  return Math.max(0, delta);
}
