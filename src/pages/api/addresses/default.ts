// src/pages/api/addresses/default.ts
// Get or set the default address for a wallet - SECURED with wallet auth and encryption
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { SavedAddress } from '../../../lib/models/SavedAddress';
import { withWalletAuth, AuthenticatedRequest } from '../../../lib/middleware/walletAuth';
import { decrypt, PII_FIELDS } from '../../../lib/security/encryption';

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

  const wallet = (req as AuthenticatedRequest).wallet;

  if (req.method === 'GET') {
    // Get default address for the authenticated wallet
    try {
      const defaultAddress = await SavedAddress.findOne({
        wallet,
        isDefault: true,
        deleted: false,
      }).lean();

      return res.status(200).json({
        success: true,
        address: defaultAddress ? decryptAddress(defaultAddress) : null,
        hasDefault: !!defaultAddress,
      });
    } catch (error) {
      console.error('[addresses/default] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch default address' });
    }
  }

  if (req.method === 'POST') {
    // Set a new default address
    const { addressId } = req.body;

    if (!addressId || typeof addressId !== 'string') {
      return res.status(400).json({ error: 'Missing address ID' });
    }

    try {
      // Verify ownership (wallet already verified by middleware)
      const address = await SavedAddress.findOne({
        _id: addressId,
        wallet,
        deleted: false,
      });

      if (!address) {
        return res.status(404).json({ error: 'Address not found' });
      }

      // Unset all other defaults
      await SavedAddress.updateMany(
        { wallet, _id: { $ne: addressId }, deleted: false },
        { isDefault: false }
      );

      // Set as default
      address.isDefault = true;
      await address.save();

      return res.status(200).json({
        success: true,
        address: decryptAddress(address.toObject()),
        message: 'Default address updated',
      });
    } catch (error) {
      console.error('[addresses/default] POST error:', error);
      return res.status(500).json({ error: 'Failed to set default address' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Wrap with wallet authentication middleware
export default withWalletAuth(handler);
