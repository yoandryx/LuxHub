// src/pages/api/shipping/track.ts
// Get tracking information for a shipment
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTracking } from '../../../lib/shipping/easypost';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowId, trackingCode, carrier } = req.query;

    let trackingNumber = trackingCode as string;
    let carrierName = carrier as string;

    // If escrowId provided, get tracking from escrow
    if (escrowId && typeof escrowId === 'string') {
      await dbConnect();

      const escrow = (await Escrow.findById(escrowId).lean()) as any;
      if (!escrow) {
        return res.status(404).json({ error: 'Escrow not found' });
      }

      trackingNumber = escrow.trackingNumber;
      carrierName = escrow.trackingCarrier;

      if (!trackingNumber) {
        return res.status(400).json({ error: 'No tracking number found for this order' });
      }
    }

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking code is required' });
    }

    // Get tracking info
    const result = await getTracking(trackingNumber, carrierName);

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to get tracking' });
    }

    // Update escrow status based on tracking if escrowId provided
    if (escrowId && result.tracking) {
      await dbConnect();

      const statusMap: Record<string, string> = {
        pre_transit: 'label_created',
        in_transit: 'in_transit',
        out_for_delivery: 'out_for_delivery',
        delivered: 'delivered',
        failure: 'delivery_failed',
        return_to_sender: 'returned',
      };

      const shipmentStatus = statusMap[result.tracking.status] || result.tracking.status;

      await Escrow.findByIdAndUpdate(escrowId, {
        $set: {
          shipmentStatus,
          lastTrackingUpdate: new Date(),
          ...(result.tracking.status === 'delivered' && {
            actualDeliveryDate: new Date(),
          }),
        },
      });
    }

    return res.status(200).json({
      success: true,
      tracking: result.tracking,
    });
  } catch (error: any) {
    console.error('[/api/shipping/track] Error:', error);
    return res.status(500).json({
      error: 'Failed to get tracking information',
      details: error?.message || 'Unknown error',
    });
  }
}
