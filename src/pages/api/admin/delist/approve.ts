import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../../lib/monitoring/errorHandler';
import dbConnect from '../../../../lib/database/mongodb';
import { DelistRequest } from '../../../../lib/models/DelistRequest';
import { Escrow } from '../../../../lib/models/Escrow';
import VendorProfileModel from '../../../../lib/models/VendorProfile';
import AdminRole from '../../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import { notifyUser } from '../../../../lib/services/notificationService';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { requestId, adminWallet, reviewNotes } = req.body;

  if (!requestId || !adminWallet) {
    return res.status(400).json({ error: 'Missing requestId or adminWallet' });
  }

  try {
    await dbConnect();

    // Admin auth
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

    const delistRequest = await DelistRequest.findById(requestId);
    if (!delistRequest) return res.status(404).json({ error: 'Delist request not found' });
    if (delistRequest.status !== 'pending') {
      return res.status(400).json({ error: `Request already ${delistRequest.status}` });
    }

    // Update delist request
    delistRequest.status = 'approved';
    delistRequest.reviewedBy = adminWallet;
    delistRequest.reviewedAt = new Date();
    delistRequest.reviewNotes = reviewNotes || '';

    // Handle active escrow
    if (delistRequest.hasActiveEscrow && delistRequest.relatedEscrowId) {
      const escrow = await Escrow.findById(delistRequest.relatedEscrowId);
      if (escrow && ['funded', 'shipped'].includes(escrow.status)) {
        // Cancel escrow
        escrow.status = 'cancelled';
        escrow.cancelledAt = new Date();
        escrow.cancelReason = 'vendor_external_sale';
        await escrow.save();

        delistRequest.escrowActionTaken = 'cancelled';

        // Notify buyer
        await notifyUser({
          userWallet: escrow.buyerWallet,
          type: 'order_refunded',
          title: 'Order Cancelled - Refund Processing',
          message: `Your order has been cancelled because the vendor reported the item as sold externally. A refund is being processed.`,
          metadata: {
            escrowId: escrow._id.toString(),
            escrowPda: escrow.escrowPda,
            actionUrl: `/orders`,
          },
        });
      }
    }

    // Track vendor reliability for external sales
    if (delistRequest.reason === 'sold_externally' && delistRequest.hasActiveEscrow) {
      await VendorProfileModel.findOneAndUpdate(
        { wallet: delistRequest.vendorWallet },
        {
          $push: {
            reliabilityFlags: {
              type: 'external_sale_while_escrowed',
              createdAt: new Date(),
              details: `Delist request ${requestId}: sold externally while escrow active`,
            },
          },
          $inc: { reliabilityScore: -10 },
        }
      );
    }

    await delistRequest.save();

    // Notify vendor
    await notifyUser({
      userWallet: delistRequest.vendorWallet,
      type: 'sale_request_approved',
      title: 'Delist Request Approved',
      message: `Your request to ${delistRequest.requestedAction} the item has been approved.`,
      metadata: { assetId: delistRequest.asset?.toString() },
    });

    return res.status(200).json({
      success: true,
      message: 'Delist request approved',
      escrowCancelled: delistRequest.escrowActionTaken === 'cancelled',
    });
  } catch (error: any) {
    console.error('[admin/delist/approve] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withErrorMonitoring(handler);
