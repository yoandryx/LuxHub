// src/pages/api/escrow/submit-shipment.ts
// Vendor submits shipment proof (tracking + photos)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

interface SubmitShipmentRequest {
  escrowPda: string;
  vendorWallet: string;
  trackingCarrier: string; // FedEx, UPS, DHL, USPS, etc.
  trackingNumber: string;
  shipmentProofUrls: string[]; // IPFS URLs of proof photos
}

// Supported carriers
const SUPPORTED_CARRIERS = [
  'fedex',
  'ups',
  'dhl',
  'usps',
  'ontrac',
  'lasership',
  'purolator',
  'canada_post',
  'royal_mail',
  'australia_post',
  'japan_post',
  'other',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowPda, vendorWallet, trackingCarrier, trackingNumber, shipmentProofUrls } =
      req.body as SubmitShipmentRequest;

    // Validation
    if (!escrowPda || !vendorWallet || !trackingCarrier || !trackingNumber) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, vendorWallet, trackingCarrier, trackingNumber',
      });
    }

    // Validate carrier
    const normalizedCarrier = trackingCarrier.toLowerCase().replace(/\s+/g, '_');
    if (!SUPPORTED_CARRIERS.includes(normalizedCarrier)) {
      return res.status(400).json({
        error: `Unsupported carrier. Supported: ${SUPPORTED_CARRIERS.join(', ')}`,
      });
    }

    // Validate proof URLs
    if (!shipmentProofUrls || !Array.isArray(shipmentProofUrls) || shipmentProofUrls.length === 0) {
      return res.status(400).json({
        error: 'At least one shipment proof image URL is required',
      });
    }

    // Validate URLs are IPFS or valid HTTP(S)
    const validUrlPattern = /^(https?:\/\/|ipfs:\/\/)/i;
    const invalidUrls = shipmentProofUrls.filter((url) => !validUrlPattern.test(url));
    if (invalidUrls.length > 0) {
      return res.status(400).json({
        error: 'Invalid proof URLs detected. Must be HTTPS or IPFS URLs.',
        invalidUrls,
      });
    }

    await dbConnect();

    // Find the escrow
    const escrow = await Escrow.findOne({ escrowPda, deleted: false });
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify vendor ownership
    const user = await User.findOne({ wallet: vendorWallet });
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const vendor = await Vendor.findOne({ user: user._id });
    if (!vendor) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    // Check if this vendor owns the escrow
    if (
      escrow.sellerWallet !== vendorWallet &&
      escrow.seller?.toString() !== vendor._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to update this escrow' });
    }

    // Check escrow status - must have a buyer and be in funded state
    if (!escrow.buyer) {
      return res.status(400).json({
        error: 'Cannot submit shipment proof - no buyer assigned yet',
      });
    }

    const allowedStatuses = ['funded', 'shipped'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot submit shipment when escrow status is '${escrow.status}'. Required: funded or shipped`,
      });
    }

    // Update escrow with shipment information
    const updatedEscrow = await Escrow.findByIdAndUpdate(
      escrow._id,
      {
        $set: {
          trackingCarrier: normalizedCarrier,
          trackingNumber,
          shipmentProofUrls,
          shipmentStatus: 'proof_submitted',
          shipmentSubmittedAt: new Date(),
          status: 'shipped',
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      escrow: {
        _id: updatedEscrow._id,
        escrowPda: updatedEscrow.escrowPda,
        status: updatedEscrow.status,
        shipmentStatus: updatedEscrow.shipmentStatus,
        trackingCarrier: updatedEscrow.trackingCarrier,
        trackingNumber: updatedEscrow.trackingNumber,
        shipmentProofUrls: updatedEscrow.shipmentProofUrls,
        shipmentSubmittedAt: updatedEscrow.shipmentSubmittedAt,
      },
      trackingLink: getTrackingLink(normalizedCarrier, trackingNumber),
      message: 'Shipment proof submitted. Awaiting admin verification.',
    });
  } catch (error: any) {
    console.error('[/api/escrow/submit-shipment] Error:', error);
    return res.status(500).json({
      error: 'Failed to submit shipment proof',
      details: error?.message || 'Unknown error',
    });
  }
}

// Helper to generate tracking links
function getTrackingLink(carrier: string, trackingNumber: string): string | null {
  const trackingUrls: Record<string, string> = {
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    ontrac: `https://www.ontrac.com/tracking/?number=${trackingNumber}`,
    lasership: `https://www.lasership.com/track/${trackingNumber}`,
    purolator: `https://www.purolator.com/en/track-package?trackingNumbers=${trackingNumber}`,
    canada_post: `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${trackingNumber}`,
    royal_mail: `https://www.royalmail.com/track-your-item#/tracking-results/${trackingNumber}`,
    australia_post: `https://auspost.com.au/mypost/track/#/details/${trackingNumber}`,
    japan_post: `https://trackings.post.japanpost.jp/services/srv/search/?requestNo1=${trackingNumber}`,
  };

  return trackingUrls[carrier] || null;
}
