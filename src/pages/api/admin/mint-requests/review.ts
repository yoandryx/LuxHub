// /pages/api/admin/mint-requests/review.ts
// Admin reviews a mint request - approves or rejects (no minting yet)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Wallet-based admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  // Check if has permission to review/approve mints
  // canApproveMints permission allows both review and minting
  const canReview =
    isEnvAdmin || dbAdmin?.permissions?.canApproveMints || dbAdmin?.role === 'super_admin';

  if (!canReview) {
    return res.status(403).json({
      error: 'Admin access required - must have canApproveMints permission to review requests',
    });
  }

  const { mintRequestId, action, adminNotes } = req.body;

  if (!mintRequestId) {
    return res.status(400).json({ error: 'mintRequestId is required' });
  }

  if (!action || !['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "approve" or "reject"' });
  }

  try {
    const mintRequest = await MintRequest.findById(mintRequestId);

    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    if (mintRequest.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot review - request is already ${mintRequest.status}`,
      });
    }

    // Update the request
    mintRequest.status = action === 'approve' ? 'approved' : 'rejected';
    mintRequest.reviewedBy = requestingWallet;
    mintRequest.reviewedAt = new Date();
    if (adminNotes) {
      mintRequest.adminNotes = adminNotes;
    }

    await mintRequest.save();

    console.log(
      `✅ Mint request ${action}d by ${requestingWallet.slice(0, 8)}...: ${mintRequest.title}`
    );

    return res.status(200).json({
      message: `Mint request ${action}d successfully`,
      mintRequest: {
        id: mintRequest._id,
        title: mintRequest.title,
        status: mintRequest.status,
        reviewedBy: mintRequest.reviewedBy,
        reviewedAt: mintRequest.reviewedAt,
      },
    });
  } catch (error) {
    console.error('Error reviewing mint request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
