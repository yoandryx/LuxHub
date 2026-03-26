// src/pages/api/escrow/confirm-delivery.ts
// Buyer confirms delivery of the item, triggering fund release via Squads proposal
// Can also be triggered by admin for dispute resolution
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import AdminRole from '../../../lib/models/AdminRole';
import { notifyDeliveryConfirmed } from '../../../lib/services/notificationService';
import { Transaction } from '../../../lib/models/Transaction';
import { strictLimiter } from '../../../lib/middleware/rateLimit';
import { getTreasury } from '../../../lib/config/treasuryConfig';
import { verifyTransactionEnhanced } from '../../../lib/services/txVerification';
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface ConfirmDeliveryRequest {
  escrowId?: string;
  escrowPda?: string;
  wallet: string; // Buyer wallet or admin wallet
  confirmationType: 'buyer' | 'admin'; // Who is confirming
  deliveryNotes?: string; // Optional notes
  rating?: number; // Optional 1-5 rating for vendor
  reviewText?: string; // Optional review
  txSignature?: string; // Optional on-chain TX proof for delivery confirmation
}

async function _handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowId,
      escrowPda,
      wallet,
      confirmationType = 'buyer',
      deliveryNotes,
      rating,
      reviewText,
      txSignature,
    } = req.body as ConfirmDeliveryRequest;

    // Validation
    if ((!escrowId && !escrowPda) || !wallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowId or escrowPda) and wallet',
      });
    }

    await dbConnect();

    // Find the escrow
    let escrow;
    if (escrowId) {
      escrow = await Escrow.findById(escrowId).populate('asset');
    } else if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false }).populate('asset');
    }

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify authorization
    let isAuthorized = false;
    let confirmedBy = 'buyer';

    if (confirmationType === 'buyer') {
      // Buyer must match
      isAuthorized = escrow.buyerWallet === wallet;
      confirmedBy = 'buyer';
    } else if (confirmationType === 'admin') {
      // Check admin permissions
      const adminConfig = getAdminConfig();
      const isEnvAdmin = adminConfig.isAdmin(wallet);
      const isEnvSuperAdmin = adminConfig.isSuperAdmin(wallet);
      const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });

      isAuthorized =
        isEnvSuperAdmin ||
        isEnvAdmin ||
        dbAdmin?.permissions?.canManageEscrows ||
        dbAdmin?.role === 'super_admin';

      confirmedBy = 'admin';
    }

    if (!isAuthorized) {
      return res.status(403).json({
        error:
          confirmationType === 'buyer'
            ? 'Only the buyer can confirm delivery'
            : 'Admin access required',
      });
    }

    // ========== ON-CHAIN TX VERIFICATION (per D-17, matches purchase.ts pattern) ==========
    // When txSignature is provided, verify the caller signed an on-chain transaction
    // This adds proof-of-action for admin confirm_delivery calls
    if (txSignature) {
      const txResult = await verifyTransactionEnhanced({
        txSignature,
        expectedWallet: wallet,
        endpoint: '/api/escrow/confirm-delivery',
      });
      if (!txResult.verified) {
        return res.status(400).json({
          error: 'Transaction verification failed',
          details: txResult.error,
          message: 'The on-chain transaction could not be verified.',
        });
      }
    }

    // Check escrow status - must be shipped
    const validStatuses = ['shipped', 'in_transit', 'delivered'];
    if (!validStatuses.includes(escrow.status) && !validStatuses.includes(escrow.shipmentStatus)) {
      return res.status(400).json({
        error: `Cannot confirm delivery. Item must be shipped first. Current status: ${escrow.status}`,
      });
    }

    // Update escrow to delivered/released
    const updateData: any = {
      status: 'delivered',
      shipmentStatus: 'verified',
      shipmentVerifiedAt: new Date(),
      shipmentVerifiedBy: wallet,
      actualDeliveryDate: new Date(),
    };

    // Store delivery notes if provided
    if (deliveryNotes) {
      updateData.deliveryNotes = deliveryNotes;
    }

    // Store confirmation metadata
    updateData.deliveryConfirmation = {
      confirmedBy: wallet,
      confirmationType: confirmedBy,
      confirmedAt: new Date(),
      rating: rating || null,
      reviewText: reviewText || null,
    };

    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      { $set: updateData },
      { new: true }
    );

    // Get asset info for response
    const asset = escrow.asset || (await Asset.findById(escrow.asset));
    const assetTitle = asset?.title || asset?.model || 'Luxury item';

    // Auto-create Squads confirm_delivery proposal for on-chain fund release
    let squadsResult = null;
    try {
      squadsResult = await createConfirmDeliverySquadsProposal(escrow, wallet);

      if (squadsResult.success) {
        await Escrow.findByIdAndUpdate(escrow._id, {
          $set: {
            confirmDeliveryProposalIndex: squadsResult.transactionIndex,
            confirmDeliveryProposedAt: new Date(),
          },
        });
      } else {
        console.error('[confirm-delivery] Squads proposal failed:', squadsResult.error);
      }
    } catch (squadsError) {
      console.error('[confirm-delivery] Squads proposal error:', squadsError);
    }

    // Record fund-release transaction
    Transaction.create({
      type: 'sale',
      escrow: updatedEscrow._id,
      asset: escrow.asset?._id || escrow.asset,
      fromWallet: updatedEscrow.escrowPda,
      toWallet: updatedEscrow.sellerWallet,
      amountUSD: updatedEscrow.listingPriceUSD || 0,
      vendorEarningsUSD: (updatedEscrow.listingPriceUSD || 0) * 0.97,
      luxhubRoyaltyUSD: (updatedEscrow.listingPriceUSD || 0) * 0.03,
      status: 'success',
    }).catch((err: any) => console.error('[confirm-delivery] Transaction record error:', err));

    // Notify both buyer and vendor that delivery was confirmed
    if (escrow.buyerWallet && escrow.sellerWallet) {
      notifyDeliveryConfirmed({
        buyerWallet: escrow.buyerWallet,
        vendorWallet: escrow.sellerWallet,
        escrowId: updatedEscrow._id.toString(),
        escrowPda: updatedEscrow.escrowPda,
        assetTitle,
      }).catch((notifyError: any) =>
        console.error('[confirm-delivery] Notification error:', notifyError)
      );
    }

    // Auto-trigger pool distribution if this escrow is linked to a pool
    // This is blocking — we wait for it before responding
    let poolDistribution = null;
    if (escrow.poolId) {
      try {
        poolDistribution = await triggerPoolDistribution(escrow);
        if (!poolDistribution?.success) {
          // Pool distribution returned failure
        }
      } catch (poolError) {
        console.error('[confirm-delivery] Pool distribution trigger error:', poolError);
        poolDistribution = { success: false, error: (poolError as Error).message };
        // Also update pool to reflect the failed distribution attempt
        try {
          const { Pool } = await import('../../../lib/models/Pool');
          await Pool.findByIdAndUpdate(escrow.poolId, {
            $set: { distributionStatus: 'pending' },
          });
        } catch {
          /* non-blocking */
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: squadsResult?.success
        ? 'Delivery confirmed. Squads confirm_delivery proposal created for fund release.'
        : 'Delivery confirmed. Squads proposal creation failed — manual action required.',
      delivery: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        nftMint: updatedEscrow.nftMint,
        status: updatedEscrow.status,
        shipmentStatus: updatedEscrow.shipmentStatus,
        confirmedBy: wallet,
        confirmationType: confirmedBy,
        confirmedAt: new Date(),
      },
      transaction: {
        buyerWallet: updatedEscrow.buyerWallet,
        sellerWallet: updatedEscrow.sellerWallet,
        amount: updatedEscrow.fundedAmount || updatedEscrow.listingPrice,
        amountUSD: updatedEscrow.listingPriceUSD,
        royaltyAmount: updatedEscrow.royaltyAmount,
      },
      squadsProposal: squadsResult,
      poolDistribution,
      asset: asset
        ? {
            title: asset.title || asset.model,
            brand: asset.brand,
          }
        : null,
      nextSteps: squadsResult?.success
        ? [
            'Squads confirm_delivery proposal created',
            'Multisig members must approve the proposal',
            'Execute proposal to release USDC (97% seller, 3% treasury)',
            'NFT transferred to buyer automatically',
          ]
        : [
            'Manual Squads proposal needed for fund release',
            'Use /api/squads/propose to create confirm_delivery proposal',
            'Multisig members approve, then execute',
          ],
    });
  } catch (error: any) {
    console.error('[/api/escrow/confirm-delivery] Error:', error);
    return res.status(500).json({
      error: 'Failed to confirm delivery',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to create confirm_delivery Squads proposal for on-chain fund release
async function createConfirmDeliverySquadsProposal(
  escrow: any,
  _adminWallet: string
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const { PublicKey, SystemProgram } = await import('@solana/web3.js');

    const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
    const programId = process.env.PROGRAM_ID;

    if (!rpc || !multisigPda || !programId) {
      return {
        success: false,
        error: 'Missing environment configuration (RPC, SQUADS_MSIG, or PROGRAM_ID)',
      };
    }

    const programPk = new PublicKey(programId);
    const escrowPda = new PublicKey(escrow.escrowPda);

    // confirm_delivery discriminator from IDL
    const discriminator = Buffer.from([11, 109, 227, 53, 179, 190, 88, 155]);

    const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

    const buyerPk = new PublicKey(escrow.buyer?.wallet || escrow.buyerWallet);
    const sellerPk = new PublicKey(escrow.sellerWallet);
    const nftMintPk = new PublicKey(escrow.nftMint);
    const luxhubWallet = new PublicKey(getTreasury('marketplace'));

    // Correct mint ordering: mint_a = funds (USDC), mint_b = NFT
    // The escrow stores fundsMint (mint_a) and nftMint (mint_b)
    // Use USDC mint from cluster config as the funds mint
    const { getClusterConfig } = await import('../../../lib/solana/clusterConfig');
    const fundsMintPk = new PublicKey(escrow.paymentMint || getClusterConfig().usdcMint);

    // Derive PDAs - vault addresses are ATAs of escrow PDA (allowOwnerOffCurve = true)
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], programPk);
    const nftVault = getAssociatedTokenAddressSync(nftMintPk, escrowPda, true);
    const wsolVault = getAssociatedTokenAddressSync(fundsMintPk, escrowPda, true);
    const buyerNftAta = getAssociatedTokenAddressSync(nftMintPk, buyerPk, false);
    const sellerFundsAta = getAssociatedTokenAddressSync(fundsMintPk, sellerPk, false);
    const luxhubFeeAta = getAssociatedTokenAddressSync(fundsMintPk, luxhubWallet, false);

    const multisig = await import('@sqds/multisig');
    const msigPk = new PublicKey(multisigPda);
    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });

    // Account keys matching confirm_delivery IDL order (updated for new account layout):
    // escrow, config, buyer_nft_ata, nft_vault, wsol_vault,
    // mint_a (funds/USDC), mint_b (NFT),
    // seller_funds_ata, luxhub_fee_ata, seller (NEW - receives rent from closed escrow),
    // authority, instructions_sysvar, token_program,
    // associated_token_program (NEW), system_program (NEW)
    const keys = [
      { pubkey: escrowPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: configPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: buyerNftAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: nftVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: wsolVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: fundsMintPk.toBase58(), isSigner: false, isWritable: false },
      { pubkey: nftMintPk.toBase58(), isSigner: false, isWritable: false },
      { pubkey: sellerFundsAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: luxhubFeeAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: sellerPk.toBase58(), isSigner: false, isWritable: true },
      { pubkey: vaultPda.toBase58(), isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId.toBase58(), isSigner: false, isWritable: false },
    ];

    // Call Squads propose API
    const proposeResponse = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/squads/propose`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId: programPk.toBase58(),
          keys,
          dataBase64: discriminator.toString('base64'),
          vaultIndex: 0,
          autoApprove: true,
        }),
      }
    );

    const proposeResult = await proposeResponse.json();

    if (!proposeResponse.ok) {
      return { success: false, error: proposeResult.error || 'Failed to create proposal' };
    }

    return {
      success: true,
      transactionIndex: proposeResult.transactionIndex,
    };
  } catch (error: any) {
    console.error('[createConfirmDeliverySquadsProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

// Auto-trigger pool distribution when a pool-linked escrow completes
async function triggerPoolDistribution(
  escrow: any
): Promise<{ success: boolean; message?: string; error?: string }> {
  const { Pool } = await import('../../../lib/models/Pool');
  const { buildMultiTransferProposal, getTopTokenHolders } =
    await import('../../../lib/services/squadsTransferService');

  const pool = await Pool.findById(escrow.poolId);
  if (!pool) {
    return { success: false, error: 'Linked pool not found' };
  }

  // Only distribute if pool is in a distributable state
  // Pool should be 'listed' (relisted for resale) or 'sold'
  if (!['listed', 'sold', 'custody'].includes(pool.status)) {
    return { success: false, error: `Pool status "${pool.status}" not eligible for distribution` };
  }

  // Don't double-distribute
  if (pool.distributionStatus && pool.distributionStatus !== 'pending') {
    return { success: false, error: `Distribution already ${pool.distributionStatus}` };
  }

  // Get resale price from the escrow that just completed
  const resalePriceUSD = escrow.listingPriceUSD || escrow.fundedAmount || 0;
  if (resalePriceUSD <= 0) {
    return { success: false, error: 'No resale price found on escrow' };
  }

  // Update pool to 'sold' with resale info
  await Pool.findByIdAndUpdate(pool._id, {
    $set: {
      status: 'sold',
      resaleSoldPriceUSD: resalePriceUSD,
      resaleSoldAt: new Date(),
      resaleBuyerWallet: escrow.buyerWallet,
      resaleEscrowId: escrow._id,
    },
  });

  // Calculate distribution
  const royaltyAmount = resalePriceUSD * 0.03;
  const distributionPool = resalePriceUSD * 0.97;

  // Get token holders
  let distributions: { wallet: string; ownershipPercent: number; amount: number }[];

  if (pool.bagsTokenMint) {
    const holders = await getTopTokenHolders(pool.bagsTokenMint, 200);
    if (holders.length === 0) {
      return { success: false, error: 'No token holders found' };
    }
    distributions = holders.map((h: any) => ({
      wallet: h.wallet,
      ownershipPercent: h.ownershipPercent,
      amount: distributionPool * (h.ownershipPercent / 100),
    }));
  } else {
    // Fallback to MongoDB participants
    distributions = (pool.participants || []).map((p: any) => {
      const pct = pool.totalShares > 0 ? (p.shares / pool.totalShares) * 100 : 0;
      return {
        wallet: p.wallet,
        ownershipPercent: pct,
        amount: distributionPool * (pct / 100),
      };
    });
  }

  if (distributions.length === 0) {
    return { success: false, error: 'No investors to distribute to' };
  }

  // Build Squads distribution proposal
  const treasuryWallet = getTreasury('pools');

  const recipients = [
    ...distributions
      .filter((d) => d.amount > 0)
      .map((d) => ({
        wallet: d.wallet,
        amountUSD: d.amount,
        label: `Investor ${d.wallet.slice(0, 8)}... (${d.ownershipPercent.toFixed(1)}%)`,
      })),
    { wallet: treasuryWallet, amountUSD: royaltyAmount, label: 'Pools Treasury 3% royalty' },
  ];

  const squadsResult = await buildMultiTransferProposal(recipients, {
    autoApprove: true,
    memo: `Auto-distribution for pool ${pool._id} (resale $${resalePriceUSD.toFixed(2)})`,
  });

  // Update pool with distribution info
  await Pool.findByIdAndUpdate(pool._id, {
    $set: {
      distributionStatus: squadsResult.success ? 'proposed' : 'pending',
      distributionAmount: distributionPool,
      distributionRoyalty: royaltyAmount,
      ...(squadsResult.success && { squadsDistributionIndex: squadsResult.transactionIndex }),
      distributions: distributions.map((d) => ({
        wallet: d.wallet,
        ownershipPercent: d.ownershipPercent,
        amount: d.amount,
      })),
    },
  });

  return {
    success: squadsResult.success,
    message: squadsResult.success
      ? `Distribution proposal created for ${distributions.length} token holders ($${distributionPool.toFixed(2)} total)`
      : 'Distribution calculated but Squads proposal failed — manual action needed',
    error: squadsResult.success ? undefined : squadsResult.error,
  };
}

// Rate limit confirm-delivery: 5 per minute per IP
export default strictLimiter(_handler);
