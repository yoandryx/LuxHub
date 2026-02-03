import type { LeanDocument } from '../../../types/mongoose';
// /pages/api/vendor/orders.ts
// Returns vendor orders with buyer shipping addresses for shipment management
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet, status: statusFilter } = req.query;
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

    // Build filter
    const filter: Record<string, any> = {
      seller: vendor._id,
      deleted: { $ne: true },
    };

    // Optional status filter (comma-separated)
    if (statusFilter && typeof statusFilter === 'string') {
      const statuses = statusFilter.split(',').map((s) => s.trim());
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    // Fetch escrows where this vendor is the seller
    const escrows = (await Escrow.find(filter)
      .populate({
        path: 'asset',
        select: 'model brand priceUSD images imageIpfsUrls title',
      })
      .populate({
        path: 'buyer',
        select: 'wallet username email',
      })
      .sort({ createdAt: -1 })
      .lean()) as any[];

    // Transform escrows to order format with full shipping details
    const orders = escrows.map((escrow: any) => ({
      _id: escrow._id,
      assetTitle: escrow.asset?.title || escrow.asset?.model || 'Asset',
      assetBrand: escrow.asset?.brand,
      assetImage: escrow.asset?.imageIpfsUrls?.[0] || escrow.asset?.images?.[0],
      amount: escrow.amountUSD || escrow.listingPriceUSD || escrow.asset?.priceUSD || 0,
      buyerWallet: escrow.buyerWallet || escrow.buyer?.wallet || 'Unknown',
      buyerUsername: escrow.buyer?.username,
      status: mapEscrowStatus(escrow.status),
      rawStatus: escrow.status,
      // Buyer shipping address (for vendor to ship to)
      buyerShippingAddress: escrow.buyerShippingAddress || null,
      // Shipment tracking info
      shipmentStatus: escrow.shipmentStatus,
      trackingCarrier: escrow.trackingCarrier,
      trackingNumber: escrow.trackingNumber,
      trackingUrl: escrow.trackingUrl,
      shipmentProofUrls: escrow.shipmentProofUrls,
      vendorShipmentNotes: escrow.vendorShipmentNotes,
      estimatedDeliveryDate: escrow.estimatedDeliveryDate,
      actualDeliveryDate: escrow.actualDeliveryDate,
      shippedAt: escrow.shipmentSubmittedAt,
      // Escrow details
      escrowPda: escrow.escrowPda,
      nftMint: escrow.nftMint,
      txSignature: escrow.txSignature,
      // Timestamps
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
      fundedAt: escrow.fundedAt,
    }));

    // Calculate stats
    const stats = {
      total: orders.length,
      awaitingShipment: orders.filter((o: any) => o.rawStatus === 'funded').length,
      shipped: orders.filter((o: any) => o.rawStatus === 'shipped').length,
      delivered: orders.filter((o: any) => o.rawStatus === 'delivered').length,
      completed: orders.filter((o: any) => o.rawStatus === 'released').length,
    };

    res.status(200).json({ orders, stats });
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
