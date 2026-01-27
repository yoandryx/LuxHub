// /pages/api/admin/nft/freeze.ts
// Freeze an NFT - marks it as frozen in the database and prevents marketplace actions
// On-chain freeze requires LuxHub to have freeze delegate authority (set during mint)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import Asset from '../../../../lib/models/Assets';
import NFTAuthorityAction from '../../../../lib/models/NFTAuthorityAction';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Wallet-based admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  // Check if has permission to freeze NFTs
  const canFreeze =
    isEnvAdmin || dbAdmin?.permissions?.canFreezeNfts || dbAdmin?.role === 'super_admin';

  if (!canFreeze) {
    return res
      .status(403)
      .json({ error: 'Admin access required - must have canFreezeNfts permission' });
  }

  const { mintAddress, reason, notifyOwner = true } = req.body;

  if (!mintAddress) {
    return res.status(400).json({ error: 'mintAddress is required' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'reason is required for freezing an NFT' });
  }

  try {
    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    // Check if already frozen
    if (dbAsset.status === 'frozen') {
      return res.status(400).json({ error: 'NFT is already frozen' });
    }

    const adminIdentifier = requestingWallet;
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
