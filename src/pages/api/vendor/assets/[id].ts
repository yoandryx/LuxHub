// /pages/api/vendor/assets/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import { Asset } from '../../../../lib/models/Assets';
import { Vendor } from '../../../../lib/models/Vendor';
import { User } from '../../../../lib/models/User';
import type { LeanDocument, AssetDocument } from '../../../../types/mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing asset ID' });
  }

  await dbConnect();

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'DELETE':
      return handleDelete(req, res, id);
    case 'PATCH':
      return handleUpdate(req, res, id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

// GET: Fetch single asset
async function handleGet(req: NextApiRequest, res: NextApiResponse, assetId: string) {
  try {
    const asset = await Asset.findById(assetId).lean<AssetDocument>();
    if (!asset || asset.deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.status(200).json({ asset });
  } catch (err) {
    console.error('[vendor/assets/[id]] GET Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE: Remove pending asset
async function handleDelete(req: NextApiRequest, res: NextApiResponse, assetId: string) {
  try {
    const { wallet } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet address' });
    }

    // Find the vendor by wallet
    const user = await User.findOne({ wallet }).lean<LeanDocument>();
    if (!user) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const vendor = await Vendor.findOne({ user: user._id }).lean<LeanDocument>();
    if (!vendor) {
      return res.status(403).json({ error: 'Unauthorized - vendor not found' });
    }

    // Find the asset
    const asset = await Asset.findById(assetId);
    if (!asset || asset.deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Verify ownership
    if (asset.vendor?.toString() !== vendor._id?.toString()) {
      return res.status(403).json({ error: 'Unauthorized - not your asset' });
    }

    // Only allow deletion of pending assets
    if (asset.status !== 'pending') {
      return res.status(400).json({
        error: 'Cannot delete asset - only pending assets can be deleted',
      });
    }

    // Soft delete
    asset.deleted = true;
    await asset.save();

    res.status(200).json({ success: true, message: 'Asset deleted' });
  } catch (err) {
    console.error('[vendor/assets/[id]] DELETE Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PATCH: Update pending asset
async function handleUpdate(req: NextApiRequest, res: NextApiResponse, assetId: string) {
  try {
    const { wallet, ...updates } = req.body;

    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet address' });
    }

    // Find the vendor by wallet
    const user = await User.findOne({ wallet }).lean<LeanDocument>();
    if (!user) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const vendor = await Vendor.findOne({ user: user._id }).lean<LeanDocument>();
    if (!vendor) {
      return res.status(403).json({ error: 'Unauthorized - vendor not found' });
    }

    // Find the asset
    const asset = await Asset.findById(assetId);
    if (!asset || asset.deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Verify ownership
    if (asset.vendor?.toString() !== vendor._id?.toString()) {
      return res.status(403).json({ error: 'Unauthorized - not your asset' });
    }

    // Only allow updates to pending assets
    if (asset.status !== 'pending') {
      return res.status(400).json({
        error: 'Cannot update asset - only pending assets can be modified',
      });
    }

    // Allowed fields to update
    const allowedFields = ['model', 'serial', 'description', 'priceUSD', 'images', 'imageIpfsUrls'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        (asset as any)[field] = updates[field];
      }
    }

    await asset.save();

    res.status(200).json({ success: true, asset });
  } catch (err) {
    console.error('[vendor/assets/[id]] PATCH Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
