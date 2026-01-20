// src/pages/api/pool/custody.ts
// Update custody status for LuxHub-held pool assets
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { User } from '../../../lib/models/User';

interface CustodyUpdateRequest {
  poolId: string;
  adminWallet: string;
  action: 'submit_tracking' | 'mark_received' | 'verify' | 'store';
  trackingCarrier?: string;
  trackingNumber?: string;
  proofUrls?: string[];
  notes?: string;
}

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: List pools by custody status
  if (req.method === 'GET') {
    try {
      const { status, adminWallet } = req.query;

      // Verify admin for sensitive data
      if (adminWallet) {
        const adminUser = await User.findOne({ wallet: adminWallet });
        const isAdmin =
          adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet as string);
        if (!isAdmin) {
          return res.status(403).json({ error: 'Admin access required' });
        }
      }

      // Build query - only pools in custody-relevant statuses
      const query: Record<string, any> = {
        deleted: { $ne: true },
        status: { $in: ['funded', 'custody', 'active', 'listed'] },
      };

      if (status) {
        query.custodyStatus = status;
      }

      const pools = await Pool.find(query)
        .populate({
          path: 'selectedAssetId',
          select: 'model brand priceUSD imageIpfsUrls images serial',
        })
        .populate({
          path: 'vendorId',
          select: 'businessName',
        })
        .sort({ vendorPaidAt: -1 })
        .lean();

      // Transform for response
      const custodyItems = pools.map((pool: any) => ({
        _id: pool._id,
        poolNumber: pool._id.toString().slice(-6).toUpperCase(),
        status: pool.status,
        custodyStatus: pool.custodyStatus,

        // Asset info
        asset: pool.selectedAssetId
          ? {
              model: pool.selectedAssetId.model,
              brand: pool.selectedAssetId.brand,
              serial: pool.selectedAssetId.serial,
              priceUSD: pool.selectedAssetId.priceUSD,
              image: pool.selectedAssetId.imageIpfsUrls?.[0] || pool.selectedAssetId.images?.[0],
            }
          : null,

        // Vendor info
        vendor: pool.vendorId?.businessName || 'Unknown Vendor',
        vendorWallet: pool.vendorWallet,

        // Payment info
        vendorPaidAmount: pool.vendorPaidAmount,
        vendorPaidAt: pool.vendorPaidAt,

        // Tracking info
        trackingCarrier: pool.custodyTrackingCarrier,
        trackingNumber: pool.custodyTrackingNumber,
        trackingUrl: getTrackingUrl(pool.custodyTrackingCarrier, pool.custodyTrackingNumber),

        // Custody info
        proofUrls: pool.custodyProofUrls || [],
        receivedAt: pool.custodyReceivedAt,
        verifiedBy: pool.custodyVerifiedBy,

        // Resale info
        resaleListingPriceUSD: pool.resaleListingPriceUSD,
        resaleListedAt: pool.resaleListedAt,

        // Timestamps
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      }));

      // Group by custody status for dashboard
      const grouped = {
        pending: custodyItems.filter((p: any) => p.custodyStatus === 'pending'),
        shipped: custodyItems.filter((p: any) => p.custodyStatus === 'shipped'),
        received: custodyItems.filter((p: any) => p.custodyStatus === 'received'),
        verified: custodyItems.filter((p: any) => p.custodyStatus === 'verified'),
        stored: custodyItems.filter((p: any) => p.custodyStatus === 'stored'),
      };

      return res.status(200).json({
        success: true,
        items: custodyItems,
        grouped,
        stats: {
          total: custodyItems.length,
          awaitingShipment: grouped.pending.length,
          inTransit: grouped.shipped.length,
          pendingVerification: grouped.received.length,
          verified: grouped.verified.length,
          securelyStored: grouped.stored.length,
        },
      });
    } catch (error: any) {
      console.error('[/api/pool/custody GET] Error:', error);
      return res.status(500).json({
        error: 'Failed to fetch custody items',
        details: error?.message || 'Unknown error',
      });
    }
  }

  // POST: Update custody status
  if (req.method === 'POST') {
    try {
      const { poolId, adminWallet, action, trackingCarrier, trackingNumber, proofUrls, notes } =
        req.body as CustodyUpdateRequest;

      // Validation
      if (!poolId || !adminWallet || !action) {
        return res.status(400).json({
          error: 'Missing required fields: poolId, adminWallet, action',
        });
      }

      // Verify admin
      const adminUser = await User.findOne({ wallet: adminWallet });
      const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
      if (!isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      // Find pool
      const pool = await Pool.findById(poolId);
      if (!pool || pool.deleted) {
        return res.status(404).json({ error: 'Pool not found' });
      }

      // Process action
      const updates: Record<string, any> = {};

      switch (action) {
        case 'submit_tracking':
          if (!trackingCarrier || !trackingNumber) {
            return res.status(400).json({
              error: 'trackingCarrier and trackingNumber are required',
            });
          }
          updates.custodyStatus = 'shipped';
          updates.custodyTrackingCarrier = trackingCarrier;
          updates.custodyTrackingNumber = trackingNumber;
          updates.status = 'custody';
          break;

        case 'mark_received':
          updates.custodyStatus = 'received';
          updates.custodyReceivedAt = new Date();
          if (proofUrls?.length) {
            updates.custodyProofUrls = proofUrls;
          }
          break;

        case 'verify':
          updates.custodyStatus = 'verified';
          updates.custodyVerifiedBy = adminWallet;
          break;

        case 'store':
          updates.custodyStatus = 'stored';
          updates.status = 'active';
          break;

        default:
          return res.status(400).json({
            error: 'Invalid action. Must be: submit_tracking, mark_received, verify, store',
          });
      }

      // Update pool
      const updatedPool = await Pool.findByIdAndUpdate(
        poolId,
        { $set: updates },
        { new: true }
      ).populate({
        path: 'selectedAssetId',
        select: 'model brand',
      });

      return res.status(200).json({
        success: true,
        action,
        pool: {
          _id: updatedPool._id,
          status: updatedPool.status,
          custodyStatus: updatedPool.custodyStatus,
          asset: (updatedPool.selectedAssetId as any)?.model,
          trackingNumber: updatedPool.custodyTrackingNumber,
        },
        message: getCustodyMessage(action),
        nextAction: getNextCustodyAction(updates.custodyStatus),
      });
    } catch (error: any) {
      console.error('[/api/pool/custody POST] Error:', error);
      return res.status(500).json({
        error: 'Failed to update custody status',
        details: error?.message || 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Helper to get tracking URL
function getTrackingUrl(carrier: string, trackingNumber: string): string | null {
  if (!carrier || !trackingNumber) return null;

  const carriers: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    dhl: `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${trackingNumber}`,
  };

  return carriers[carrier.toLowerCase()] || null;
}

// Helper to get success message
function getCustodyMessage(action: string): string {
  const messages: Record<string, string> = {
    submit_tracking: 'Tracking information submitted. Package is now in transit.',
    mark_received: 'Package marked as received at LuxHub.',
    verify: 'Asset verified and authenticated.',
    store: 'Asset securely stored. Pool is now active.',
  };
  return messages[action] || 'Custody status updated.';
}

// Helper to get next action
function getNextCustodyAction(status: string): string {
  const nextActions: Record<string, string> = {
    shipped: 'Mark received when package arrives at LuxHub',
    received: 'Verify and authenticate the asset',
    verified: 'Move to secure storage',
    stored: 'List for resale when ready',
  };
  return nextActions[status] || 'No further action needed';
}
