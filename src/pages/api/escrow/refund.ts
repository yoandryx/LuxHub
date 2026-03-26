// src/pages/api/escrow/refund.ts
// Initiate a refund: returns USDC to buyer, NFT to seller
// Creates a Squads proposal for the refund_buyer instruction
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Asset } from '../../../lib/models/Assets';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { notifyOrderRefunded } from '../../../lib/services/notificationService';

interface RefundRequest {
  escrowId?: string;
  escrowPda?: string;
  wallet: string; // Admin wallet initiating the refund
  reason?: string; // Reason for refund
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowId, escrowPda, wallet, reason } = req.body as RefundRequest;

    // Validation
    if ((!escrowId && !escrowPda) || !wallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowId or escrowPda) and wallet',
      });
    }

    await dbConnect();

    // Verify admin authorization
    const adminConfig = getAdminConfig();
    const isEnvAdmin = adminConfig.isAdmin(wallet);
    const isEnvSuperAdmin = adminConfig.isSuperAdmin(wallet);
    const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });

    const isAuthorized =
      isEnvSuperAdmin ||
      isEnvAdmin ||
      dbAdmin?.permissions?.canManageEscrows ||
      dbAdmin?.role === 'super_admin';

    if (!isAuthorized) {
      return res.status(403).json({
        error: 'Admin authorization required to initiate refunds',
        code: 'ADMIN_REQUIRED',
      });
    }

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

    // Must be funded (buyer has deposited) and not already completed/cancelled
    const refundableStatuses = ['funded', 'shipped'];
    if (!refundableStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot refund. Escrow must be funded or shipped. Current status: ${escrow.status}`,
      });
    }

    if (!escrow.buyerWallet) {
      return res.status(400).json({
        error: 'No buyer associated with this escrow',
      });
    }

    // Update escrow status to cancelled
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: reason || 'Refund initiated by admin',
          refundProposedAt: new Date(),
          refundedAmount: escrow.fundedAmount || escrow.listingPrice,
        },
      },
      { new: true }
    );

    // Get asset info
    const asset = escrow.asset || (await Asset.findById(escrow.asset));
    const assetTitle = asset?.title || asset?.model || 'Luxury item';

    // Auto-create Squads refund_buyer proposal for on-chain execution
    let squadsResult = null;
    try {
      squadsResult = await createRefundSquadsProposal(escrow, wallet);

      if (squadsResult.success) {
        await Escrow.findByIdAndUpdate(updatedEscrow._id, {
          $set: {
            refundProposalIndex: squadsResult.transactionIndex,
            refundProposedAt: new Date(),
          },
        });
      } else {
        console.error('[/api/escrow/refund] Squads proposal failed:', squadsResult.error);
      }
    } catch (squadsError) {
      console.error('[/api/escrow/refund] Squads proposal error:', squadsError);
    }

    // Send notifications
    try {
      await notifyOrderRefunded({
        buyerWallet: escrow.buyerWallet,
        vendorWallet: escrow.sellerWallet,
        escrowId: updatedEscrow._id.toString(),
        escrowPda: updatedEscrow.escrowPda,
        assetTitle,
        amountUSD: updatedEscrow.listingPriceUSD || 0,
        reason,
      });
    } catch (notifyError) {
      console.error('[/api/escrow/refund] Notification error:', notifyError);
    }

    return res.status(200).json({
      success: true,
      message: squadsResult?.success
        ? 'Refund initiated. Squads refund_buyer proposal created.'
        : 'Refund initiated. Squads proposal creation failed — manual action required.',
      refund: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        nftMint: updatedEscrow.nftMint,
        buyerWallet: updatedEscrow.buyerWallet,
        sellerWallet: updatedEscrow.sellerWallet,
        refundAmount: updatedEscrow.fundedAmount || updatedEscrow.listingPrice,
        amountUSD: updatedEscrow.listingPriceUSD,
        status: updatedEscrow.status,
        reason: reason || 'Admin-initiated refund',
      },
      squadsProposal: squadsResult,
      asset: asset
        ? {
            title: asset.title || asset.model,
            brand: asset.brand,
          }
        : null,
      nextSteps: squadsResult?.success
        ? [
            'Squads refund_buyer proposal created',
            'Multisig members must approve the proposal',
            'Execute proposal to return USDC to buyer',
            'NFT returns to seller wallet automatically',
            'Both parties notified of completion',
          ]
        : [
            'Manual Squads proposal needed for refund',
            'Use /api/squads/propose to create refund_buyer proposal',
            'Multisig members approve, then execute',
          ],
    });
  } catch (error: any) {
    console.error('[/api/escrow/refund] Error:', error);
    return res.status(500).json({
      error: 'Failed to initiate refund',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to create refund_buyer Squads proposal for on-chain execution
async function createRefundSquadsProposal(
  escrow: any,
  _adminWallet: string
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const { PublicKey } = await import('@solana/web3.js');
    const { buildRefundBuyerKeys } = await import('../../../lib/services/squadsTransferService');
    const { getClusterConfig } = await import('../../../lib/solana/clusterConfig');

    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
    const programId = process.env.PROGRAM_ID;

    if (!multisigPda || !programId) {
      return {
        success: false,
        error: 'Missing environment configuration (SQUADS_MSIG or PROGRAM_ID)',
      };
    }

    const programPk = new PublicKey(programId);
    const escrowPda = new PublicKey(escrow.escrowPda);
    const buyerPk = new PublicKey(escrow.buyer?.wallet || escrow.buyerWallet);
    const sellerPk = new PublicKey(escrow.sellerWallet);
    const nftMintPk = new PublicKey(escrow.nftMint);

    // Use correct USDC mint from cluster config (NOT hardcoded WSOL)
    const fundsMintPk = new PublicKey(escrow.paymentMint || getClusterConfig().usdcMint);

    // Derive Squads vault PDA
    const multisig = await import('@sqds/multisig');
    const msigPk = new PublicKey(multisigPda);
    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });

    // Use the correct key builder (12 accounts, IDL-matched order)
    const accountKeys = buildRefundBuyerKeys(
      escrowPda, fundsMintPk, nftMintPk, buyerPk, sellerPk, vaultPda
    );

    // refund_buyer discriminator from IDL
    const discriminator = Buffer.from([199, 139, 203, 146, 192, 150, 53, 218]);

    const keys = accountKeys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    }));

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
      return { success: false, error: proposeResult.error || 'Failed to create refund proposal' };
    }

    return {
      success: true,
      transactionIndex: proposeResult.transactionIndex,
    };
  } catch (error: any) {
    console.error('[createRefundSquadsProposal] Error:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
