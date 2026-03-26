// src/pages/api/escrow/cancel.ts
// Seller cancels an escrow listing and reclaims the NFT
// Only callable before a buyer deposits funds
//
// Vault addresses are PDA-derived ATAs of the escrow PDA:
//   nftVault  = getAssociatedTokenAddressSync(nftMint, escrowPda, true)
//   wsolVault = getAssociatedTokenAddressSync(fundsMint, escrowPda, true)
import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Asset } from '../../../lib/models/Assets';
import { strictLimiter } from '../../../lib/middleware/rateLimit';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import { getClusterConfig } from '../../../lib/solana/clusterConfig';

interface CancelRequest {
  escrowPda: string;
  sellerWallet: string;
  txSignature?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowPda, sellerWallet, txSignature } = req.body as CancelRequest;

    if (!escrowPda || !sellerWallet) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda and sellerWallet',
      });
    }

    await dbConnect();

    const escrow = await Escrow.findOne({ escrowPda, deleted: false }).populate('asset');
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Only seller can cancel
    if (escrow.sellerWallet !== sellerWallet) {
      return res.status(403).json({ error: 'Only the seller can cancel this listing' });
    }

    // Cannot cancel if buyer has already funded
    if (escrow.buyerWallet && ['funded', 'shipped', 'delivered'].includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot cancel. Escrow status: ${escrow.status}. A buyer has already funded this escrow.`,
      });
    }

    // Derive vault addresses for cancel_escrow instruction (ATA pattern)
    const escrowPdaPk = new PublicKey(escrowPda);
    const nftMintPk = new PublicKey(escrow.nftMint);
    const fundsMintPk = new PublicKey(escrow.paymentMint || getClusterConfig().usdcMint);
    const sellerPk = new PublicKey(sellerWallet);

    // PDA-derived ATA vaults (allowOwnerOffCurve = true for PDA owner)
    const nftVault = getAssociatedTokenAddressSync(nftMintPk, escrowPdaPk, true);
    const wsolVault = getAssociatedTokenAddressSync(fundsMintPk, escrowPdaPk, true);
    const sellerNftAta = getAssociatedTokenAddressSync(nftMintPk, sellerPk, false);

    // Update escrow status in MongoDB
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: sellerWallet,
          ...(txSignature && { lastTxSignature: txSignature }),
        },
      },
      { new: true }
    );

    // Update asset status back to available
    if (escrow.asset) {
      await Asset.findByIdAndUpdate(escrow.asset._id || escrow.asset, {
        $set: { status: 'available', escrowPda: null },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Escrow cancelled successfully',
      escrow: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        status: updatedEscrow.status,
      },
      // Return derived account addresses for client-side TX construction
      accounts: {
        seller: sellerPk.toBase58(),
        escrow: escrowPdaPk.toBase58(),
        nftVault: nftVault.toBase58(),
        wsolVault: wsolVault.toBase58(),
        sellerNftAta: sellerNftAta.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
        systemProgram: SystemProgram.programId.toBase58(),
      },
    });
  } catch (error: any) {
    console.error('[/api/escrow/cancel] Error:', error);
    return res.status(500).json({
      error: 'Failed to cancel escrow',
      details: error?.message || 'Unknown error',
    });
  }
}

// Rate limit cancellations: 5 per minute per IP
export default withErrorMonitoring(strictLimiter(handler));
