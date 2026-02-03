// src/pages/api/shipping/rates.ts
// Get shipping rates for a shipment
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getShippingRates,
  PARCEL_PRESETS,
  type ShipmentOptions,
} from '../../../lib/shipping/easypost';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Vendor } from '../../../lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowId,
      vendorWallet,
      // From address (vendor's shipping address)
      fromAddress,
      // To address (buyer's shipping address) - can be omitted if escrowId provided
      toAddress,
      // Parcel details
      parcelPreset, // 'watch', 'jewelry', 'small_collectible', 'large_collectible', 'art'
      customParcel, // { length, width, height, weight }
      // Options
      insuranceAmount,
      signatureRequired,
    } = req.body;

    // Validate required fields
    if (!vendorWallet) {
      return res.status(400).json({ error: 'Vendor wallet is required' });
    }

    await dbConnect();

    // Get buyer's shipping address from escrow if escrowId provided
    let buyerAddress = toAddress;
    let escrow = null;

    if (escrowId) {
      escrow = (await Escrow.findById(escrowId).lean()) as any;
      if (!escrow) {
        return res.status(404).json({ error: 'Escrow not found' });
      }

      // Verify vendor owns this escrow
      if (escrow.sellerWallet !== vendorWallet) {
        return res.status(403).json({ error: 'Not authorized to ship this order' });
      }

      // Get buyer's shipping address
      if (escrow.buyerShippingAddress) {
        buyerAddress = {
          name: escrow.buyerShippingAddress.fullName || 'Buyer',
          street1: escrow.buyerShippingAddress.street1 || '',
          street2: escrow.buyerShippingAddress.street2 || '',
          city: escrow.buyerShippingAddress.city || '',
          state: escrow.buyerShippingAddress.state || '',
          zip: escrow.buyerShippingAddress.postalCode || '',
          country: escrow.buyerShippingAddress.country || 'US',
          phone: escrow.buyerShippingAddress.phone || '',
          email: escrow.buyerShippingAddress.email || '',
        };
      }
    }

    // Validate addresses
    if (!fromAddress || !fromAddress.street1 || !fromAddress.city) {
      return res.status(400).json({ error: 'Valid sender address is required' });
    }

    if (!buyerAddress || !buyerAddress.street1 || !buyerAddress.city) {
      return res.status(400).json({ error: 'Buyer shipping address not found' });
    }

    // Get parcel dimensions
    let parcel = customParcel;
    if (parcelPreset && PARCEL_PRESETS[parcelPreset as keyof typeof PARCEL_PRESETS]) {
      parcel = PARCEL_PRESETS[parcelPreset as keyof typeof PARCEL_PRESETS];
    }

    if (!parcel || !parcel.weight) {
      return res.status(400).json({ error: 'Parcel dimensions are required' });
    }

    // Build shipment options
    const shipmentOptions: ShipmentOptions = {
      fromAddress: {
        name: fromAddress.name || 'Vendor',
        street1: fromAddress.street1,
        street2: fromAddress.street2 || '',
        city: fromAddress.city,
        state: fromAddress.state,
        zip: fromAddress.zip || fromAddress.postalCode,
        country: fromAddress.country || 'US',
        phone: fromAddress.phone || '',
        email: fromAddress.email || '',
      },
      toAddress: {
        name: buyerAddress.name,
        street1: buyerAddress.street1,
        street2: buyerAddress.street2 || '',
        city: buyerAddress.city,
        state: buyerAddress.state,
        zip: buyerAddress.zip || buyerAddress.postalCode,
        country: buyerAddress.country || 'US',
        phone: buyerAddress.phone || '',
        email: buyerAddress.email || '',
      },
      parcel: {
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
        weight: parcel.weight,
      },
      insuranceAmount: insuranceAmount,
      signatureRequired: signatureRequired !== false, // Default to true for luxury items
      reference: escrowId || undefined,
    };

    // Get rates
    const result = await getShippingRates(shipmentOptions);

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to get rates' });
    }

    // Store shipment ID in escrow for later purchase
    if (escrow && result.shipmentId) {
      await Escrow.findByIdAndUpdate(escrowId, {
        $set: { pendingShipmentId: result.shipmentId },
      });
    }

    return res.status(200).json({
      success: true,
      shipmentId: result.shipmentId,
      rates: result.rates,
      fromAddress: shipmentOptions.fromAddress,
      toAddress: shipmentOptions.toAddress,
      parcel: shipmentOptions.parcel,
    });
  } catch (error: any) {
    console.error('[/api/shipping/rates] Error:', error);
    return res.status(500).json({
      error: 'Failed to get shipping rates',
      details: error?.message || 'Unknown error',
    });
  }
}
