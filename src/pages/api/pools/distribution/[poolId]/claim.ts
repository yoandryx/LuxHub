// src/pages/api/pools/distribution/[poolId]/claim.ts
// Phase 11-12: Holder claim endpoint (two-tx flow).
//
// Self-serve holder claim: accepts a client-signed SPL burn tx signature,
// verifies on-chain that the burn landed, then creates a Squads proposal
// for the USDC payout from the LuxHub treasury to the holder's USDC ATA.
//
// Two-tx flow: burn is client-signed, payout is Squads-signed.
// Idempotency via compare-and-set on distributions.$.claimedAt.
//
// POST /api/pools/distribution/[poolId]/claim
// Body: { holderWallet: string, burnTxSignature: string }
// Public endpoint (no admin auth; the burn tx IS the authorization).
// Rate-limited: 5 per minute per IP.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring, errorMonitor } from '@/lib/monitoring/errorHandler';
import { strictLimiter } from '@/lib/middleware/rateLimit';
import dbConnect from '@/lib/database/mongodb';
import { Pool } from '@/lib/models/Pool';
import { PoolDistribution } from '@/lib/models/PoolDistribution';
import { buildMultiTransferProposal } from '@/lib/services/squadsTransferService';
import { transitionPoolState } from '@/lib/services/poolStateTransition';
import { verifyBurnTx } from '@/lib/solana/verifyBurn';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const poolId = req.query.poolId as string;
  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'missing_pool_id' });
  }

  const { holderWallet, burnTxSignature } = req.body || {};

  if (!holderWallet || typeof holderWallet !== 'string') {
    return res.status(400).json({ error: 'missing_params', detail: 'holderWallet is required' });
  }
  if (!burnTxSignature || typeof burnTxSignature !== 'string') {
    return res.status(400).json({ error: 'missing_params', detail: 'burnTxSignature is required' });
  }

  await dbConnect();

  // Load the active distribution for this pool
  const dist = await PoolDistribution.findOne({
    pool: poolId,
    status: { $in: ['pending', 'partial_distributed'] },
  });

  if (!dist) {
    return res.status(404).json({ error: 'no_distribution' });
  }

  // Deadline check
  if (dist.claimDeadlineAt && new Date(dist.claimDeadlineAt) < new Date()) {
    return res.status(400).json({ error: 'claim_expired' });
  }

  // Find the holder's entry (case-insensitive wallet match)
  const entry = (dist.distributions as any[]).find(
    (d: any) => d.payoutWallet?.toLowerCase() === holderWallet.toLowerCase()
  );

  if (!entry) {
    return res.status(404).json({ error: 'holder_not_in_snapshot' });
  }

  if (entry.claimedAt) {
    return res.status(400).json({ error: 'already_claimed' });
  }

  // Load pool for bagsTokenMint
  const pool = await Pool.findById(poolId);
  if (!pool) {
    return res.status(404).json({ error: 'pool_not_found' });
  }
  if (!(pool as any).bagsTokenMint) {
    return res.status(400).json({ error: 'no_token_mint' });
  }

  // Verify the burn tx on-chain
  const verification = await verifyBurnTx({
    txSignature: burnTxSignature,
    expectedMint: (pool as any).bagsTokenMint,
    expectedOwner: holderWallet,
    expectedMinAmount: entry.shares, // shares = raw token balance from snapshot
  });

  if (!verification.valid) {
    return res.status(400).json({
      error: 'burn_verification_failed',
      detail: verification.reason,
    });
  }

  // Compare-and-set: mark this entry as burn-verified to prevent double-claim races
  const claimed = await PoolDistribution.findOneAndUpdate(
    {
      _id: dist._id,
      'distributions.payoutWallet': holderWallet,
      'distributions.claimedAt': null,
    },
    {
      $set: {
        'distributions.$.burnTxSignature': burnTxSignature,
        'distributions.$.claimedAt': new Date(),
      },
    },
    { new: true }
  );

  if (!claimed) {
    return res.status(409).json({ error: 'race_condition_or_already_claimed' });
  }

  // Create the Squads USDC payout proposal
  let proposal;
  try {
    proposal = await buildMultiTransferProposal(
      [
        {
          wallet: holderWallet,
          amountUSD: entry.payoutUSD,
          label: `Pool distribution claim for pool ${poolId}`,
        },
      ],
      { autoApprove: true }
    );
  } catch (err: any) {
    errorMonitor.captureException(
      err instanceof Error ? err : new Error(String(err)),
      { extra: { poolId, holderWallet, payoutUSD: entry.payoutUSD } }
    );
    // Burn already happened — record the error but still return success for the burn
    // Admin can retry the payout manually
    return res.status(200).json({
      success: true,
      payoutUSD: entry.payoutUSD,
      burnTxSignature,
      proposalError: err?.message || 'Squads proposal failed',
      message: 'Burn verified and recorded. Payout proposal failed — admin will retry.',
    });
  }

  // Record the proposal reference
  await PoolDistribution.updateOne(
    { _id: dist._id, 'distributions.payoutWallet': holderWallet },
    {
      $set: {
        'distributions.$.squadsProposalIndex': proposal.transactionIndex
          ? Number(proposal.transactionIndex)
          : undefined,
        'distributions.$.paidTxSignature': proposal.signature || null,
        'distributions.$.paidAt': proposal.success ? new Date() : null,
      },
    }
  );

  // Check if all entries are now claimed and advance distribution state
  const updatedDist = await PoolDistribution.findById(dist._id);
  if (updatedDist) {
    const allClaimed = (updatedDist.distributions as any[]).every(
      (d: any) => d.claimedAt != null
    );
    const anyClaimed = (updatedDist.distributions as any[]).some(
      (d: any) => d.claimedAt != null
    );

    if (allClaimed) {
      await PoolDistribution.updateOne(
        { _id: dist._id },
        { $set: { status: 'distributed' } }
      );
      await transitionPoolState({
        poolId,
        fromState: 'resold',
        toState: 'distributed',
        reason: 'all holders claimed',
      });
    } else if (anyClaimed && updatedDist.status === 'pending') {
      await PoolDistribution.updateOne(
        { _id: dist._id },
        { $set: { status: 'partial_distributed' } }
      );
      // Pool state: resold -> partial_distributed (if still in resold)
      if ((pool as any).tokenStatus === 'resold') {
        await transitionPoolState({
          poolId,
          fromState: 'resold',
          toState: 'partial_distributed',
          reason: 'first claim received',
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    payoutUSD: entry.payoutUSD,
    burnTxSignature,
    proposalIndex: proposal.transactionIndex,
    proposalDeepLink: proposal.squadsDeepLink,
    executionTxSignature: proposal.signature,
  });
}

// Rate limit: 5 per minute per IP (strictLimiter)
export default withErrorMonitoring(strictLimiter(handler));
