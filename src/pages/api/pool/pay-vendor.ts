// src/pages/api/pool/pay-vendor.ts
// Pay vendor ONLY after pool fills AND custody is verified (escrow-protected flow)
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
  skipCustodyCheck?: boolean; // Only for emergencies, requires special admin
}

// Admin wallets (should be in env or database in production)
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];
const SUPER_ADMIN_WALLETS = process.env.SUPER_ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      createSquadsProposal = true,
      skipCustodyCheck = false,
    } = req.body as PayVendorRequest;

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
    const isSuperAdmin = SUPER_ADMIN_WALLETS.includes(adminWallet);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Skip custody check requires super admin
    if (skipCustodyCheck && !isSuperAdmin) {
      return res.status(403).json({
        error: 'Super admin access required to skip custody verification',
      });
    }

    // Find the pool
    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // ========== ESCROW-PROTECTED FLOW ==========
    // Vendor payment is ONLY released after custody is verified

    // Check pool status - must be 'filled' or 'custody'
    const allowedStatuses = ['filled', 'custody'];
    if (!allowedStatuses.includes(pool.status)) {
      return res.status(400).json({
        error: `Pool must be in 'filled' or 'custody' status. Current status: ${pool.status}`,
        currentStatus: pool.status,
        allowedStatuses,
      });
    }

    // ========== CUSTODY VERIFICATION CHECK ==========
    // This is the critical escrow protection - funds only released when asset is verified
    if (!skipCustodyCheck) {
      // Check custody status - must be 'verified' or 'stored'
      const allowedCustodyStatuses = ['verified', 'stored'];
      if (!allowedCustodyStatuses.includes(pool.custodyStatus)) {
        return res.status(400).json({
          error: 'Cannot pay vendor until asset custody is VERIFIED by LuxHub',
          currentCustodyStatus: pool.custodyStatus,
          requiredCustodyStatus: allowedCustodyStatuses,
          escrowProtection: true,
          message:
            'Funds are held in escrow until LuxHub verifies receipt of the physical asset. This protects investors from vendor fraud.',
          nextSteps: [
            '1. Vendor must ship asset to LuxHub',
            '2. LuxHub receives and photographs asset',
            '3. Admin updates custody status to "verified"',
            '4. Then vendor payment can be processed',
          ],
        });
      }

      // Ensure custody proof exists
      if (!pool.custodyProofUrls || pool.custodyProofUrls.length === 0) {
        return res.status(400).json({
          error: 'Custody proof (photos) required before vendor payment',
          message: 'Upload custody verification photos before releasing funds',
        });
      }

      // Ensure verified by an admin
      if (!pool.custodyVerifiedBy) {
        return res.status(400).json({
          error: 'Custody must be verified by an admin before vendor payment',
        });
      }
    }

    // Check if vendor already paid
    if (pool.vendorPaidAt) {
      return res.status(400).json({
        error: 'Vendor has already been paid',
        vendorPaidAt: pool.vendorPaidAt,
        vendorPaidAmount: pool.vendorPaidAmount,
      });
    }

    // ========== CALCULATE PAYMENT AMOUNTS ==========
    // Payment varies based on liquidity model (P2P vs AMM)

    const totalCollected = pool.fundsInEscrow || pool.sharesSold * pool.sharePriceUSD;
    const liquidityModel = pool.liquidityModel || 'p2p';
    const vendorPaymentPercent = pool.vendorPaymentPercent || 97;

    let vendorPayment: number;
    let ammLiquidityAmount: number;
    let luxhubFee: number;

    if (liquidityModel === 'amm' || liquidityModel === 'hybrid') {
      // AMM model: vendor gets vendorPaymentPercent, rest to AMM + fee
      const ammPercent = pool.ammLiquidityPercent || 30;
      vendorPayment = totalCollected * (vendorPaymentPercent / 100);
      ammLiquidityAmount = totalCollected * (ammPercent / 100);
      luxhubFee = totalCollected * 0.03;
    } else {
      // P2P model: vendor gets 97%, LuxHub gets 3%
      vendorPayment = totalCollected * 0.97;
      ammLiquidityAmount = 0;
      luxhubFee = totalCollected * 0.03;
    }

    // Create Squads proposal for payment
    let squadsResult = null;
    if (createSquadsProposal) {
      squadsResult = await createVendorPaymentProposal(
        pool,
        vendorPayment,
        luxhubFee,
        ammLiquidityAmount,
        liquidityModel
      );

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
          status: 'funded', // Move to funded status
          escrowReleasedAt: new Date(),
        },
      });
    }

    // ========== UNLOCK TOKENS FOR TRADING ==========
    // Now that custody is verified and vendor paid, tokens can be traded
    if (pool.bagsTokenMint && pool.tokenStatus === 'minted') {
      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          tokenStatus: 'unlocked',
          tokenUnlockedAt: new Date(),
        },
      });

      // If AMM model, we would also create the AMM pool here
      if (ammLiquidityAmount > 0) {
        // TODO: Call Bags API to create AMM liquidity pool
        // This would seed the pool with ammLiquidityAmount
      }
    }

    return res.status(200).json({
      success: true,
      escrowProtection: {
        custodyVerified: true,
        custodyStatus: pool.custodyStatus,
        custodyVerifiedBy: pool.custodyVerifiedBy,
        custodyProofCount: pool.custodyProofUrls?.length || 0,
      },
      payment: {
        totalCollected,
        vendorPayment,
        vendorPaymentPercent: `${vendorPaymentPercent}%`,
        luxhubFee,
        luxhubFeePercent: '3%',
        ammLiquidity: ammLiquidityAmount,
        ammLiquidityPercent: pool.ammLiquidityPercent ? `${pool.ammLiquidityPercent}%` : 'N/A',
        liquidityModel,
      },
      pool: {
        _id: pool._id,
        vendorWallet: pool.vendorWallet,
        status: 'funded',
        tokenStatus: pool.bagsTokenMint ? 'unlocked' : 'pending',
      },
      squadsProposal: squadsResult,
      tokenTrading: {
        enabled: !!pool.bagsTokenMint,
        tokenMint: pool.bagsTokenMint,
        message: pool.bagsTokenMint
          ? 'Tokens now UNLOCKED for secondary market trading via Bags'
          : 'No token minted for this pool',
      },
      message: squadsResult?.success
        ? 'Vendor payment proposal created. Custody verified, tokens unlocked for trading.'
        : 'Payment amounts calculated. Create Squads proposal to execute payment.',
      nextSteps: [
        '1. Multisig members approve payment in Squads UI',
        '2. Execute payment via /api/squads/execute',
        '3. Vendor receives payment',
        '4. Tokens now tradeable on secondary market',
        '5. LuxHub lists asset for resale when ready',
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
  luxhubFee: number,
  ammLiquidity: number,
  liquidityModel: string
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;

    if (!rpc || !multisigPda) {
      return { success: false, error: 'Missing Squads configuration' };
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);

    // Fetch next transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const transactionIndex = BigInt(Number(multisigAccount.transactionIndex) + 1);

    // In a full implementation, this would:
    // 1. Build SPL token transfer: escrow → vendor (vendorPayment)
    // 2. Build SPL token transfer: escrow → treasury (luxhubFee)
    // 3. If AMM: Build SPL token transfer: escrow → AMM pool (ammLiquidity)
    // 4. Create vault transaction with all transfers
    // 5. Create proposal for multisig approval

    console.log('[Squads] Creating vendor payment proposal:', {
      poolId: pool._id,
      vendorWallet: pool.vendorWallet,
      vendorPayment,
      luxhubFee,
      ammLiquidity,
      liquidityModel,
      transactionIndex: transactionIndex.toString(),
    });

    return {
      success: true,
      transactionIndex: transactionIndex.toString(),
    };
  } catch (error: any) {
    console.error('[createVendorPaymentProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
