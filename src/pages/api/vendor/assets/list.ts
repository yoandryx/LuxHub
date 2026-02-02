// src/pages/api/vendor/assets/list.ts
// Allow vendors to list their owned assets for sale
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import { Asset } from '../../../../lib/models/Assets';
import { Vendor } from '../../../../lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { assetId, wallet, priceUSD } = req.body;

  if (!assetId || !wallet) {
    return res.status(400).json({ error: 'Missing required fields: assetId, wallet' });
  }

  try {
    await dbConnect();

    // Find the vendor by wallet
    const vendor = await Vendor.findOne({ wallet, status: 'approved' });
    if (!vendor) {
      return res.status(403).json({ error: 'Unauthorized - vendor not found or not approved' });
    }

    // Find the asset
    const asset = await Asset.findById(assetId);
    if (!asset || asset.deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Verify ownership - check both vendor ObjectId and wallet
    const isOwner =
      asset.vendor?.toString() === vendor._id.toString() || asset.nftOwnerWallet === wallet;

    if (!isOwner) {
      return res.status(403).json({ error: 'Unauthorized - you do not own this asset' });
    }

    // Check if asset has been minted
    if (!asset.nftMint) {
      return res.status(400).json({ error: 'Asset has not been minted yet' });
    }

    // Only allow listing pending or reviewed assets
    if (!['pending', 'reviewed'].includes(asset.status)) {
      return res.status(400).json({
        error: `Cannot list asset - current status is "${asset.status}"`,
      });
    }

    // Update asset to listed status
    const updateFields: Record<string, unknown> = {
      status: 'listed',
    };

    // Update price if provided
    if (priceUSD !== undefined && priceUSD > 0) {
      updateFields.priceUSD = priceUSD;
    }

    const updatedAsset = await Asset.findByIdAndUpdate(assetId, updateFields, { new: true });

    return res.status(200).json({
      success: true,
      asset: {
        _id: updatedAsset._id,
        model: updatedAsset.model,
        status: updatedAsset.status,
        priceUSD: updatedAsset.priceUSD,
        nftMint: updatedAsset.nftMint,
      },
    });
  } catch (error: any) {
    console.error('[/api/vendor/assets/list] Error:', error);
    return res.status(500).json({
      error: 'Failed to list asset',
      details: error?.message,
    });
  }
}
