// src/pages/api/escrow/enforce-timeouts.ts
// Enforce escrow timeouts — auto-cancel expired escrows and flag overdue shipments
// Call this via cron (Vercel cron, GitHub Actions) or admin manually
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { getAdminConfig } from '../../../lib/config/adminConfig';

// Timeout thresholds
const FUNDED_TIMEOUT_DAYS = 14; // Auto-cancel if funded but not shipped in 14 days
const SHIPPED_TIMEOUT_DAYS = 30; // Flag for admin review if shipped but not delivered in 30 days
const DISPUTE_SLA_DAYS = 7; // Escalate disputes not resolved within SLA
const OFFER_ACCEPTED_TIMEOUT_HOURS = 48; // Safety net: auto-relist if offer_accepted but no payment in 48h
const INITIATED_TIMEOUT_DAYS = 7; // Auto-cancel if stuck in initiated (no listing price set) for 7 days
const DELIVERED_TIMEOUT_DAYS = 14; // Flag for admin if delivered but funds not released in 14 days

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { adminWallet, cronSecret } = req.body || {};

    // Auth: admin wallet OR cron secret (body or Authorization header)
    // Vercel cron sends GET with Authorization: Bearer <CRON_SECRET>
    const authHeader = req.headers['authorization'];
    const isValidCron =
      (cronSecret && cronSecret === process.env.CRON_SECRET) ||
      (typeof authHeader === 'string' && authHeader === `Bearer ${process.env.CRON_SECRET}`);
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
    const results = { cancelled: 0, flagged: 0, escalated: 0, expiredOffers: 0, relistedStale: 0, staleInitiated: 0, deliveredUnreleased: 0 };

    // 0. Expire accepted offers past payment deadline (24h) — revert escrow to listed
    const expiredAcceptedOffers = await Offer.find({
      status: 'accepted',
      paymentDeadline: { $lt: now },
      deleted: false,
    });

    for (const offer of expiredAcceptedOffers) {
      await Offer.findByIdAndUpdate(offer._id, {
        $set: {
          status: 'expired',
          autoRejectedReason: 'Buyer did not pay within 24 hours of acceptance',
          respondedAt: now,
        },
      });

      // Revert escrow back to listed if it was waiting for this buyer's payment
      if (offer.escrowPda) {
        await Escrow.findOneAndUpdate(
          {
            escrowPda: offer.escrowPda,
            status: 'offer_accepted',
            acceptedOfferId: offer._id,
          },
          {
            $set: {
              status: 'listed',
              acceptedOfferId: null,
              buyerWallet: null,
            },
          }
        );
      }
      results.expiredOffers++;
    }

    // 0.5 Safety net: relist escrows stuck in offer_accepted for 48h+
    // Catches edge cases where the accepted offer has no paymentDeadline or was missed by Section 0
    const offerAcceptedCutoff = new Date(now.getTime() - OFFER_ACCEPTED_TIMEOUT_HOURS * 60 * 60 * 1000);
    const staleOfferAccepted = await Escrow.find({
      status: 'offer_accepted',
      updatedAt: { $lt: offerAcceptedCutoff },
      deleted: false,
    });

    for (const escrow of staleOfferAccepted) {
      // Expire the associated accepted offer if one exists
      if (escrow.acceptedOfferId) {
        await Offer.findByIdAndUpdate(escrow.acceptedOfferId, {
          $set: {
            status: 'expired',
            autoRejectedReason: 'Escrow auto-relisted: buyer did not pay within 48 hours',
            respondedAt: now,
          },
        });
      }

      // Revert escrow back to listed
      await Escrow.findByIdAndUpdate(escrow._id, {
        $set: {
          status: 'listed',
          acceptedOfferId: null,
        },
      });

      results.relistedStale++;
    }

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

    // 4. Auto-cancel escrows stuck in 'initiated' (no listing price set) for too long
    const initiatedCutoff = new Date(now.getTime() - INITIATED_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);
    const staleInitiated = await Escrow.updateMany(
      {
        status: 'initiated',
        createdAt: { $lt: initiatedCutoff },
        deleted: false,
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: `Auto-cancelled: stuck in initiated state for ${INITIATED_TIMEOUT_DAYS}+ days`,
        },
      }
    );
    results.staleInitiated = staleInitiated.modifiedCount;

    // 5. Flag delivered escrows where funds haven't been released (admin needs to confirm delivery)
    const deliveredCutoff = new Date(now.getTime() - DELIVERED_TIMEOUT_DAYS * 24 * 60 * 60 * 1000);
    const unreleased = await Escrow.updateMany(
      {
        status: 'delivered',
        deliveredAt: { $lt: deliveredCutoff },
        deleted: false,
        overdueFlag: { $ne: true },
      },
      {
        $set: { overdueFlag: true, overdueFlaggedAt: now },
      }
    );
    results.deliveredUnreleased = unreleased.modifiedCount;

    return res.status(200).json({
      success: true,
      results,
      thresholds: {
        fundedTimeoutDays: FUNDED_TIMEOUT_DAYS,
        shippedTimeoutDays: SHIPPED_TIMEOUT_DAYS,
        disputeSlaDays: DISPUTE_SLA_DAYS,
        offerAcceptedTimeoutHours: OFFER_ACCEPTED_TIMEOUT_HOURS,
        initiatedTimeoutDays: INITIATED_TIMEOUT_DAYS,
        deliveredTimeoutDays: DELIVERED_TIMEOUT_DAYS,
      },
      message: `Processed: ${results.expiredOffers} expired offers, ${results.relistedStale} relisted stale, ${results.cancelled} cancelled, ${results.staleInitiated} stale initiated, ${results.flagged} flagged, ${results.deliveredUnreleased} delivered unreleased, ${results.escalated} escalated`,
    });
  } catch (error: any) {
    console.error('[enforce-timeouts] Error:', error);
    return res.status(500).json({
      error: 'Failed to enforce timeouts',
      details: error?.message || 'Unknown error',
    });
  }
}
