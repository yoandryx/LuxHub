import type { LeanDocument } from '../../../types/mongoose';
// /pages/api/vendor/orders.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet address' });
  }

  try {
    await dbConnect();

    // Find the vendor by wallet (through User relationship)
    const user = (await User.findOne({ wallet }).lean()) as any;
    if (!user) {
      // Return empty orders if user not found
      return res.status(200).json({ orders: [] });
    }

    const vendor = (await Vendor.findOne({ user: user._id }).lean()) as any;
    if (!vendor) {
      return res.status(200).json({ orders: [] });
    }

    // Fetch escrows where this vendor is the seller
    const escrows = (await Escrow.find({
      seller: vendor._id,
      deleted: { $ne: true },
    })
      .populate({
        path: 'asset',
        select: 'model priceUSD images imageIpfsUrls',
      })
      .populate({
        path: 'buyer',
        select: 'wallet username',
      })
      .sort({ createdAt: -1 })
      .lean()) as any[];
    // Note: vendor lookup depends on user, and escrows depend on vendor,
    // so these must remain sequential

    // Transform escrows to order format for frontend
    const orders = escrows.map((escrow: any) => ({
      _id: escrow._id,
      assetTitle: escrow.asset?.model || 'Asset',
      assetImage: escrow.asset?.imageIpfsUrls?.[0] || escrow.asset?.images?.[0],
      amount: escrow.amountUSD || escrow.asset?.priceUSD || 0,
      buyerWallet: escrow.buyer?.wallet || 'Unknown',
      status: mapEscrowStatus(escrow.status),
      trackingNumber: escrow.trackingNumber,
      escrowPda: escrow.escrowPda,
      txSignature: escrow.txSignature,
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
    }));

    res.status(200).json({ orders });
  } catch (err) {
    console.error('[vendor/orders] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Map internal escrow status to frontend-friendly status
function mapEscrowStatus(status: string): string {
  const statusMap: Record<string, string> = {
    initiated: 'in_escrow',
    funded: 'in_escrow',
    shipped: 'shipped',
    delivered: 'delivered',
    released: 'completed',
    cancelled: 'cancelled',
    failed: 'failed',
  };
  return statusMap[status] || status;
}
