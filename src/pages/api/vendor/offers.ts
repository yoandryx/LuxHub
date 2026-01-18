// /pages/api/vendor/offers.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Offer } from '../../../lib/models/Offer';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

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
    const user = await User.findOne({ wallet }).lean();
    if (!user) {
      return res.status(200).json({ offers: [] });
    }

    const vendor = await Vendor.findOne({ user: user._id }).lean();
    if (!vendor) {
      return res.status(200).json({ offers: [] });
    }

    // Build query
    const query: any = {
      toVendor: vendor._id,
      deleted: { $ne: true },
    };

    // Optional status filter
    if (status && typeof status === 'string') {
      query.status = status;
    }

    // Fetch offers where this vendor is the receiver
    const offerDocs = await Offer.find(query)
      .populate({
        path: 'asset',
        select: 'model priceUSD images imageIpfsUrls',
      })
      .populate({
        path: 'fromUser',
        select: 'wallet username',
      })
      .sort({ createdAt: -1 })
      .lean();

    // Transform offers for frontend
    const offers = offerDocs.map((offer: any) => ({
      _id: offer._id,
      assetId: offer.asset?._id,
      assetTitle: offer.asset?.model || 'Asset',
      assetImage: offer.asset?.imageIpfsUrls?.[0] || offer.asset?.images?.[0],
      listPrice: offer.asset?.priceUSD || 0,
      offerAmount: offer.offerPriceUSD,
      buyerWallet: offer.fromUser?.wallet || 'Unknown',
      buyerUsername: offer.fromUser?.username,
      status: offer.status,
      counterOffers: offer.counterOffers || [],
      negotiationNotes: offer.negotiationNotes || [],
      escrowPda: offer.escrowPda,
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    }));

    res.status(200).json({ offers });
  } catch (err) {
    console.error('[vendor/offers] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
