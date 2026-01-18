// src/pages/api/vendor/nfts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import NFTModel from '../../../lib/models/NFT';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  const wallet = req.query.wallet as string;
  if (!wallet) {
    return res.status(400).json({ error: 'Missing wallet' });
  }

  try {
    // Fetch NFTs where the seller matches the wallet (or currentOwner fallback)
    const nfts = await NFTModel.find({
      $or: [{ seller: wallet }, { currentOwner: wallet }],
    }).sort({ timestamp: -1 });

    res.status(200).json(nfts);
  } catch (e) {
    console.error('❌ Error fetching vendor NFTs:', e);
    res.status(500).json({ error: 'Failed to fetch NFTs.' });
  }
}
