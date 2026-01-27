// /pages/api/admin/nft/thaw.ts
// Thaw (unfreeze) an NFT - restores it to previous status
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

  // Check if has permission to freeze/thaw NFTs
  const canThaw =
    isEnvAdmin || dbAdmin?.permissions?.canFreezeNfts || dbAdmin?.role === 'super_admin';

  if (!canThaw) {
    return res
      .status(403)
      .json({ error: 'Admin access required - must have canFreezeNfts permission' });
  }

  const { mintAddress, reason, notifyOwner = true } = req.body;

  if (!mintAddress) {
    return res.status(400).json({ error: 'mintAddress is required' });
  }

  try {
    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    // Check if actually frozen
    if (dbAsset.status !== 'frozen') {
      return res.status(400).json({ error: 'NFT is not frozen' });
    }

    const adminIdentifier = requestingWallet;
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
