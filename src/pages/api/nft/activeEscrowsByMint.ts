// /src/pages/api/nft/activeEscrowsByMint.ts
// Returns active escrows for admin dashboard — sourced from Escrow collection
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { getClusterConfig } from '@/lib/solana/clusterConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();

    const escrows = await Escrow.find({
      deleted: { $ne: true },
      status: { $in: ['funded', 'shipped', 'listed', 'initiated'] },
      escrowPda: { $not: /^listing-/ },
    })
      .populate('asset')
      .sort({ createdAt: -1 })
      .lean();

    const { usdcMint } = getClusterConfig();

    const mapped = escrows.map((escrow: any) => {
      const asset = escrow.asset || {};
      return {
        seed: escrow.escrowSeed || 0,
        initializer: escrow.sellerWallet,
        luxhub_wallet: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
        initializer_amount: '1',
        taker_amount: (escrow.listingPrice || 0).toString(),
        salePrice: (escrow.listingPrice || 0).toString(),
        file_cid: asset.arweaveTxId || asset.imageIpfsUrls?.[0] || '',
        mintA: usdcMint,
        mintB: escrow.nftMint,
        nftId: escrow.nftMint,
        name: asset.title || asset.model || 'Unknown',
        image: asset.imageUrl || '',
        description: asset.description || '',
        attributes: [],
        seller: escrow.sellerWallet,
        buyer: escrow.buyerWallet || null,
        status: escrow.status,
        escrowPda: escrow.escrowPda,
        priceUSD: escrow.listingPriceUSD,
        createdAt: escrow.createdAt,
      };
    });

    res.status(200).json(mapped);
  } catch (err) {
    console.error('[activeEscrowsByMint] Error:', err);
    res.status(500).json({ error: 'Failed to fetch active escrows' });
  }
}
