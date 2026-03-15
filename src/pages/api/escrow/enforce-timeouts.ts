// src/pages/api/escrow/enforce-timeouts.ts
// Enforce escrow timeouts — auto-cancel expired escrows and flag overdue shipments
// Call this via cron (Vercel cron, GitHub Actions) or admin manually
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { getAdminConfig } from '../../../lib/config/adminConfig';

// Timeout thresholds
const FUNDED_TIMEOUT_DAYS = 14; // Auto-cancel if funded but not shipped in 14 days
const SHIPPED_TIMEOUT_DAYS = 30; // Flag for admin review if shipped but not delivered in 30 days
const DISPUTE_SLA_DAYS = 7; // Escalate disputes not resolved within SLA

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { adminWallet, cronSecret } = req.body;

    // Auth: admin wallet OR cron secret
    const isValidCron = cronSecret && cronSecret === process.env.CRON_SECRET;
    if (!isValidCron) {
      if (!adminWallet) {
        return res.status(401).json({ error: 'adminWallet or cronSecret required' });
      }
      const adminConfig = getAdminConfig();
      if (!adminConfig.isAdmin(adminWallet)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    await dbConnect();
    const now = new Date();
    const results = { cancelled: 0, flagged: 0, escalated: 0 };

    // 1. Auto-cancel funded escrows that haven't been shipped in FUNDED_TIMEOUT_DAYS
    const fundedCutoff = new Date(now.getTime() - FUNDED_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);
    const expiredFunded = await Escrow.updateMany(
      {
        status: 'funded',
        fundedAt: { $lt: fundedCutoff },
        deleted: false,
        'dispute.status': { $nin: ['open', 'under_review'] }, // Don't cancel if disputed
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: `Auto-cancelled: vendor did not ship within ${FUNDED_TIMEOUT_DAYS} days`,
        },
      }
    );
    results.cancelled = expiredFunded.modifiedCount;

    // 2. Flag shipped escrows that haven't been delivered in SHIPPED_TIMEOUT_DAYS
    const shippedCutoff = new Date(now.getTime() - SHIPPED_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);
    const overdueShipped = await Escrow.updateMany(
      {
        status: 'shipped',
        shippedAt: { $lt: shippedCutoff },
        deleted: false,
        overdueFlag: { $ne: true },
      },
      {
        $set: { overdueFlag: true, overdueFlaggedAt: now },
      }
    );
    results.flagged = overdueShipped.modifiedCount;

    // 3. Escalate unresolved disputes past SLA
    const slaCutoff = new Date(now.getTime() - DISPUTE_SLA_DAYS * 24 * 60 * 60 * 1000);
    const overdueDisputes = await Escrow.updateMany(
      {
        'dispute.status': 'open',
        'dispute.createdAt': { $lt: slaCutoff },
      },
      {
        $set: { 'dispute.status': 'escalated' },
      }
    );
    results.escalated = overdueDisputes.modifiedCount;

    return res.status(200).json({
      success: true,
      results,
      thresholds: {
        fundedTimeoutDays: FUNDED_TIMEOUT_DAYS,
        shippedTimeoutDays: SHIPPED_TIMEOUT_DAYS,
        disputeSlaDays: DISPUTE_SLA_DAYS,
      },
      message: `Processed: ${results.cancelled} cancelled, ${results.flagged} flagged, ${results.escalated} escalated`,
    });
  } catch (error: any) {
    console.error('[enforce-timeouts] Error:', error);
    return res.status(500).json({
      error: 'Failed to enforce timeouts',
      details: error?.message || 'Unknown error',
    });
  }
}
