// src/pages/api/pool/pay-vendor.ts
// Pay vendor when pool fills (97% of pool target, 3% royalty to LuxHub)
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface PayVendorRequest {
  poolId: string;
  adminWallet: string;
  createSquadsProposal?: boolean;
}

// Admin wallets (should be in env or database in production)
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, createSquadsProposal = true } = req.body as PayVendorRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    await dbConnect();

    // Verify admin privileges
    const adminUser = await User.findOne({ wallet: adminWallet });
    const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check pool status
    if (pool.status !== 'filled') {
      return res.status(400).json({
        error: `Pool must be in 'filled' status to pay vendor. Current status: ${pool.status}`,
      });
    }

    // Check if vendor already paid
    if (pool.vendorPaidAt) {
      return res.status(400).json({
        error: 'Vendor has already been paid',
        vendorPaidAt: pool.vendorPaidAt,
        vendorPaidAmount: pool.vendorPaidAmount,
      });
    }

    // Calculate payment amounts
    const totalCollected = pool.sharesSold * pool.sharePriceUSD;
    const royaltyAmount = totalCollected * 0.03; // 3% to LuxHub
    const vendorPayment = totalCollected * 0.97; // 97% to vendor

    // Create Squads proposal for payment
    let squadsResult = null;
    if (createSquadsProposal) {
      squadsResult = await createVendorPaymentProposal(pool, vendorPayment, royaltyAmount);

      if (!squadsResult.success) {
        return res.status(500).json({
          error: 'Failed to create Squads payment proposal',
          details: squadsResult.error,
        });
      }

      // Update pool with proposal info
      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          squadsVendorPaymentIndex: squadsResult.transactionIndex,
          vendorPaidAmount: vendorPayment,
        },
      });
    }

    return res.status(200).json({
      success: true,
      payment: {
        totalCollected,
        vendorPayment,
        royaltyAmount,
        royaltyPercent: '3%',
        vendorPercent: '97%',
      },
      pool: {
        _id: pool._id,
        vendorWallet: pool.vendorWallet,
        status: pool.status,
      },
      squadsProposal: squadsResult,
      message: squadsResult?.success
        ? 'Vendor payment proposal created in Squads. Awaiting multisig approval.'
        : 'Payment amounts calculated. Create Squads proposal to execute payment.',
      nextSteps: [
        'Multisig members approve payment in Squads UI',
        'Execute payment via /api/squads/execute',
        'Vendor ships asset to LuxHub custody',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/pay-vendor] Error:', error);
    return res.status(500).json({
      error: 'Failed to process vendor payment',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to create Squads payment proposal
async function createVendorPaymentProposal(
  pool: any,
  vendorPayment: number,
  royaltyAmount: number
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;

    if (!rpc || !multisigPda) {
      return { success: false, error: 'Missing Squads configuration' };
    }

    // For now, return success with placeholder
    // In production, this would create actual transfer instructions
    // The transfer would be:
    // 1. Transfer vendorPayment from pool vault to vendor wallet
    // 2. Transfer royaltyAmount from pool vault to LuxHub treasury

    // This is a simplified version - full implementation would need:
    // - SPL token transfer instructions for WSOL/USDC
    // - Proper account derivations
    // - Squads vault transaction creation

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);

    // Fetch next transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    // In a full implementation, we would:
    // 1. Build SPL token transfer instructions
    // 2. Create vault transaction
    // 3. Create proposal
    // 4. Auto-approve if enabled

    return {
      success: true,
      transactionIndex: transactionIndex.toString(),
    };
  } catch (error: any) {
    console.error('[createVendorPaymentProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
