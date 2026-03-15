// src/pages/api/order/[id].ts
// Shared order status endpoint — returns full escrow timeline for buyer, vendor, or admin
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Asset } from '../../../lib/models/Assets';
import VendorProfileModel from '../../../lib/models/VendorProfile';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id, wallet } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Order ID required' });
    }

    await dbConnect();

    // Try finding by escrowPda first, then by MongoDB _id
    let escrow = (await Escrow.findOne({ escrowPda: id }).lean()) as any;
    if (!escrow) {
      escrow = (await Escrow.findById(id).lean()) as any;
    }

    if (!escrow || escrow.deleted) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch asset details
    const asset = escrow.asset
      ? ((await Asset.findById(escrow.asset)
          .select('model brand imageUrl imageIpfsUrls images serial condition priceUSD')
          .lean()) as any)
      : null;

    // Fetch vendor profile
    const vendor = escrow.sellerWallet
      ? ((await VendorProfileModel.findOne({ wallet: escrow.sellerWallet })
          .select('name username avatarUrl verified')
          .lean()) as any)
      : null;

    // Build timeline events
    const timeline: {
      status: string;
      label: string;
      timestamp: string | null;
      active: boolean;
      completed: boolean;
    }[] = [
      {
        status: 'listed',
        label: 'Listed on Marketplace',
        timestamp: escrow.createdAt || null,
        active: escrow.status === 'listed' || escrow.status === 'initiated',
        completed: true,
      },
      {
        status: 'funded',
        label: 'Payment Secured in Escrow',
        timestamp: escrow.fundedAt || null,
        active: escrow.status === 'funded',
        completed: !!escrow.fundedAt,
      },
      {
        status: 'shipped',
        label: 'Item Shipped',
        timestamp: escrow.shippedAt || null,
        active: escrow.status === 'shipped',
        completed: !!escrow.shippedAt,
      },
      {
        status: 'delivered',
        label: 'Delivery Confirmed',
        timestamp: escrow.deliveredAt || escrow.deliveryConfirmation?.confirmedAt || null,
        active: escrow.status === 'delivered',
        completed: !!escrow.deliveredAt || !!escrow.deliveryConfirmation?.confirmedAt,
      },
      {
        status: 'released',
        label: 'Funds Released to Vendor',
        timestamp: escrow.squadsExecutedAt || null,
        active: escrow.status === 'released',
        completed: escrow.status === 'released',
      },
    ];

    // Determine viewer role (don't expose sensitive data to wrong party)
    const walletStr = typeof wallet === 'string' ? wallet : '';
    const isBuyer = walletStr && escrow.buyerWallet === walletStr;
    const isVendor = walletStr && escrow.sellerWallet === walletStr;

    // Build response
    const order = {
      id: escrow._id,
      escrowPda: escrow.escrowPda,
      status: escrow.status,
      nftMint: escrow.nftMint,

      // Asset info
      asset: asset
        ? {
            model: asset.model,
            brand: asset.brand,
            image: asset.imageUrl || asset.imageIpfsUrls?.[0] || asset.images?.[0],
            serial: asset.serial,
            condition: asset.condition,
            priceUSD: asset.priceUSD,
          }
        : null,

      // Pricing
      listingPrice: escrow.listingPrice,
      listingPriceUSD: escrow.listingPriceUSD,
      fundedAmount: escrow.fundedAmount,

      // Parties (truncated for privacy unless viewer is a party)
      buyer: {
        wallet:
          isBuyer || isVendor
            ? escrow.buyerWallet
            : escrow.buyerWallet?.slice(0, 4) + '...' + escrow.buyerWallet?.slice(-4),
      },
      vendor: {
        wallet: escrow.sellerWallet,
        name: vendor?.name,
        username: vendor?.username,
        avatarUrl: vendor?.avatarUrl,
        verified: vendor?.verified,
      },

      // Shipping (only show full address to vendor/buyer)
      shipping: {
        status: escrow.shipmentStatus || 'pending',
        carrier: escrow.trackingCarrier,
        trackingNumber: isBuyer || isVendor ? escrow.trackingNumber : null,
        trackingUrl: escrow.trackingUrl,
        estimatedDelivery: escrow.estimatedDeliveryDate,
        actualDelivery: escrow.actualDeliveryDate,
      },

      // Delivery confirmation
      delivery: escrow.deliveryConfirmation
        ? {
            confirmedAt: escrow.deliveryConfirmation.confirmedAt,
            rating: escrow.deliveryConfirmation.rating,
            review: escrow.deliveryConfirmation.review,
          }
        : null,

      // Dispute (if any)
      dispute: escrow.dispute?.status
        ? {
            status: escrow.dispute.status,
            reason: escrow.dispute.reason,
            createdAt: escrow.dispute.createdAt,
            slaDeadline: escrow.dispute.slaDeadline,
            resolution: escrow.dispute.resolution,
            resolvedAt: escrow.dispute.resolvedAt,
          }
        : null,

      // Squads multisig
      squads: escrow.squadsTransactionIndex
        ? {
            proposalIndex: escrow.squadsTransactionIndex,
            executed: !!escrow.squadsExecutedAt,
            executedAt: escrow.squadsExecutedAt,
            signature: escrow.squadsExecutionSignature,
          }
        : null,

      // Timeline
      timeline,

      // Timestamps
      createdAt: escrow.createdAt,
      updatedAt: escrow.updatedAt,
    };

    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    return res.status(200).json({ success: true, order });
  } catch (error: any) {
    console.error('[/api/order/[id]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch order',
      details: error?.message || 'Unknown error',
    });
  }
}
