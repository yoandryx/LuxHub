// /pages/api/admin/nft/freeze.ts
// Freeze an NFT - marks it as frozen in the database and prevents marketplace actions
// On-chain freeze requires LuxHub to have freeze delegate authority (set during mint)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import Asset from '../../../../lib/models/Assets';
import NFTAuthorityAction from '../../../../lib/models/NFTAuthorityAction';
import { verifyToken } from '../../../../lib/auth/token';
import { JwtPayload } from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin authorization
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authorization.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded || (decoded as JwtPayload).role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized - Admin access required' });
  }

  const { mintAddress, reason, notifyOwner = true } = req.body;

  if (!mintAddress) {
    return res.status(400).json({ error: 'mintAddress is required' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'reason is required for freezing an NFT' });
  }

  try {
    await dbConnect();

    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    // Check if already frozen
    if (dbAsset.status === 'frozen') {
      return res.status(400).json({ error: 'NFT is already frozen' });
    }

    const adminIdentifier =
      (decoded as JwtPayload).wallet || (decoded as JwtPayload).email || 'admin';
    const previousOwner = dbAsset.nftOwnerWallet;

    // Update asset status
    dbAsset.statusBeforeFreeze = dbAsset.status;
    dbAsset.status = 'frozen';
    dbAsset.frozenAt = new Date();
    dbAsset.frozenReason = reason;
    dbAsset.frozenBy = adminIdentifier;
    await dbAsset.save();

    // Record the authority action
    const authorityAction = await NFTAuthorityAction.create({
      mintAddress,
      action: 'freeze',
      reason,
      performedBy: adminIdentifier,
      performedAt: new Date(),
      previousOwner,
      notifyOwner,
      status: 'completed',
      assetId: dbAsset._id,
      metadata: {
        previousStatus: dbAsset.statusBeforeFreeze,
        onChainFreeze: false, // Database freeze only for now
        note: 'On-chain freeze requires LuxHub freeze delegate authority',
      },
    });

    // TODO: If notifyOwner is true, send notification to owner
    // This would integrate with a notification system (email, in-app, etc.)

    return res.status(200).json({
      message: 'NFT frozen successfully',
      mintAddress,
      reason,
      actionId: authorityAction._id,
      owner: previousOwner,
      previousStatus: dbAsset.statusBeforeFreeze,
      note: 'NFT marked as frozen in marketplace. Listings and transfers are blocked.',
    });
  } catch (error) {
    console.error('Error freezing NFT:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
