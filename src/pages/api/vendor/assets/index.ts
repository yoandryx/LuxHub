// /pages/api/vendor/assets/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import { Asset } from '../../../../lib/models/Assets';
import { Vendor } from '../../../../lib/models/Vendor';
import { User } from '../../../../lib/models/User';
import type { LeanDocument } from '../../../../types/mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, status } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet address' });
  }

  try {
    await dbConnect();

    // Find the vendor by wallet (through User relationship)
    const user = await User.findOne({ wallet }).lean<LeanDocument>();
    if (!user) {
      return res.status(200).json({ assets: [] });
    }

    const vendor = await Vendor.findOne({ user: user._id }).lean<LeanDocument>();
    if (!vendor) {
      return res.status(200).json({ assets: [] });
    }

    // Build query
    const query: any = {
      vendor: vendor._id,
      deleted: { $ne: true },
    };

    // Optional status filter
    if (status && typeof status === 'string') {
      query.status = status;
    }

    // Fetch assets for this vendor
    // Note: vendor lookup depends on user, and assets depend on vendor,
    // so these must remain sequential
    const assets = await Asset.find(query).sort({ createdAt: -1 }).lean();

    // Transform assets for frontend (include all relevant fields)
    const formattedAssets = assets.map((asset: any) => ({
      _id: asset._id,
      title: asset.title || asset.model,
      model: asset.model,
      brand:
        asset.brand ||
        asset.metaplexMetadata?.attributes?.find((a: any) => a.trait_type === 'Brand')?.value ||
        '',
      reference: asset.serial,
      serialNumber: asset.serial,
      description: asset.description,
      priceUSD: asset.priceUSD,
      currentValueUSD: asset.currentValueUSD,
      imageUrl: asset.imageUrl, // Primary display image
      images: asset.images,
      imageIpfsUrls: asset.imageIpfsUrls,
      imageBase64s: asset.imageBase64s,
      metadataIpfsUrl: asset.metadataIpfsUrl,
      nftMint: asset.nftMint,
      status: asset.status,
      luxScore: asset.luxScore,
      poolEligible: asset.poolEligible,
      material: asset.material,
      dialColor: asset.dialColor,
      caseSize: asset.caseSize,
      movement: asset.movement,
      productionYear: asset.productionYear,
      condition: asset.condition,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    }));

    res.status(200).json({ assets: formattedAssets });
  } catch (err) {
    console.error('[vendor/assets] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
