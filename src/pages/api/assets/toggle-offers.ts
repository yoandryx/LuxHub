// src/pages/api/assets/toggle-offers.ts
// Toggle "open to offers" on an asset — works for both listed and holding NFTs
//
// POST { assetId, wallet, openToOffers: boolean }
// Also toggles acceptingOffers on the associated escrow if one exists
//
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import Asset from '../../../lib/models/Assets';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { assetId, wallet, openToOffers } = req.body;

  if (!assetId || !wallet || typeof openToOffers !== 'boolean') {
    return res.status(400).json({
      error: 'Required: assetId, wallet, openToOffers (boolean)',
    });
  }

  await dbConnect();

  // Find the asset and verify ownership
  const asset = await Asset.findById(assetId);
  if (!asset || asset.deleted) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Check that the caller owns this asset (vendor wallet or current holder)
  const isOwner =
    asset.vendorWallet === wallet ||
    asset.currentOwner === wallet ||
    asset.vendor?.toString() === wallet;

  if (!isOwner) {
    return res.status(403).json({ error: 'Not authorized — only the asset owner can toggle offers' });
  }

  // Update asset
  asset.openToOffers = openToOffers;
  await asset.save();

  // Also update the escrow if one exists (for listed items)
  if (asset.escrowPda) {
    await Escrow.findOneAndUpdate(
      { escrowPda: asset.escrowPda, deleted: false },
      { $set: { acceptingOffers: openToOffers } }
    );
  }

  return res.status(200).json({
    success: true,
    assetId: asset._id,
    openToOffers,
    message: openToOffers
      ? 'Now accepting offers. Anyone viewing this watch can send you an offer.'
      : 'Offers disabled. Only direct purchases available (if listed).',
  });
}
