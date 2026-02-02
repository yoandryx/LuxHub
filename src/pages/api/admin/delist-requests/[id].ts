// src/pages/api/admin/delist-requests/[id].ts
// Admin endpoint to approve or reject a delist request
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import DelistRequest from '../../../../lib/models/DelistRequest';
import { Asset } from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing request ID' });
  }

  await dbConnect();

  // Admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.body.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  const adminConfig = getAdminConfig();
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  if (!isEnvSuperAdmin && !dbAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { action, reviewNotes } = req.body;

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be "approve" or "reject"' });
  }

  try {
    const delistRequest = await DelistRequest.findById(id);
    if (!delistRequest) {
      return res.status(404).json({ error: 'Delist request not found' });
    }

    if (delistRequest.status !== 'pending') {
      return res.status(400).json({
        error: `Request already ${delistRequest.status}`,
        reviewedAt: delistRequest.reviewedAt,
      });
    }

    if (action === 'approve') {
      // Find and update the asset
      const asset = await Asset.findById(delistRequest.asset);
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      // Determine new status based on reason and requested action
      let newStatus: string;
      if (delistRequest.requestedAction === 'burn') {
        newStatus = 'burned';
      } else {
        // Map reason to appropriate status
        switch (delistRequest.reason) {
          case 'sold_externally':
            newStatus = 'sold_externally';
            break;
          case 'damaged':
          case 'lost':
          case 'stolen':
            newStatus = 'burned'; // These should be burned since asset is gone
            break;
          case 'returned':
          case 'other':
          default:
            newStatus = 'delisted';
        }
      }

      // Update asset status
      const previousStatus = asset.status;
      asset.status = newStatus;

      if (newStatus === 'burned') {
        asset.burnedAt = new Date();
        asset.burnedReason = `Delist request: ${delistRequest.reason} - ${delistRequest.reasonDetails}`;
        asset.burnedBy = requestingWallet;
        asset.previousOwnerBeforeBurn = asset.nftOwnerWallet;
      }

      await asset.save();

      // Update delist request
      delistRequest.status = 'approved';
      delistRequest.reviewedBy = requestingWallet;
      delistRequest.reviewedAt = new Date();
      delistRequest.reviewNotes =
        reviewNotes || `Approved. Asset status changed from ${previousStatus} to ${newStatus}`;
      await delistRequest.save();

      return res.status(200).json({
        success: true,
        message: 'Delist request approved',
        asset: {
          _id: asset._id,
          mintAddress: asset.nftMint,
          previousStatus,
          newStatus,
        },
      });
    } else {
      // Reject
      delistRequest.status = 'rejected';
      delistRequest.reviewedBy = requestingWallet;
      delistRequest.reviewedAt = new Date();
      delistRequest.reviewNotes = reviewNotes || 'Request rejected by admin';
      await delistRequest.save();

      return res.status(200).json({
        success: true,
        message: 'Delist request rejected',
      });
    }
  } catch (error) {
    console.error('[admin/delist-requests/[id]] Error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}
