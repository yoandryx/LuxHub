// pages/api/assets/update.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();

  const {
    nftMint,
    priceUSD,
    metadataIpfsUrl,
    imageIpfsUrls,
    status,
    // Add other updatable fields
  } = req.body;

  try {
    const updated = await Asset.findOneAndUpdate(
      { nftMint },
      { priceUSD, metadataIpfsUrl, imageIpfsUrls, status },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'Asset not found' });

    res.status(200).json({ success: true, asset: updated });
  } catch (error) {
    console.error('Update asset error:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
}
