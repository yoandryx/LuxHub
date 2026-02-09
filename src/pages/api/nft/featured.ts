// src/pages/api/nft/featured.ts
// Returns vendor-listed NFTs in a daily-randomized order for the landing page
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
// Register models for populate
import '../../../lib/models/Assets';
import '../../../lib/models/Vendor';

// Simple seeded PRNG (mulberry32) for deterministic daily shuffle
function seededRandom(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  const rng = seededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getDailySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const limit = parseInt(req.query.limit as string) || 8;

    // Fetch active vendor listings from escrow (cap pool size for memory safety)
    const escrows = await Escrow.find({
      status: { $in: ['listed', 'initiated'] },
      deleted: { $ne: true },
    })
      .populate(
        'asset',
        'model brand title imageUrl imageIpfsUrls images arweaveTxId priceUSD description material dialColor caseSize condition productionYear movement serial'
      )
      .populate('seller', 'businessName username verified')
      .limit(100)
      .lean();

    // Filter out escrows without valid asset data
    const valid = escrows.filter((e: any) => e.asset);

    // Shuffle deterministically based on today's date
    const shuffled = shuffleWithSeed(valid, getDailySeed());

    // Take the requested number
    const featured = shuffled.slice(0, limit);

    // Transform for frontend
    const listings = featured.map((escrow: any) => ({
      nftId: escrow.nftMint || escrow.escrowPda,
      mintAddress: escrow.nftMint || '',
      escrowPda: escrow.escrowPda,
      nftMint: escrow.nftMint,
      salePrice: escrow.listingPrice ? escrow.listingPrice / 1e9 : 0,
      listingPriceUSD: escrow.listingPriceUSD,
      timestamp: escrow.createdAt ? new Date(escrow.createdAt).getTime() : Date.now(),
      seller: escrow.sellerWallet || '',
      marketStatus: escrow.status,
      saleMode: escrow.saleMode,
      // Asset fields
      title: escrow.asset?.title || escrow.asset?.model || 'Untitled',
      image: escrow.asset?.imageUrl || '',
      imageUrl: escrow.asset?.imageUrl,
      imageIpfsUrls: escrow.asset?.imageIpfsUrls,
      images: escrow.asset?.images,
      fileCid: escrow.asset?.imageIpfsUrls?.[0] || '',
      priceUSD: escrow.listingPriceUSD || escrow.asset?.priceUSD || 0,
      brand: escrow.asset?.brand,
      attributes: [
        { trait_type: 'Brand', value: escrow.asset?.brand || '' },
        { trait_type: 'Model', value: escrow.asset?.model || '' },
        { trait_type: 'Material', value: escrow.asset?.material || '' },
        { trait_type: 'Condition', value: escrow.asset?.condition || '' },
        { trait_type: 'Dial Color', value: escrow.asset?.dialColor || '' },
        { trait_type: 'Case Size', value: escrow.asset?.caseSize || '' },
        { trait_type: 'Production Year', value: escrow.asset?.productionYear || '' },
        { trait_type: 'Movement', value: escrow.asset?.movement || '' },
        {
          trait_type: 'Price USD',
          value: escrow.listingPriceUSD ? `$${escrow.listingPriceUSD.toLocaleString()}` : '',
        },
      ].filter((a) => a.value),
      // Offer/listing details
      acceptingOffers: escrow.acceptingOffers || escrow.saleMode === 'accepting_offers' || false,
      minimumOfferUSD: escrow.minimumOfferUSD || 0,
      listingPrice: escrow.listingPrice || 0,
      // Vendor info
      vendor: escrow.seller
        ? {
            businessName: escrow.seller.businessName,
            username: escrow.seller.username,
            verified: escrow.seller.verified,
          }
        : null,
    }));

    return res.status(200).json(listings);
  } catch (error: any) {
    console.error('[/api/nft/featured] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch featured listings' });
  }
}
