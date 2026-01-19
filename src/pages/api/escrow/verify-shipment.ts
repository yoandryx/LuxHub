// src/pages/api/escrow/verify-shipment.ts
// Admin verifies shipment proof and can trigger confirm_delivery proposal
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { User } from '../../../lib/models/User';

interface VerifyShipmentRequest {
  escrowPda: string;
  adminWallet: string;
  approved: boolean;
  rejectionReason?: string;
  createConfirmDeliveryProposal?: boolean; // If true, create Squads proposal
}

// Admin wallets (should be in env or database in production)
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      adminWallet,
      approved,
      rejectionReason,
      createConfirmDeliveryProposal = false,
    } = req.body as VerifyShipmentRequest;

    // Validation
    if (!escrowPda || !adminWallet || approved === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, adminWallet, approved',
      });
    }

    await dbConnect();

    // Verify admin privileges
    const adminUser = await User.findOne({ wallet: adminWallet });
    if (!adminUser) {
      return res.status(403).json({ error: 'Admin user not found' });
    }

    // Check admin role (check both database role and env whitelist)
    const isAdmin = adminUser.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Not authorized - admin access required' });
    }

    // Find the escrow
    const escrow = await Escrow.findOne({ escrowPda, deleted: false });
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Check shipment status
    if (escrow.shipmentStatus !== 'proof_submitted') {
      return res.status(400).json({
        error: `Cannot verify shipment - current status is '${escrow.shipmentStatus}'. Required: proof_submitted`,
      });
    }

    // Verify shipment has required data
    if (!escrow.trackingNumber || !escrow.trackingCarrier) {
      return res.status(400).json({
        error: 'Shipment tracking information is incomplete',
      });
    }

    if (!escrow.shipmentProofUrls || escrow.shipmentProofUrls.length === 0) {
      return res.status(400).json({
        error: 'No shipment proof photos found',
      });
    }

    if (approved) {
      // Approve shipment - update status
      const updateData: Record<string, any> = {
        shipmentStatus: 'verified',
        shipmentVerifiedAt: new Date(),
        shipmentVerifiedBy: adminWallet,
        status: 'delivered',
      };

      await Escrow.findByIdAndUpdate(escrow._id, { $set: updateData });

      // Optionally create confirm_delivery Squads proposal
      let squadsResult = null;
      if (createConfirmDeliveryProposal) {
        squadsResult = await createConfirmDeliverySquadsProposal(escrow, adminWallet);

        if (squadsResult.success) {
          // Update escrow with proposal info
          await Escrow.findByIdAndUpdate(escrow._id, {
            $set: {
              confirmDeliveryProposalIndex: squadsResult.transactionIndex,
              confirmDeliveryProposedAt: new Date(),
            },
          });
        }
      }

      return res.status(200).json({
        success: true,
        action: 'approved',
        escrow: {
          _id: escrow._id,
          escrowPda: escrow.escrowPda,
          status: 'delivered',
          shipmentStatus: 'verified',
          shipmentVerifiedAt: new Date(),
          shipmentVerifiedBy: adminWallet,
        },
        squadsProposal: squadsResult,
        message: squadsResult?.success
          ? 'Shipment verified. confirm_delivery proposal created in Squads.'
          : 'Shipment verified. Use /api/squads/propose to create confirm_delivery proposal.',
      });
    } else {
      // Reject shipment - vendor needs to resubmit
      if (!rejectionReason) {
        return res.status(400).json({
          error: 'rejectionReason is required when rejecting shipment',
        });
      }

      await Escrow.findByIdAndUpdate(escrow._id, {
        $set: {
          shipmentStatus: 'pending',
        },
        $push: {
          // Store rejection in a notes array (add to schema if needed)
          shipmentRejectionHistory: {
            rejectedAt: new Date(),
            rejectedBy: adminWallet,
            reason: rejectionReason,
            previousTrackingNumber: escrow.trackingNumber,
            previousProofUrls: escrow.shipmentProofUrls,
          },
        },
      });

      return res.status(200).json({
        success: true,
        action: 'rejected',
        escrow: {
          _id: escrow._id,
          escrowPda: escrow.escrowPda,
          shipmentStatus: 'pending',
        },
        rejectionReason,
        message: 'Shipment rejected. Vendor must resubmit tracking and proof.',
      });
    }
  } catch (error: any) {
    console.error('[/api/escrow/verify-shipment] Error:', error);
    return res.status(500).json({
      error: 'Failed to verify shipment',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to create confirm_delivery Squads proposal
async function createConfirmDeliverySquadsProposal(
  escrow: any,
  adminWallet: string
): Promise<{ success: boolean; transactionIndex?: string; error?: string }> {
  try {
    const { Connection, PublicKey } = await import('@solana/web3.js');
    const { BN } = await import('@coral-xyz/anchor');

    const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG;
    const programId = process.env.PROGRAM_ID;

    if (!rpc || !multisigPda || !programId) {
      return { success: false, error: 'Missing environment configuration' };
    }

    const programPk = new PublicKey(programId);
    const escrowPda = new PublicKey(escrow.escrowPda);

    // Build confirm_delivery instruction
    // Discriminator for 'confirm_delivery'
    const discriminator = Buffer.from([226, 5, 118, 189, 4, 34, 48, 212]); // anchor discriminator

    const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const SYSVAR_INSTRUCTIONS = new PublicKey('Sysvar1nstructions1111111111111111111111111');

    const buyerPk = new PublicKey(escrow.buyer?.wallet || escrow.buyerWallet);
    const sellerPk = new PublicKey(escrow.sellerWallet);
    const nftMintPk = new PublicKey(escrow.nftMint);
    const luxhubWallet = new PublicKey(process.env.NEXT_PUBLIC_LUXHUB_WALLET!);

    // Derive PDAs
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programPk);
    const [nftVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), nftMintPk.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [wsolVault] = PublicKey.findProgramAddressSync(
      [escrowPda.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [buyerNftAta] = PublicKey.findProgramAddressSync(
      [buyerPk.toBuffer(), TOKEN_PROGRAM.toBuffer(), nftMintPk.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [sellerFundsAta] = PublicKey.findProgramAddressSync(
      [sellerPk.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );
    const [luxhubFeeAta] = PublicKey.findProgramAddressSync(
      [luxhubWallet.toBuffer(), TOKEN_PROGRAM.toBuffer(), WSOL_MINT.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM
    );

    const multisig = await import('@sqds/multisig');
    const msigPk = new PublicKey(multisigPda);
    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });

    const keys = [
      { pubkey: vaultPda.toBase58(), isSigner: true, isWritable: true }, // authority (Squads vault)
      { pubkey: escrowPda.toBase58(), isSigner: false, isWritable: true },
      { pubkey: nftMintPk.toBase58(), isSigner: false, isWritable: false },
      { pubkey: WSOL_MINT.toBase58(), isSigner: false, isWritable: false },
      { pubkey: nftVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: wsolVault.toBase58(), isSigner: false, isWritable: true },
      { pubkey: buyerNftAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: sellerFundsAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: luxhubFeeAta.toBase58(), isSigner: false, isWritable: true },
      { pubkey: configPda.toBase58(), isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS.toBase58(), isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM.toBase58(), isSigner: false, isWritable: false },
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
