// src/pages/api/buyer/orders.ts
// Returns buyer's orders with shipping and tracking info
// Uses wallet query param validation (buyer viewing their own orders)
import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { decrypt, PII_FIELDS } from '../../../lib/security/encryption';

// Decrypt PII fields in shipping address
function decryptShippingAddress(address: any): any {
  if (!address) return address;
  const decrypted = { ...address };
  for (const field of PII_FIELDS) {
    if (decrypted[field]) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  }
  return decrypted;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.query.wallet as string;
  const { status: statusFilter } = req.query;

  // Validate wallet is a valid Solana public key
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query parameter is required' });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    await dbConnect();

    // Build filter for buyer's orders
    const filter: Record<string, any> = {
      buyerWallet: wallet,
      deleted: { $ne: true },
      // Only show orders that have been funded (buyer has paid)
      status: { $in: ['funded', 'shipped', 'delivered', 'released'] },
    };

    // Optional additional status filter
    if (statusFilter && typeof statusFilter === 'string') {
      const statuses = statusFilter.split(',').map((s) => s.trim());
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }

    // Fetch buyer's orders
    const escrows = await Escrow.find(filter)
      .populate({
        path: 'asset',
        select: 'title model brand priceUSD images imageIpfsUrls imageUrl description',
      })
      .populate({
        path: 'seller',
        select: 'businessName username verified avatarUrl',
      })
      .sort({ createdAt: -1 })
      .lean();

    // Transform to frontend format (decrypt shipping addresses)
    const orders = escrows.map((escrow: any) => ({
      _id: escrow._id,
      // Asset info
      assetTitle: escrow.asset?.title || escrow.asset?.model || 'Asset',
      assetBrand: escrow.asset?.brand,
      assetDescription: escrow.asset?.description,
      assetImage:
        escrow.asset?.imageUrl || escrow.asset?.imageIpfsUrls?.[0] || escrow.asset?.images?.[0],
      // Pricing
      amount:
        escrow.fundedAmount ||
        escrow.listingPriceUSD ||
        escrow.amountUSD ||
        escrow.asset?.priceUSD ||
        0,
      // Status
      status: escrow.status,
      shipmentStatus: escrow.shipmentStatus,
      // Vendor info
      vendorName: escrow.seller?.businessName || escrow.seller?.username || 'Vendor',
      vendorVerified: escrow.seller?.verified,
      vendorWallet: escrow.sellerWallet,
      // Buyer's shipping address (decrypted)
      shippingAddress: decryptShippingAddress(escrow.buyerShippingAddress),
      // Tracking info
      trackingCarrier: escrow.trackingCarrier,
      trackingNumber: escrow.trackingNumber,
      trackingUrl: escrow.trackingUrl,
      estimatedDeliveryDate: escrow.estimatedDeliveryDate,
      actualDeliveryDate: escrow.actualDeliveryDate,
      shippedAt: escrow.shipmentSubmittedAt,
      // Delivery confirmation
      deliveryConfirmation: escrow.deliveryConfirmation,
      deliveryNotes: escrow.deliveryNotes,
      // Escrow details
      escrowPda: escrow.escrowPda,
      nftMint: escrow.nftMint,
      // Timestamps
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
      fundedAt: escrow.fundedAt,
    }));

    // Calculate stats
    const stats = {
      total: orders.length,
      awaitingShipment: orders.filter((o: any) => o.status === 'funded').length,
      inTransit: orders.filter((o: any) => o.status === 'shipped').length,
      delivered: orders.filter((o: any) => o.status === 'delivered').length,
      completed: orders.filter((o: any) => o.status === 'released').length,
    };

    return res.status(200).json({
      success: true,
      orders,
      stats,
    });
  } catch (error: any) {
    console.error('[/api/buyer/orders] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch orders',
      details: error?.message || 'Unknown error',
    });
  }
}
