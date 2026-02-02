// src/pages/api/nft/transfer.ts
// Handles NFT transfer and syncs ownership in MongoDB
// Also links asset to vendor if recipient is an approved vendor
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';

interface TransferRequest {
  mintAddress: string;
  newOwnerWallet: string;
  transactionSignature?: string;
  vendorId?: string; // Optional: explicitly pass vendor ID for assignment
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mintAddress, newOwnerWallet, transactionSignature, vendorId } =
    req.body as TransferRequest;

  if (!mintAddress || !newOwnerWallet) {
    return res.status(400).json({ error: 'Missing required fields: mintAddress, newOwnerWallet' });
  }

  // Validate Solana address format
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(newOwnerWallet)) {
    return res.status(400).json({ error: 'Invalid Solana wallet address' });
  }

  try {
    await dbConnect();

    // Check if recipient is an approved vendor (by wallet or explicit vendorId)
    let vendor = null;
    if (vendorId) {
      // Explicit vendor ID passed - use it directly
      vendor = await Vendor.findOne({ _id: vendorId, status: 'approved' });
    } else {
      // Check if the wallet belongs to an approved vendor
      vendor = await Vendor.findOne({ wallet: newOwnerWallet, status: 'approved' });
    }

    // Build update object
    const updateFields: Record<string, unknown> = {
      nftOwnerWallet: newOwnerWallet,
    };

    // Link to vendor if found (this is what makes NFT appear in vendor dashboard)
    if (vendor) {
      updateFields.vendor = vendor._id;
      console.log(`[TRANSFER] Linking asset to vendor: ${vendor.businessName || vendor.username}`);
    }

    // Find and update the asset
    const asset = await Asset.findOneAndUpdate(
      { nftMint: mintAddress },
      {
        ...updateFields,
        $push: {
          transferHistory: {
            from: undefined, // Will be populated from current owner
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
        vendor: asset.vendor || null,
      },
      linkedToVendor: !!vendor,
      vendorName: vendor?.businessName || vendor?.username || null,
    });
  } catch (error: any) {
    console.error('[/api/nft/transfer] Error:', error);
    return res.status(500).json({
      error: 'Failed to update transfer',
      details: error?.message,
    });
  }
}
