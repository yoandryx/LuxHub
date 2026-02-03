// src/pages/api/shipping/purchase-label.ts
// Purchase a shipping label for an order
import type { NextApiRequest, NextApiResponse } from 'next';
import { purchaseLabel } from '../../../lib/shipping/easypost';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { escrowId, shipmentId, rateId, vendorWallet, insuranceAmount } = req.body;

    // Validate required fields
    if (!escrowId || !vendorWallet) {
      return res.status(400).json({ error: 'Escrow ID and vendor wallet are required' });
    }

    if (!shipmentId || !rateId) {
      return res.status(400).json({ error: 'Shipment ID and rate ID are required' });
    }

    await dbConnect();

    // Get the escrow
    const escrow = (await Escrow.findById(escrowId).lean()) as any;
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify vendor owns this escrow
    if (escrow.sellerWallet !== vendorWallet) {
      return res.status(403).json({ error: 'Not authorized to ship this order' });
    }

    // Check escrow status
    if (escrow.status !== 'funded') {
      return res.status(400).json({
        error: `Cannot create label for order with status: ${escrow.status}`,
      });
    }

    // Purchase the label
    const result = await purchaseLabel(shipmentId, rateId, insuranceAmount);

    if (!result.success || !result.shipment) {
      return res.status(400).json({ error: result.error || 'Failed to purchase label' });
    }

    // Update escrow with shipping info
    await Escrow.findByIdAndUpdate(escrowId, {
      $set: {
        status: 'shipped',
        shipmentStatus: 'label_created',
        trackingCarrier: result.shipment.carrier,
        trackingNumber: result.shipment.trackingCode,
        trackingUrl: result.shipment.trackingUrl,
        shippingLabelUrl: result.shipment.labelUrl,
        shippingLabelFormat: result.shipment.labelFormat,
        easypostShipmentId: result.shipment.shipmentId,
        shippingRate: result.shipment.rate,
        shippingInsurance: result.shipment.insuranceAmount,
        estimatedDeliveryDate: result.shipment.estimatedDeliveryDate,
        shipmentSubmittedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      label: {
        trackingCode: result.shipment.trackingCode,
        trackingUrl: result.shipment.trackingUrl,
        labelUrl: result.shipment.labelUrl,
        labelFormat: result.shipment.labelFormat,
        carrier: result.shipment.carrier,
        service: result.shipment.service,
        rate: result.shipment.rate,
        insuranceAmount: result.shipment.insuranceAmount,
        estimatedDeliveryDate: result.shipment.estimatedDeliveryDate,
      },
      message: 'Shipping label created successfully. Print the label and ship your item.',
    });
  } catch (error: any) {
    console.error('[/api/shipping/purchase-label] Error:', error);
    return res.status(500).json({
      error: 'Failed to purchase shipping label',
      details: error?.message || 'Unknown error',
    });
  }
}
