// src/pages/api/pool/cleanup-orphans.ts
// Admin-only: delete pools that have no Bags token (failed during creation)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import MintRequest from '../../../lib/models/MintRequest';
import { Asset } from '../../../lib/models/Assets';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.headers['x-wallet-address'] as string;
  if (!wallet) {
    return res.status(401).json({ error: 'Wallet required' });
  }

  await dbConnect();

  const adminConfig = getAdminConfig();
  if (!adminConfig.isAdmin(wallet)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Find orphan pools: status=open, no bagsTokenMint
  const orphans = await Pool.find({
    status: 'open',
    $or: [
      { bagsTokenMint: null },
      { bagsTokenMint: { $exists: false } },
      { bagsTokenMint: '' },
    ],
  });

  const deleted: string[] = [];

  for (const pool of orphans) {
    const assetId = pool.selectedAssetId;

    // Unmark asset as pooled
    if (assetId) {
      await MintRequest.findByIdAndUpdate(assetId, { $set: { pooled: false, poolId: null } });
      await Asset.findByIdAndUpdate(assetId, { $set: { pooled: false, poolId: null, status: 'listed' } });
    }

    await Pool.findByIdAndDelete(pool._id);
    deleted.push(pool._id.toString());
  }

  return res.status(200).json({
    success: true,
    deleted: deleted.length,
    poolIds: deleted,
  });
}
