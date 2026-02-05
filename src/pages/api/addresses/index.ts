// src/pages/api/addresses/index.ts
// List and create saved shipping addresses - SECURED with wallet auth and encryption
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { SavedAddress } from '../../../lib/models/SavedAddress';
import { withWalletAuth, AuthenticatedRequest } from '../../../lib/middleware/walletAuth';
import { encrypt, decrypt, PII_FIELDS } from '../../../lib/security/encryption';

// Decrypt PII fields in an address object
function decryptAddress(address: any): any {
  if (!address) return address;
  const decrypted = { ...address };
  for (const field of PII_FIELDS) {
    if (decrypted[field]) {
      decrypted[field] = decrypt(decrypted[field]);
    }
  }
  return decrypted;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // Get verified wallet from middleware
  const wallet = (req as AuthenticatedRequest).wallet;

  if (req.method === 'GET') {
    // List addresses for the authenticated wallet
    try {
      const addresses = await SavedAddress.find({ wallet, deleted: false })
        .sort({ isDefault: -1, updatedAt: -1 })
        .lean();

      // Decrypt PII fields before sending to client
      const decryptedAddresses = addresses.map(decryptAddress);

      return res.status(200).json({
        success: true,
        addresses: decryptedAddresses,
        count: decryptedAddresses.length,
      });
    } catch (error) {
      console.error('[addresses/index] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch addresses' });
    }
  }

  if (req.method === 'POST') {
    // Create a new saved address
    const {
      label,
      fullName,
      street1,
      street2,
      city,
      state,
      postalCode,
      country,
      phone,
      email,
      deliveryInstructions,
      isDefault,
    } = req.body;

    // Validate required fields
    if (!fullName || !street1 || !city || !state || !postalCode || !country) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['fullName', 'street1', 'city', 'state', 'postalCode', 'country'],
      });
    }

    try {
      // Check address limit (max 10 per wallet)
      const existingCount = await SavedAddress.countDocuments({ wallet, deleted: false });
      if (existingCount >= 10) {
        return res.status(400).json({
          error: 'Maximum addresses reached',
          message: 'You can save up to 10 addresses. Please delete an existing address first.',
        });
      }

      // If setting as default, unset other defaults
      if (isDefault) {
        await SavedAddress.updateMany({ wallet, deleted: false }, { isDefault: false });
      }

      // Auto-set as default if this is the first address
      const shouldBeDefault = isDefault || existingCount === 0;

      // Encrypt PII fields before storing
      const newAddress = await SavedAddress.create({
        wallet,
        label: label || 'Address ' + (existingCount + 1),
        fullName: encrypt(fullName),
        street1: encrypt(street1),
        street2: street2 ? encrypt(street2) : undefined,
        city,
        state,
        postalCode,
        country: country || 'United States',
        phone: phone ? encrypt(phone) : undefined,
        email: email ? encrypt(email) : undefined,
        deliveryInstructions: deliveryInstructions ? encrypt(deliveryInstructions) : undefined,
        isDefault: shouldBeDefault,
      });

      // Decrypt for response
      const decryptedAddress = decryptAddress(newAddress.toObject());

      return res.status(201).json({
        success: true,
        address: decryptedAddress,
        message: 'Address saved successfully',
      });
    } catch (error) {
      console.error('[addresses/index] POST error:', error);
      return res.status(500).json({ error: 'Failed to create address' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Wrap with wallet authentication middleware
export default withWalletAuth(handler);
