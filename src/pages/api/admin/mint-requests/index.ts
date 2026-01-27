// /pages/api/admin/mint-requests/index.ts
// Get all mint requests for admin review
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
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

  // Check if has permission to view mint requests
  const canView =
    isEnvAdmin || dbAdmin?.permissions?.canApproveMints || dbAdmin?.role === 'super_admin';

  if (!canView) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Query parameters for filtering
    const { status, limit = 50, offset = 0 } = req.query;

    const query: Record<string, unknown> = {};
    if (status && typeof status === 'string') {
      query.status = status;
    }

    const mintRequests = await MintRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .select('-imageBase64'); // Exclude large base64 data from list view

    const total = await MintRequest.countDocuments(query);

    return res.status(200).json({
      requests: mintRequests,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Error fetching mint requests:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
