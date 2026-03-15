// pages/api/assets/create.ts
// Creates an asset record after NFT minting — requires wallet validation
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';
import { withWalletValidation, AuthenticatedRequest } from '@/lib/middleware/walletAuth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const wallet = (req as AuthenticatedRequest).wallet;

  await dbConnect();

  const {
    vendor,
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

  // Verify the caller owns the wallet that owns the NFT
  if (nftOwnerWallet && nftOwnerWallet !== wallet) {
    return res.status(403).json({ error: 'Wallet does not match NFT owner' });
  }

  // If vendor ID provided, verify the caller is that vendor
  if (vendor) {
    const vendorDoc = await Vendor.findById(vendor);
    if (!vendorDoc || vendorDoc.wallet !== wallet) {
      return res.status(403).json({ error: 'Not authorized to create assets for this vendor' });
    }
    if (vendorDoc.status !== 'approved') {
      return res.status(403).json({ error: 'Vendor must be approved to create assets' });
    }
  }

  try {
    const existing = await Asset.findOne({ nftMint });
    if (existing) {
      return res.status(400).json({ error: 'Asset with this mint already exists' });
    }

    const newAsset = new Asset({
      ...(vendor && { vendor }),
      model,
      serial,
      description,
      priceUSD,
      imageIpfsUrls,
      metadataIpfsUrl,
      nftMint,
      nftOwnerWallet: nftOwnerWallet || wallet,
      status,
      poolEligible,
      category: category || 'watches',
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
      ...(aiVerification && { aiVerification }),
    });

    await newAsset.save();

    console.log('[ASSET-CREATE] Asset saved:', nftMint, 'by wallet:', wallet);
    res.status(200).json({ success: true, asset: newAsset });
  } catch (error: any) {
    console.error('[ASSET-CREATE] Error:', error.message);
    res.status(500).json({ error: 'Failed to save asset', details: error.message });
  }
}

export default withWalletValidation(handler);
