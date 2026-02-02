// /pages/api/admin/assets/cleanup.ts
// Admin endpoint to cleanup failed/test mints from database
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import Asset from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // Wallet-based admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  if (!isEnvSuperAdmin && !dbAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // GET: List assets that can be cleaned up
  if (req.method === 'GET') {
    try {
      const { status, showDeleted } = req.query;

      const query: any = {};

      // Filter by status if provided
      if (status) {
        query.status = status;
      }

      // Include deleted assets if requested
      if (showDeleted !== 'true') {
        query.deleted = { $ne: true };
      }

      const assets = await Asset.find(query)
        .select('_id model nftMint status priceUSD createdAt nftOwnerWallet images imageIpfsUrls')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      // Identify potentially failed mints (no image, empty data, etc.)
      const flaggedAssets = assets.map((asset: any) => ({
        _id: asset._id,
        model: asset.model || 'Untitled',
        mintAddress: asset.nftMint,
        status: asset.status,
        priceUSD: asset.priceUSD,
        createdAt: asset.createdAt,
        owner: asset.nftOwnerWallet,
        hasImage: !!(asset.images?.[0] || asset.imageIpfsUrls?.[0]),
        flags: [
          !asset.images?.[0] && !asset.imageIpfsUrls?.[0] ? 'NO_IMAGE' : null,
          !asset.model ? 'NO_MODEL' : null,
          !asset.priceUSD ? 'NO_PRICE' : null,
        ].filter(Boolean),
      }));

      return res.status(200).json({
        total: flaggedAssets.length,
        assets: flaggedAssets,
        note: 'Use POST to delete specific assets by ID or mintAddress',
      });
    } catch (error) {
      console.error('[cleanup] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch assets' });
    }
  }

  // POST: Delete/cleanup specific assets
  if (req.method === 'POST') {
    const { assetIds, mintAddresses, action = 'soft_delete', reason } = req.body;

    if (!assetIds && !mintAddresses) {
      return res.status(400).json({
        error: 'Provide assetIds or mintAddresses array',
        example: {
          assetIds: ['id1', 'id2'],
          action: 'soft_delete', // or 'hard_delete' or 'burn'
          reason: 'Cleanup failed test mints',
        },
      });
    }

    try {
      const query: any = { $or: [] };

      if (assetIds?.length) {
        query.$or.push({ _id: { $in: assetIds } });
      }
      if (mintAddresses?.length) {
        query.$or.push({ nftMint: { $in: mintAddresses } });
      }

      let result;

      if (action === 'hard_delete') {
        // Permanent deletion from database
        result = await Asset.deleteMany(query);
        return res.status(200).json({
          success: true,
          action: 'hard_delete',
          deletedCount: result.deletedCount,
          message: `Permanently deleted ${result.deletedCount} assets from database`,
          warning: 'On-chain NFTs still exist - this only removes database records',
        });
      } else if (action === 'burn') {
        // Mark as burned
        result = await Asset.updateMany(query, {
          $set: {
            status: 'burned',
            burnedAt: new Date(),
            burnedReason: reason || 'Admin cleanup',
            burnedBy: requestingWallet,
          },
        });
        return res.status(200).json({
          success: true,
          action: 'burn',
          modifiedCount: result.modifiedCount,
          message: `Marked ${result.modifiedCount} assets as burned`,
        });
      } else {
        // Default: soft delete
        result = await Asset.updateMany(query, {
          $set: { deleted: true },
        });
        return res.status(200).json({
          success: true,
          action: 'soft_delete',
          modifiedCount: result.modifiedCount,
          message: `Soft deleted ${result.modifiedCount} assets`,
        });
      }
    } catch (error) {
      console.error('[cleanup] POST error:', error);
      return res.status(500).json({ error: 'Failed to cleanup assets' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
