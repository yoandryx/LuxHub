// src/pages/api/admin/delist-requests/index.ts
// Admin endpoint to view all delist requests
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import DelistRequest from '../../../../lib/models/DelistRequest';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  const adminConfig = getAdminConfig();
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  if (!isEnvSuperAdmin && !dbAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { status = 'pending' } = req.query;

    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const requests = await DelistRequest.find(query)
      .populate('asset', 'model nftMint priceUSD images status nftOwnerWallet')
      .populate('vendor', 'businessName username wallet')
      .sort({ createdAt: -1 })
      .lean();

    // Count by status for dashboard
    const counts = {
      pending: await DelistRequest.countDocuments({ status: 'pending' }),
      approved: await DelistRequest.countDocuments({ status: 'approved' }),
      rejected: await DelistRequest.countDocuments({ status: 'rejected' }),
    };

    return res.status(200).json({ requests, counts });
  } catch (error) {
    console.error('[admin/delist-requests] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
}
