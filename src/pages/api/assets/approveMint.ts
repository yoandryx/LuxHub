// src/pages/api/assets/approveMint.ts
import { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  await dbConnect();

  const { assetId, mintAddress } = req.body;

  if (!assetId || !mintAddress) {
    return res.status(400).json({ error: 'Missing assetId or mintAddress' });
  }

  try {
    // Step 1: Fetch existing asset to get current priceUSD
    const existingAsset = await Asset.findById(assetId);
    if (!existingAsset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Step 2: Update with explicit price from fetched document
    const updatedAsset = await Asset.findByIdAndUpdate(
      assetId,
      {
        status: 'listed',
        nftMint: mintAddress,
        $push: { priceHistory: { price: existingAsset.priceUSD } },
      },
      { new: true }
    );

    if (!updatedAsset) {
      return res.status(404).json({ error: 'Failed to update asset' });
    }

    // Optional: increment vendor listings count
    await Vendor.findOneAndUpdate({ user: updatedAsset.vendor }, { $inc: { listingsCount: 1 } });

    res.status(200).json({ success: true, asset: updatedAsset });
  } catch (err) {
    console.error('Approve mint error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
