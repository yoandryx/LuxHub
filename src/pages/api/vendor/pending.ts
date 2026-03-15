import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const adminWallet =
    (req.query.adminWallet as string) || (req.headers['x-wallet-address'] as string);
  if (!adminWallet) {
    return res.status(400).json({ error: 'Admin wallet address is required.' });
  }

  try {
    await dbConnect();

    // Verify admin authorization
    const adminConfig = getAdminConfig();
    const isEnvAdmin = adminConfig.isAdmin(adminWallet);
    const dbAdmin = await AdminRole.findOne({ wallet: adminWallet, isActive: true });
    const isAuthorized =
      isEnvAdmin || dbAdmin?.permissions?.canManageVendors || dbAdmin?.role === 'super_admin';
    if (!isAuthorized) {
      return res
        .status(403)
        .json({ error: 'Admin authorization required', code: 'ADMIN_REQUIRED' });
    }

    const vendors = await VendorProfileModel.find({
      $or: [
        { applicationStatus: { $in: ['pending', 'under_review'] } },
        { approved: false, applicationStatus: { $exists: false } },
      ],
    }).lean();

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    res.status(200).json({ vendors });
  } catch (err) {
    console.error('[pendingVendors] Error:', err);
    res.status(500).json({ error: 'Failed to fetch pending vendors' });
  }
}
