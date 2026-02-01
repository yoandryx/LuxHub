// pages/api/assets/create.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await dbConnect();

  const {
    vendor, // Optional: must be a valid Vendor ObjectId or undefined
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
    // Additional fields from bulk mint
    brand,
    material,
    productionYear,
    movement,
    caseSize,
    dialColor,
    waterResistance,
    condition,
    boxPapers,
    country,
    limitedEdition,
    certificate,
    warrantyInfo,
    features,
    releaseDate,
    category,
    aiVerification,
  } = req.body;

  try {
    const existing = await Asset.findOne({ nftMint });
    if (existing) {
      return res.status(400).json({ error: 'Asset with this mint already exists' });
    }

    const newAsset = new Asset({
      ...(vendor && { vendor }), // Only include if valid ObjectId provided
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
      category: category || 'watches',
      // Additional metadata stored in metaplexMetadata.attributes
      metaplexMetadata: {
        attributes: {
          brand,
          material,
          productionYear,
          movement,
          caseSize,
          dialColor,
          waterResistance,
          condition,
          boxPapers,
          country,
          limitedEdition,
          certificate,
          warrantyInfo,
          features,
          releaseDate,
        },
      },
      // AI verification if provided
      ...(aiVerification && { aiVerification }),
    });

    await newAsset.save();

    console.log('[ASSET-CREATE] Asset saved:', nftMint);
    res.status(200).json({ success: true, asset: newAsset });
  } catch (error: any) {
    console.error('[ASSET-CREATE] Error:', error.message);
    console.error('[ASSET-CREATE] Full error:', error);
    res.status(500).json({ error: 'Failed to save asset', details: error.message });
  }
}
