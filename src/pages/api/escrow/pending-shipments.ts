// src/pages/api/escrow/pending-shipments.ts
// Get escrows with pending shipment verification (shipmentStatus = 'proof_submitted')
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    // Find escrows with proof_submitted status
    const escrows = await Escrow.find({
      shipmentStatus: 'proof_submitted',
      deleted: { $ne: true },
    })
      .populate({
        path: 'asset',
        select: 'model priceUSD imageIpfsUrls images',
      })
      .populate({
        path: 'buyer',
        select: 'wallet username',
      })
      .populate({
        path: 'seller',
        select: 'businessName',
      })
      .sort({ shipmentSubmittedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      escrows,
      count: escrows.length,
    });
  } catch (error: any) {
    console.error('[/api/escrow/pending-shipments] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch pending shipments',
      details: error?.message || 'Unknown error',
    });
  }
}
