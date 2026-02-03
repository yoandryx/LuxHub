// src/pages/api/shipping/verify-address.ts
// Verify a shipping address using EasyPost
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAddress, type AddressInput } from '../../../lib/shipping/easypost';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { address } = req.body;

    if (!address || !address.street1 || !address.city || !address.state || !address.zip) {
      return res.status(400).json({
        error: 'Address with street1, city, state, and zip is required',
      });
    }

    const addressInput: AddressInput = {
      name: address.name || address.fullName || '',
      street1: address.street1,
      street2: address.street2 || '',
      city: address.city,
      state: address.state,
      zip: address.zip || address.postalCode,
      country: address.country || 'US',
      phone: address.phone || '',
      email: address.email || '',
    };

    const result = await verifyAddress(addressInput);

    return res.status(200).json({
      success: true,
      valid: result.valid,
      address: result.address,
      messages: result.messages,
    });
  } catch (error: any) {
    console.error('[/api/shipping/verify-address] Error:', error);
    return res.status(500).json({
      error: 'Failed to verify address',
      details: error?.message || 'Unknown error',
    });
  }
}
