import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfile from '../../../lib/models/VendorProfile';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await dbConnect();
    const { wallet, verified, adminWallet } = req.body;

    if (!wallet || typeof verified !== 'boolean') {
      return res.status(400).json({ error: 'Missing wallet or verification flag' });
    }
    if (!adminWallet) {
      return res.status(400).json({ error: 'Admin wallet address is required.' });
    }

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

    const vendor = await VendorProfile.findOne({ wallet });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    vendor.verified = verified;
    await vendor.save();

    res.status(200).json({ message: 'Verification updated', verified });
  } catch (err) {
    console.error('[verifyVendor] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
