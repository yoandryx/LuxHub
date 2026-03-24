// src/pages/api/escrow/relist-stuck.ts
// Admin endpoint to manually re-list escrows stuck in offer_accepted status
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Offer } from '../../../lib/models/Offer';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';

interface RelistedEscrow {
  escrowPda: string;
  nftMint: string;
  previousStatus: string;
  acceptedOfferId: string | null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { adminWallet, cronSecret, escrowPdas, dryRun } = req.body;

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

    // Build query for stuck offer_accepted escrows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = {
      status: 'offer_accepted',
      deleted: false,
    };

    // Optionally filter by specific escrow PDAs
    if (escrowPdas && Array.isArray(escrowPdas) && escrowPdas.length > 0) {
      query.escrowPda = { $in: escrowPdas };
    }

    const stuckEscrows = await Escrow.find(query);

    if (dryRun) {
      const preview: RelistedEscrow[] = stuckEscrows.map((e: { escrowPda: string; nftMint: string; status: string; acceptedOfferId: { toString: () => string } | null }) => ({
        escrowPda: e.escrowPda,
        nftMint: e.nftMint || '',
        previousStatus: e.status,
        acceptedOfferId: e.acceptedOfferId ? e.acceptedOfferId.toString() : null,
      }));

      return res.status(200).json({
        success: true,
        dryRun: true,
        wouldRelist: stuckEscrows.length,
        escrows: preview,
      });
    }

    // Relist each stuck escrow
    const relisted: RelistedEscrow[] = [];

    for (const escrow of stuckEscrows) {
      // Expire the associated accepted offer if one exists
      if (escrow.acceptedOfferId) {
        await Offer.findByIdAndUpdate(escrow.acceptedOfferId, {
          $set: {
            status: 'expired',
            autoRejectedReason: 'Admin manual relist',
            respondedAt: now,
          },
        });
      }

      // Revert escrow to listed
      await Escrow.findByIdAndUpdate(escrow._id, {
        $set: {
          status: 'listed',
          acceptedOfferId: null,
        },
      });

      relisted.push({
        escrowPda: escrow.escrowPda,
        nftMint: escrow.nftMint || '',
        previousStatus: escrow.status,
        acceptedOfferId: escrow.acceptedOfferId ? escrow.acceptedOfferId.toString() : null,
      });
    }

    console.log(`[relist-stuck] Relisted ${relisted.length} escrows from offer_accepted to listed`);

    return res.status(200).json({
      success: true,
      relisted: relisted.length,
      escrows: relisted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[relist-stuck] Error:', error);
    return res.status(500).json({
      error: 'Failed to relist stuck escrows',
      details: message,
    });
  }
}

export default withErrorMonitoring(handler);
