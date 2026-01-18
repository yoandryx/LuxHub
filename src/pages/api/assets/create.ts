// pages/api/assets/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets'; // Adjust path if needed (src/models/Asset.ts)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();

  const {
    vendor = 'luxhub_owned',
    model,
    serial,
    description = '',
    priceUSD,
    imageIpfsUrls,
    metadataIpfsUrl,
    nftMint,
    nftOwnerWallet,
    status = 'pending',
    poolEligible = false,
    // Add any other fields you want to save
  } = req.body;

  try {
    const existing = await Asset.findOne({ nftMint });
    if (existing) {
      return res.status(400).json({ error: 'Asset with this mint already exists' });
    }

    const newAsset = new Asset({
      vendor,
      model,
      serial,
      description,
      priceUSD,
      imageIpfsUrls,
      metadataIpfsUrl,
      nftMint,
      nftOwnerWallet,
      status,
      poolEligible,
    });
    await newAsset.save();

    res.status(200).json({ success: true, asset: newAsset });
  } catch (error) {
    console.error('Create asset error:', error);
    res.status(500).json({ error: 'Failed to save asset' });
  }
}
