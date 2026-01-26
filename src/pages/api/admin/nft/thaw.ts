// /pages/api/admin/nft/thaw.ts
// Thaw (unfreeze) an NFT - restores it to previous status
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

  try {
    await dbConnect();

    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    // Check if actually frozen
    if (dbAsset.status !== 'frozen') {
      return res.status(400).json({ error: 'NFT is not frozen' });
    }

    const adminIdentifier =
      (decoded as JwtPayload).wallet || (decoded as JwtPayload).email || 'admin';
    const previousOwner = dbAsset.nftOwnerWallet;

    // Restore previous status
    const restoredStatus = dbAsset.statusBeforeFreeze || 'reviewed';

    dbAsset.status = restoredStatus;
    dbAsset.statusBeforeFreeze = undefined;
    dbAsset.frozenAt = undefined;
    dbAsset.frozenReason = undefined;
    dbAsset.frozenBy = undefined;
    dbAsset.thawedAt = new Date();
    dbAsset.thawedBy = adminIdentifier;
    await dbAsset.save();

    // Record the authority action
    const authorityAction = await NFTAuthorityAction.create({
      mintAddress,
      action: 'thaw',
      reason: reason || 'NFT unfrozen by admin',
      performedBy: adminIdentifier,
      performedAt: new Date(),
      previousOwner,
      notifyOwner,
      status: 'completed',
      assetId: dbAsset._id,
      metadata: {
        restoredStatus,
        onChainThaw: false, // Database thaw only for now
      },
    });

    return res.status(200).json({
      message: 'NFT thawed successfully',
      mintAddress,
      reason: reason || 'NFT unfrozen by admin',
      actionId: authorityAction._id,
      owner: previousOwner,
      restoredStatus,
      note: 'NFT restored to marketplace. Listings and transfers are allowed again.',
    });
  } catch (error) {
    console.error('Error thawing NFT:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
