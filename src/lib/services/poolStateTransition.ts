/**
 * Pool state machine chokepoint.
 *
 * RULE: No code outside this file may directly mutate `pool.tokenStatus`.
 * Call transitionPoolState() for EVERY state change. The state machine enforces
 * valid transitions and produces the on-chain lifecycle memo audit trail.
 *
 * Exceptions:
 *   - Wave 0 migration script (sets initial tokenStatus -- no from state exists)
 *   - Admin manual override via a dedicated admin endpoint (future, not phase 11)
 */

import { TransactionInstruction, PublicKey, Keypair } from '@solana/web3.js';
import { Pool } from '@/lib/models/Pool';
import { errorMonitor } from '@/lib/monitoring/errorHandler';
import { sendWithRetry } from '@/lib/solana/retryTransaction';
import { getConnection } from '@/lib/solana/clusterConfig';
import { readFileSync } from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TokenStatus =
  | 'pending'
  | 'minted'
  | 'funding'
  | 'graduated'
  | 'custody'
  | 'resale_listed'
  | 'resold'
  | 'distributed'
  | 'aborted'
  | 'resale_unlisted'
  | 'partial_distributed';

// ---------------------------------------------------------------------------
// State machine transition table
// ---------------------------------------------------------------------------

export const VALID_TRANSITIONS: Record<TokenStatus, TokenStatus[]> = {
  pending: ['minted', 'aborted'],
  minted: ['funding', 'aborted'],
  funding: ['graduated', 'aborted'],
  graduated: ['custody', 'aborted'],
  custody: ['resale_listed', 'aborted'],
  resale_listed: ['resold', 'resale_unlisted', 'aborted'],
  resale_unlisted: ['resale_listed', 'aborted'],
  resold: ['distributed', 'partial_distributed'],
  partial_distributed: ['distributed'],
  distributed: [], // terminal
  aborted: [], // terminal
};

// All valid token status values (used for runtime validation)
const ALL_TOKEN_STATUSES = new Set<string>(Object.keys(VALID_TRANSITIONS));

// ---------------------------------------------------------------------------
// Memo program
// ---------------------------------------------------------------------------

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

// ---------------------------------------------------------------------------
// Memo signer keypair loader
// ---------------------------------------------------------------------------

function loadMemoSigner(): Keypair {
  // Prefer dedicated memo signer if configured
  const memoJson = process.env.MEMO_SIGNER_KEYPAIR_JSON;
  if (memoJson) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(memoJson)));
  }

  // Fall back to Squads member keypair (same pattern as squadsTransferService)
  const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
  const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
  if (!path && !json) {
    throw new Error(
      'Missing MEMO_SIGNER_KEYPAIR_JSON, SQUADS_MEMBER_KEYPAIR_PATH, or SQUADS_MEMBER_KEYPAIR_JSON env'
    );
  }
  const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TransitionParams {
  poolId: string;
  fromState: TokenStatus; // expected current state (compare-and-set)
  toState: TokenStatus; // desired next state
  reason?: string; // optional audit note, included in memo
  txContext?: string; // optional -- related on-chain tx sig
  skipMemo?: boolean; // escape hatch for tests/bulk operations
}

export interface TransitionResult {
  success: boolean;
  memoTxSignature?: string;
  error?: string;
  newState?: TokenStatus;
}

/**
 * Transition a pool from one tokenStatus to another.
 *
 * 1. Validates the transition against the canonical state machine.
 * 2. Atomically updates MongoDB via compare-and-set (findOneAndUpdate).
 * 3. Publishes a Solana memo instruction for the on-chain audit trail.
 * 4. Appends the memo signature to pool.lifecycleMemos[].
 *
 * If the memo tx fails, the state transition is still committed (memo is
 * audit-only). The failure is logged to Sentry.
 */
export async function transitionPoolState(
  params: TransitionParams
): Promise<TransitionResult> {
  const { poolId, fromState, toState, reason, txContext, skipMemo } = params;

  // ---- Validate status values are known ----
  if (!ALL_TOKEN_STATUSES.has(fromState)) {
    return { success: false, error: 'invalid_from_state' };
  }
  if (!ALL_TOKEN_STATUSES.has(toState)) {
    return { success: false, error: 'invalid_transition' };
  }

  // ---- Validate transition is allowed ----
  const allowed = VALID_TRANSITIONS[fromState];
  if (!allowed.includes(toState)) {
    return { success: false, error: 'invalid_transition' };
  }

  // ---- Load pool and verify current state ----
  const pool = await Pool.findById(poolId).lean();
  if (!pool) {
    return { success: false, error: 'pool_not_found' };
  }
  if ((pool as any).tokenStatus !== fromState) {
    return { success: false, error: 'invalid_from_state' };
  }

  // ---- Compare-and-set atomic update ----
  const updated = await Pool.findOneAndUpdate(
    { _id: poolId, tokenStatus: fromState },
    {
      $set: {
        tokenStatus: toState,
        tokenStatusUpdatedAt: new Date(),
      },
    },
    { new: true }
  );

  if (!updated) {
    return { success: false, error: 'race_condition' };
  }

  // ---- Publish Solana memo (unless skipMemo) ----
  let memoTxSignature: string | undefined;

  if (!skipMemo) {
    try {
      const memoPayload = JSON.stringify({
        poolId,
        fromState,
        toState,
        reason: reason || undefined,
        timestamp: new Date().toISOString(),
        txContext: txContext || undefined,
      });

      const memoIx = new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memoPayload, 'utf-8'),
      });

      const connection = getConnection();
      const signer = loadMemoSigner();

      memoTxSignature = await sendWithRetry(connection, [memoIx], signer, {
        commitment: 'confirmed',
      });

      // Append memo to lifecycleMemos[]
      await Pool.updateOne(
        { _id: poolId },
        {
          $push: {
            lifecycleMemos: {
              fromState,
              toState,
              timestamp: new Date(),
              txSignature: memoTxSignature,
            },
          },
        }
      );
    } catch (err) {
      // Memo failure must NOT block the state transition
      const error = err instanceof Error ? err : new Error(String(err));
      errorMonitor.captureException(error, {
        extra: {
          poolId,
          fromState,
          toState,
          reason: reason || '',
          context: 'poolStateTransition_memo_failed',
        },
      });
    }
  }

  return {
    success: true,
    newState: toState,
    memoTxSignature,
  };
}
