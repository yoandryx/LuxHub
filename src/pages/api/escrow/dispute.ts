// src/pages/api/escrow/dispute.ts
// Buyer-initiated dispute/refund request
// Creates a dispute record for admin review with SLA tracking
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { notifyUser } from '../../../lib/services/notificationService';

interface DisputeRequest {
  escrowPda?: string;
  escrowId?: string;
  buyerWallet: string;
  reason: 'not_received' | 'wrong_item' | 'damaged' | 'counterfeit' | 'other';
  description: string;
  evidenceUrls?: string[]; // Photos, screenshots, tracking URLs
}

interface ResolveRequest {
  escrowId: string;
  adminWallet: string;
  resolution: 'refund' | 'release_to_vendor' | 'partial_refund';
  partialRefundPercent?: number;
  adminNotes: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: List disputes (admin or buyer)
  if (req.method === 'GET') {
    const { wallet, status } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const adminConfig = getAdminConfig();
    const isAdmin = adminConfig.isAdmin(wallet as string);

    const query: Record<string, any> = {
      'dispute.status': status || { $in: ['open', 'under_review'] },
    };

    // Non-admins can only see their own disputes
    if (!isAdmin) {
      query.buyerWallet = wallet;
    }

    const disputes = await Escrow.find(query)
      .select('escrowPda nftMint buyerWallet sellerWallet listingPriceUSD status dispute')
      .sort({ 'dispute.createdAt': -1 })
      .lean();

    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    return res.status(200).json({ success: true, disputes });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;

  // Route: admin resolves a dispute
  if (body.resolution) {
    return handleResolve(req, res, body as ResolveRequest);
  }

  // Route: buyer creates a dispute
  return handleCreate(req, res, body as DisputeRequest);
}

async function handleCreate(req: NextApiRequest, res: NextApiResponse, data: DisputeRequest) {
  const { escrowPda, escrowId, buyerWallet, reason, description, evidenceUrls } = data;

  if (!buyerWallet || !reason || !description) {
    return res.status(400).json({
      error: 'Missing required fields: buyerWallet, reason, description',
    });
  }

  const escrow = escrowPda ? await Escrow.findOne({ escrowPda }) : await Escrow.findById(escrowId);

  if (!escrow) {
    return res.status(404).json({ error: 'Escrow not found' });
  }

  // Only the buyer can dispute
  if (escrow.buyerWallet !== buyerWallet) {
    return res.status(403).json({ error: 'Only the buyer can initiate a dispute' });
  }

  // Can only dispute funded or shipped escrows
  const disputableStatuses = ['funded', 'shipped', 'delivered'];
  if (!disputableStatuses.includes(escrow.status)) {
    return res.status(400).json({
      error: `Cannot dispute escrow in '${escrow.status}' status`,
      disputableStatuses,
    });
  }

  // Check if already disputed
  if (escrow.dispute?.status === 'open' || escrow.dispute?.status === 'under_review') {
    return res.status(400).json({
      error: 'A dispute is already open for this escrow',
      disputeStatus: escrow.dispute.status,
    });
  }

  // Create dispute record
  // SLA: 7 days for admin to resolve, after which buyer can escalate
  const slaDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await Escrow.findByIdAndUpdate(escrow._id, {
    $set: {
      dispute: {
        status: 'open',
        reason,
        description,
        evidenceUrls: evidenceUrls || [],
        createdAt: new Date(),
        slaDeadline,
        buyerWallet,
      },
    },
  });

  // Notify admins (best-effort)
  try {
    const adminConfig = getAdminConfig();
    const adminWallets = adminConfig.adminWallets || [];
    for (const adminWallet of adminWallets.slice(0, 3)) {
      await notifyUser({
        userWallet: adminWallet,
        type: 'system' as any,
        title: 'New Dispute',
        message: `Buyer ${buyerWallet.slice(0, 8)}... opened a dispute: ${reason}`,
        metadata: { escrowId: escrow._id.toString() },
      }).catch(() => {});
    }
  } catch {
    /* non-blocking */
  }

  return res.status(200).json({
    success: true,
    message: 'Dispute submitted. Admin will review within 7 days.',
    dispute: {
      escrowId: escrow._id,
      escrowPda: escrow.escrowPda,
      reason,
      status: 'open',
      slaDeadline,
    },
  });
}

async function handleResolve(req: NextApiRequest, res: NextApiResponse, data: ResolveRequest) {
  const { escrowId, adminWallet, resolution, partialRefundPercent, adminNotes } = data;

  if (!escrowId || !adminWallet || !resolution || !adminNotes) {
    return res.status(400).json({
      error: 'Missing required fields: escrowId, adminWallet, resolution, adminNotes',
    });
  }

  const adminConfig = getAdminConfig();
  if (!adminConfig.isAdmin(adminWallet)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const escrow = await Escrow.findById(escrowId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  if (!escrow.dispute || escrow.dispute.status === 'resolved') {
    return res.status(400).json({ error: 'No open dispute on this escrow' });
  }

  await Escrow.findByIdAndUpdate(escrowId, {
    $set: {
      'dispute.status': 'resolved',
      'dispute.resolution': resolution,
      'dispute.resolvedAt': new Date(),
      'dispute.resolvedBy': adminWallet,
      'dispute.adminNotes': adminNotes,
      'dispute.partialRefundPercent': partialRefundPercent,
      // If refund, mark escrow for refund processing
      ...(resolution === 'refund' && { status: 'cancelled' }),
    },
  });

  // Notify buyer
  try {
    await notifyUser({
      userWallet: escrow.buyerWallet,
      type: 'system' as any,
      title: 'Dispute Resolved',
      message: `Your dispute has been resolved: ${resolution}. ${adminNotes}`,
      metadata: { escrowId },
    }).catch(() => {});
  } catch {
    /* non-blocking */
  }

  return res.status(200).json({
    success: true,
    resolution,
    message: `Dispute resolved: ${resolution}`,
    nextSteps:
      resolution === 'refund'
        ? ['Escrow marked for refund', 'Admin will process refund via Squads proposal']
        : resolution === 'release_to_vendor'
          ? ['Funds will be released to vendor', 'Dispute closed']
          : [`Partial refund of ${partialRefundPercent}% will be processed`],
  });
}
