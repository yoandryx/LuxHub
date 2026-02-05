// src/pages/api/addresses/[id].ts
// Get, update, or delete a specific saved address - SECURED with wallet auth and encryption
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

  const { id } = req.query;
  const wallet = (req as AuthenticatedRequest).wallet;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing address ID' });
  }

  // Find the address and verify ownership (wallet already verified by middleware)
  const address = await SavedAddress.findOne({ _id: id, wallet, deleted: false });

  if (!address) {
    return res.status(404).json({ error: 'Address not found' });
  }

  if (req.method === 'GET') {
    // Return single address (decrypted)
    return res.status(200).json({
      success: true,
      address: decryptAddress(address.toObject()),
    });
  }

  if (req.method === 'PUT') {
    // Update address
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

    try {
      // If setting as default, unset other defaults
      if (isDefault && !address.isDefault) {
        await SavedAddress.updateMany(
          { wallet, _id: { $ne: id }, deleted: false },
          { isDefault: false }
        );
      }

      // Update fields (encrypt PII fields)
      if (label !== undefined) address.label = label;
      if (fullName !== undefined) address.fullName = encrypt(fullName);
      if (street1 !== undefined) address.street1 = encrypt(street1);
      if (street2 !== undefined) address.street2 = street2 ? encrypt(street2) : '';
      if (city !== undefined) address.city = city;
      if (state !== undefined) address.state = state;
      if (postalCode !== undefined) address.postalCode = postalCode;
      if (country !== undefined) address.country = country;
      if (phone !== undefined) address.phone = phone ? encrypt(phone) : '';
      if (email !== undefined) address.email = email ? encrypt(email) : '';
      if (deliveryInstructions !== undefined) {
        address.deliveryInstructions = deliveryInstructions ? encrypt(deliveryInstructions) : '';
      }
      if (isDefault !== undefined) address.isDefault = isDefault;

      await address.save();

      return res.status(200).json({
        success: true,
        address: decryptAddress(address.toObject()),
        message: 'Address updated successfully',
      });
    } catch (error) {
      console.error('[addresses/[id]] PUT error:', error);
      return res.status(500).json({ error: 'Failed to update address' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Soft delete
      address.deleted = true;
      await address.save();

      // If this was the default, set another as default
      if (address.isDefault) {
        const nextDefault = await SavedAddress.findOne({ wallet, deleted: false }).sort({
          updatedAt: -1,
        });
        if (nextDefault) {
          nextDefault.isDefault = true;
          await nextDefault.save();
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Address deleted successfully',
      });
    } catch (error) {
      console.error('[addresses/[id]] DELETE error:', error);
      return res.status(500).json({ error: 'Failed to delete address' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Wrap with wallet authentication middleware
export default withWalletAuth(handler);
