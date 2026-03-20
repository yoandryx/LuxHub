import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { notifyVendorApplicationResult } from '../../../lib/services/notificationService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { wallet, adminWallet } = req.body;

  if (!wallet) {
    return res.status(400).json({ error: 'Vendor wallet address is required.' });
  }
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

    const updated = await VendorProfileModel.findOneAndUpdate(
      { wallet },
      {
        approved: true,
        applicationStatus: 'approved',
        reviewedBy: adminWallet,
        reviewedAt: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }

    // Send notification to vendor
    try {
      await notifyVendorApplicationResult({
        vendorWallet: wallet,
        approved: true,
        vendorName: updated.name,
      });
    } catch (notifErr) {
      console.error('[approveVendor] Notification error (non-blocking):', notifErr);
    }

    return res.status(200).json({ message: 'Vendor approved successfully.' });
  } catch (error) {
    console.error('Error approving vendor:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export default withErrorMonitoring(handler);
