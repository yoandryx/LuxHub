// src/pages/api/vendor/shipment.ts
// Vendor adds shipping/tracking information for a purchased item
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

interface ShipmentRequest {
  escrowId?: string;
  escrowPda?: string;
  vendorWallet: string;
  trackingCarrier: string; // FedEx, UPS, DHL, USPS, etc.
  trackingNumber: string;
  trackingUrl?: string; // Optional direct tracking URL
  estimatedDeliveryDate?: string; // ISO date string
  shipmentNotes?: string;
  proofUrls?: string[]; // IPFS URLs of shipping proof photos
  shippedFromCity?: string;
  shippedFromState?: string;
  shippedFromCountry?: string;
}

// Common carrier tracking URL templates
const CARRIER_TRACKING_URLS: Record<string, (trackingNumber: string) => string> = {
  fedex: (num) => `https://www.fedex.com/fedextrack/?trknbr=${num}`,
  ups: (num) => `https://www.ups.com/track?tracknum=${num}`,
  usps: (num) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`,
  dhl: (num) =>
    `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${num}`,
  'dhl express': (num) =>
    `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${num}`,
};

function generateTrackingUrl(carrier: string, trackingNumber: string): string | null {
  const carrierKey = carrier
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim();
  const urlGenerator = CARRIER_TRACKING_URLS[carrierKey];
  return urlGenerator ? urlGenerator(trackingNumber) : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowId,
      escrowPda,
      vendorWallet,
      trackingCarrier,
      trackingNumber,
      trackingUrl,
      estimatedDeliveryDate,
      shipmentNotes,
      proofUrls,
      shippedFromCity,
      shippedFromState,
      shippedFromCountry,
    } = req.body as ShipmentRequest;

    // Validation
    if ((!escrowId && !escrowPda) || !vendorWallet) {
      return res.status(400).json({
        error: 'Missing required fields: (escrowId or escrowPda) and vendorWallet',
      });
    }

    if (!trackingCarrier || !trackingNumber) {
      return res.status(400).json({
        error: 'Tracking carrier and tracking number are required',
      });
    }

    await dbConnect();

    // Find the escrow
    let escrow;
    if (escrowId) {
      escrow = await Escrow.findById(escrowId);
    } else if (escrowPda) {
      escrow = await Escrow.findOne({ escrowPda, deleted: false });
    }

    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify vendor ownership
    const user = await User.findOne({ wallet: vendorWallet });
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const vendor = await Vendor.findOne({ user: user._id });

    // Check vendor authorization (either by wallet match or vendor reference)
    const isAuthorized =
      escrow.sellerWallet === vendorWallet ||
      (vendor && escrow.seller?.toString() === vendor._id.toString());

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Not authorized to update shipment for this escrow' });
    }

    // Check escrow status - must be funded (purchased)
    if (escrow.status !== 'funded' && escrow.status !== 'offer_accepted') {
      return res.status(400).json({
        error: `Cannot add shipment info. Escrow status must be 'funded'. Current: ${escrow.status}`,
      });
    }

    // Generate tracking URL if not provided
    const finalTrackingUrl = trackingUrl || generateTrackingUrl(trackingCarrier, trackingNumber);

    // Update escrow with shipment info
    const updateData: any = {
      trackingCarrier: trackingCarrier.trim(),
      trackingNumber: trackingNumber.trim(),
      trackingUrl: finalTrackingUrl,
      shipmentStatus: 'shipped',
      status: 'shipped',
      shipmentSubmittedAt: new Date(),
      vendorShipmentNotes: shipmentNotes,
    };

    if (estimatedDeliveryDate) {
      updateData.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
    }

    if (proofUrls && proofUrls.length > 0) {
      updateData.shipmentProofUrls = proofUrls;
      updateData.shipmentStatus = 'proof_submitted';
    }

    if (shippedFromCity || shippedFromState || shippedFromCountry) {
      updateData.shippedFromAddress = {
        city: shippedFromCity,
        state: shippedFromState,
        country: shippedFromCountry,
      };
    }

    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      { $set: updateData },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Shipment information added successfully',
      shipment: {
        escrowId: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        trackingCarrier: updatedEscrow.trackingCarrier,
        trackingNumber: updatedEscrow.trackingNumber,
        trackingUrl: updatedEscrow.trackingUrl,
        shipmentStatus: updatedEscrow.shipmentStatus,
        estimatedDeliveryDate: updatedEscrow.estimatedDeliveryDate,
        shipmentSubmittedAt: updatedEscrow.shipmentSubmittedAt,
      },
      buyerInfo: {
        wallet: updatedEscrow.buyerWallet,
        shippingAddress: updatedEscrow.buyerShippingAddress
          ? {
              fullName: updatedEscrow.buyerShippingAddress.fullName,
              city: updatedEscrow.buyerShippingAddress.city,
              state: updatedEscrow.buyerShippingAddress.state,
              country: updatedEscrow.buyerShippingAddress.country,
            }
          : null,
      },
      nextSteps: [
        'Buyer will be notified of shipment',
        'Item is now in transit',
        'Buyer will confirm delivery upon receipt',
        'Funds will be released after delivery confirmation',
      ],
    });
  } catch (error: any) {
    console.error('[/api/vendor/shipment] Error:', error);
    return res.status(500).json({
      error: 'Failed to update shipment information',
      details: error?.message || 'Unknown error',
    });
  }
}
