import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { notifyVendorApplicationResult } from '../../../lib/services/notificationService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet, adminWallet, reason } = req.body;

    if (typeof wallet !== 'string' || !wallet.trim()) {
      return res.status(400).json({ error: 'Invalid vendor wallet address' });
    }
    if (!adminWallet) {
      return res.status(400).json({ error: 'Admin wallet address is required.' });
    }

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

    const vendor = await VendorProfileModel.findOne({ wallet });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Soft-reject: update status instead of deleting
    vendor.applicationStatus = 'rejected';
    vendor.rejectedAt = new Date();
    vendor.rejectionReason = reason || 'Application not approved';
    vendor.reviewedBy = adminWallet;
    vendor.reviewedAt = new Date();
    vendor.approved = false;
    await vendor.save();

    // Send notification to vendor
    try {
      await notifyVendorApplicationResult({
        vendorWallet: wallet,
        approved: false,
        vendorName: vendor.name,
        reason: reason || undefined,
      });
    } catch (notifErr) {
      console.error('[rejectVendor] Notification error (non-blocking):', notifErr);
    }

    return res.status(200).json({ message: 'Vendor application rejected.' });
  } catch (err) {
    console.error('[rejectVendor] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withErrorMonitoring(handler);
