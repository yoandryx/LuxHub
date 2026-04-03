// src/pages/api/pool/claim-distribution.ts
// Claimable distribution endpoint for token holders.
// Replaces the push-based distribution model with a pull/claim model.
//
// POST  { poolId, claimerWallet }                → Check claimable amount
// POST  { poolId, claimerWallet, execute: true }  → Mark as claimed (client signs TX)
// PATCH { poolId, claimerWallet, txSignature }    → Confirm claim TX + auto-finalize
// POST  { poolId, adminWallet, action: 'sweep-unclaimed' } → Admin sweeps expired claims
// POST  { poolId, adminWallet, action: 'retry-burn' }      → Admin retries on-chain burn
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { withErrorMonitoring, errorMonitor } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { getTreasury } from '../../../lib/config/treasuryConfig';
import { calculateDistribution } from '../../../lib/services/distributionCalc';

/**
 * Attempt on-chain SPL token burn for the pool's token mint.
 * Burns all tokens held by the admin/treasury authority, then closes the mint if possible.
 * Returns the burn TX signature on success, or null on failure.
 */
async function burnPoolTokens(
  pool: any
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  try {
    const mintAddress = pool.bagsTokenMint;
    if (!mintAddress) {
      return { success: false, error: 'No bagsTokenMint on pool' };
    }

    const adminConfig = getAdminConfig();
    const adminKeypair = adminConfig.getAdminKeypair();
    if (!adminKeypair) {
      return { success: false, error: 'Admin keypair not configured for on-chain burn' };
    }

    const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    if (!endpoint) {
      return { success: false, error: 'NEXT_PUBLIC_SOLANA_ENDPOINT not configured' };
    }

    const connection = new Connection(endpoint, 'confirmed');
    const mint = new PublicKey(mintAddress);

    // Dynamically import @solana/spl-token to keep bundle size manageable
    const splToken = await import('@solana/spl-token');

    // Find admin's associated token account for this mint
    const adminAta = await splToken.getAssociatedTokenAddress(mint, adminKeypair.publicKey);

    // Check if admin ATA exists and has balance
    try {
      const tokenAccount = await splToken.getAccount(connection, adminAta);
      const balance = tokenAccount.amount;

      if (balance > BigInt(0)) {
        // Burn all tokens in admin's ATA
        const burnSig = await splToken.burn(
          connection,
          adminKeypair,
          adminAta,
          mint,
          adminKeypair,
          balance
        );

        // Close the token account after burn
        try {
          await splToken.closeAccount(
            connection,
            adminKeypair,
            adminAta,
            adminKeypair.publicKey,
            adminKeypair
          );
        } catch {
          // closeAccount may fail if not all accounts are empty — non-critical
        }

        return { success: true, txSignature: burnSig };
      }
    } catch {
      // Admin ATA doesn't exist or has no balance — still mark as complete
    }

    return { success: true, txSignature: 'no-tokens-to-burn' };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown burn error' };
  }
}

/**
 * Finalize pool after all claims are collected or claim window expires.
 * Executes on-chain SPL token burn (D-11) and closes the pool.
 */
async function finalizePool(poolId: string): Promise<void> {
  const pool = await Pool.findById(poolId);
  if (!pool) return;

  // Attempt on-chain burn (D-11)
  const burnResult = await burnPoolTokens(pool);

  if (burnResult.success) {
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        status: 'closed',
        tokenStatus: 'burned',
        distributionStatus: 'completed',
        burnTxSignature: burnResult.txSignature,
        closedAt: new Date(),
      },
    });
  } else {
    // On-chain burn failed — close pool but mark burn as pending
    errorMonitor.captureException(new Error(`Pool burn failed: ${burnResult.error}`), {
      extra: { poolId, bagsTokenMint: pool.bagsTokenMint, burnError: burnResult.error },
    });

    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        status: 'closed',
        tokenStatus: 'burn_pending',
        distributionStatus: 'completed',
        closedAt: new Date(),
      },
    });
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ========== PATCH: Confirm claim TX ==========
  if (req.method === 'PATCH') {
    try {
      const { poolId, claimerWallet, txSignature } = req.body;

      if (!poolId || !claimerWallet || !txSignature) {
        return res.status(400).json({
          error: 'Missing required fields: poolId, claimerWallet, txSignature',
        });
      }

      await dbConnect();
      const pool = await Pool.findById(poolId);
      if (!pool || pool.deleted) {
        return res.status(404).json({ error: 'Pool not found' });
      }

      // Find the distribution entry (case-insensitive)
      const distEntry = pool.distributions?.find(
        (d: any) => d.wallet?.toLowerCase() === claimerWallet.toLowerCase()
      );
      if (!distEntry) {
        return res.status(404).json({ error: 'No distribution entry found for this wallet' });
      }

      // Update the distribution entry's txSignature
      await Pool.findOneAndUpdate(
        { _id: poolId, 'distributions.wallet': distEntry.wallet },
        {
          $set: {
            'distributions.$.txSignature': txSignature,
            'distributions.$.distributedAt': new Date(),
          },
        }
      );

      // Check if all distributions have been claimed
      const updatedPool = await Pool.findById(poolId);
      const allClaimed = updatedPool?.distributions?.every(
        (d: any) => d.txSignature && d.txSignature !== 'pending'
      );
      const windowExpired =
        updatedPool?.claimWindowExpiresAt && new Date() > updatedPool.claimWindowExpiresAt;

      if (allClaimed || windowExpired) {
        await finalizePool(poolId);
      }

      return res.status(200).json({
        success: true,
        message: 'Claim confirmed',
        txSignature,
        allClaimed,
        poolFinalized: allClaimed || windowExpired,
      });
    } catch (error: any) {
      console.error('[/api/pool/claim-distribution] PATCH Error:', error);
      return res.status(500).json({
        error: 'Failed to confirm claim',
        details: error?.message || 'Unknown error',
      });
    }
  }

  // ========== POST: Check/execute claim or admin actions ==========
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, claimerWallet, adminWallet, execute, action } = req.body;

    if (!poolId) {
      return res.status(400).json({ error: 'Missing required field: poolId' });
    }

    await dbConnect();
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // ========== Admin: Sweep unclaimed funds ==========
    if (action === 'sweep-unclaimed') {
      if (!adminWallet) {
        return res.status(400).json({ error: 'Missing required field: adminWallet' });
      }

      const adminConfig = getAdminConfig();
      if (!adminConfig.isAdmin(adminWallet)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Verify claim window has expired
      if (!pool.claimWindowExpiresAt || new Date() <= pool.claimWindowExpiresAt) {
        return res.status(400).json({
          error: 'Claim window has not yet expired',
          claimWindowExpiresAt: pool.claimWindowExpiresAt,
        });
      }

      // Sum unclaimed amounts
      const unclaimedTotal = (pool.distributions || [])
        .filter((d: any) => !d.txSignature || d.txSignature === 'pending')
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

      if (unclaimedTotal <= 0) {
        return res.status(400).json({ error: 'No unclaimed funds to sweep' });
      }

      // Record treasury deposit for unclaimed funds
      const treasuryWallet = getTreasury('pools');

      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          unclaimedSweptAt: new Date(),
          unclaimedSweptAmount: unclaimedTotal,
        },
      });

      // Finalize pool (includes on-chain burn per D-11)
      await finalizePool(poolId);

      return res.status(200).json({
        success: true,
        action: 'sweep-unclaimed',
        unclaimedAmount: unclaimedTotal,
        treasuryWallet,
        message: `$${unclaimedTotal.toFixed(2)} unclaimed funds swept to pools treasury. Pool finalized.`,
      });
    }

    // ========== Admin: Retry burn ==========
    if (action === 'retry-burn') {
      if (!adminWallet) {
        return res.status(400).json({ error: 'Missing required field: adminWallet' });
      }

      const adminConfig = getAdminConfig();
      if (!adminConfig.isAdmin(adminWallet)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      if (pool.tokenStatus !== 'burn_pending') {
        return res.status(400).json({
          error: `Token burn retry only available for burn_pending status. Current: ${pool.tokenStatus}`,
        });
      }

      const burnResult = await burnPoolTokens(pool);

      if (burnResult.success) {
        await Pool.findByIdAndUpdate(poolId, {
          $set: {
            tokenStatus: 'burned',
            burnTxSignature: burnResult.txSignature,
          },
        });

        return res.status(200).json({
          success: true,
          action: 'retry-burn',
          burnTxSignature: burnResult.txSignature,
          message: 'Token burn completed successfully.',
        });
      } else {
        return res.status(500).json({
          success: false,
          action: 'retry-burn',
          error: burnResult.error,
          message: 'Token burn failed again. Check admin keypair and mint authority.',
        });
      }
    }

    // ========== Regular claim flow ==========
    if (!claimerWallet) {
      return res.status(400).json({ error: 'Missing required field: claimerWallet' });
    }

    // Verify pool is in distributing or sold state
    const validStatuses = ['distributing', 'sold'];
    if (!validStatuses.includes(pool.status)) {
      return res.status(400).json({
        error: `Pool must be in distributing or sold status. Current: ${pool.status}`,
      });
    }

    const validDistStatuses = ['proposed', 'approved', 'executed'];
    if (pool.distributionStatus && !validDistStatuses.includes(pool.distributionStatus)) {
      return res.status(400).json({
        error: `Distribution must be proposed, approved, or executed. Current: ${pool.distributionStatus}`,
      });
    }

    // Verify claim window has not expired
    if (pool.claimWindowExpiresAt && new Date() > pool.claimWindowExpiresAt) {
      return res.status(400).json({
        error: 'Claim window has expired',
        claimWindowExpiresAt: pool.claimWindowExpiresAt,
        message: 'Contact admin to sweep unclaimed funds.',
      });
    }

    // Find claimer in distributions (case-insensitive)
    const entry = pool.distributions?.find(
      (d: any) => d.wallet?.toLowerCase() === claimerWallet.toLowerCase()
    );

    if (!entry) {
      return res.status(404).json({
        error: 'No distribution found for this wallet',
        wallet: claimerWallet,
      });
    }

    // Check if already claimed
    if (entry.txSignature && entry.txSignature !== 'pending') {
      return res.status(400).json({
        error: 'Distribution already claimed',
        txSignature: entry.txSignature,
        distributedAt: entry.distributedAt,
      });
    }

    // If execute flag, mark as pending claim
    if (execute) {
      // Prevent double-execute
      if (entry.txSignature === 'pending') {
        return res.status(400).json({
          error: 'Claim already in progress. Use PATCH to confirm with txSignature.',
        });
      }

      await Pool.findOneAndUpdate(
        { _id: poolId, 'distributions.wallet': entry.wallet },
        {
          $set: {
            'distributions.$.txSignature': 'pending',
            'distributions.$.distributedAt': new Date(),
          },
        }
      );

      return res.status(200).json({
        success: true,
        executed: true,
        claimableAmount: entry.amount,
        ownershipPercent: entry.ownershipPercent,
        wallet: entry.wallet,
        poolId,
        message:
          'Claim marked as pending. Client should sign the SOL transfer, then PATCH with txSignature.',
        nextStep: 'PATCH /api/pool/claim-distribution with { poolId, claimerWallet, txSignature }',
      });
    }

    // Default: return claimable amount without executing
    return res.status(200).json({
      success: true,
      executed: false,
      claimableAmount: entry.amount,
      ownershipPercent: entry.ownershipPercent,
      wallet: entry.wallet,
      poolId,
      claimWindowExpiresAt: pool.claimWindowExpiresAt,
    });
  } catch (error: any) {
    console.error('[/api/pool/claim-distribution] Error:', error);
    return res.status(500).json({
      error: 'Failed to process claim',
      details: error?.message || 'Unknown error',
    });
  }
}

export default withErrorMonitoring(handler);
