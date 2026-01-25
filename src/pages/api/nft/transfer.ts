// src/pages/api/nft/transfer.ts
// Handles NFT transfer and syncs ownership in MongoDB
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';

interface TransferRequest {
  mintAddress: string;
  newOwnerWallet: string;
  transactionSignature?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mintAddress, newOwnerWallet, transactionSignature } = req.body as TransferRequest;

  if (!mintAddress || !newOwnerWallet) {
    return res.status(400).json({ error: 'Missing required fields: mintAddress, newOwnerWallet' });
  }

  // Validate Solana address format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(newOwnerWallet)) {
    return res.status(400).json({ error: 'Invalid Solana wallet address' });
  }

  try {
    await dbConnect();

    // Find and update the asset
    const asset = await Asset.findOneAndUpdate(
      { nftMint: mintAddress },
      {
        nftOwnerWallet: newOwnerWallet,
        $push: {
          transferHistory: {
            to: newOwnerWallet,
            transactionSignature,
            transferredAt: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.status(200).json({
      success: true,
      asset: {
        nftMint: asset.nftMint,
        nftOwnerWallet: asset.nftOwnerWallet,
        status: asset.status,
      },
    });
  } catch (error: any) {
    console.error('[/api/nft/transfer] Error:', error);
    return res.status(500).json({
      error: 'Failed to update transfer',
      details: error?.message,
    });
  }
}
