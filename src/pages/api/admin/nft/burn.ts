// /pages/api/admin/nft/burn.ts
// Burn an NFT - permanently marks it as burned in the database
// On-chain burn requires LuxHub to own the NFT or have burn authority
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import Asset from '../../../../lib/models/Assets';
import NFTAuthorityAction from '../../../../lib/models/NFTAuthorityAction';
import { verifyToken } from '../../../../lib/auth/token';
import { JwtPayload } from 'jsonwebtoken';
import { getAdminConfig } from '../../../../lib/config/adminConfig';

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

  // Require super admin for burn operations
  const adminConfig = getAdminConfig();
  const adminWallet = (decoded as JwtPayload).wallet;

  // Only check super admin if super admin wallets are configured
  if (adminConfig.superAdminWallets.length > 0 && !adminConfig.isSuperAdmin(adminWallet)) {
    return res.status(403).json({ error: 'Only super admins can burn NFTs' });
  }

  const { mintAddress, reason, confirmBurn = false, notifyOwner = true } = req.body;

  if (!mintAddress) {
    return res.status(400).json({ error: 'mintAddress is required' });
  }

  if (!reason) {
    return res.status(400).json({ error: 'reason is required for burning an NFT' });
  }

  // Safety check - require explicit confirmation
  if (!confirmBurn) {
    return res.status(400).json({
      error: 'Burning an NFT is permanent. Set confirmBurn: true to proceed.',
      warning: 'This action cannot be undone. The NFT will be marked as permanently burned.',
    });
  }

  try {
    await dbConnect();

    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    // Check if already burned
    if (dbAsset.status === 'burned') {
      return res.status(400).json({ error: 'NFT is already burned' });
    }

    const adminIdentifier =
      (decoded as JwtPayload).wallet || (decoded as JwtPayload).email || 'admin';
    const previousOwner = dbAsset.nftOwnerWallet;
    const previousStatus = dbAsset.status;

    // Record the action first (in case something fails)
    const authorityAction = await NFTAuthorityAction.create({
      mintAddress,
      action: 'burn',
      reason,
      performedBy: adminIdentifier,
      performedAt: new Date(),
      previousOwner,
      notifyOwner,
      status: 'completed',
      assetId: dbAsset._id,
      metadata: {
        previousStatus,
        onChainBurn: false, // Database burn only for now
        note: 'On-chain burn requires LuxHub to own the NFT or have burn authority',
      },
      burnedAssetData: {
        name: dbAsset.model,
        uri: dbAsset.metadataIpfsUrl,
        attributes: dbAsset.metaplexMetadata?.attributes,
      },
    });

    // Update asset status
    dbAsset.status = 'burned';
    dbAsset.burnedAt = new Date();
    dbAsset.burnedReason = reason;
    dbAsset.burnedBy = adminIdentifier;
    dbAsset.previousOwnerBeforeBurn = previousOwner;
    await dbAsset.save();

    return res.status(200).json({
      message: 'NFT marked as burned',
      mintAddress,
      reason,
      actionId: authorityAction._id,
      previousOwner,
      warning:
        'The NFT has been marked as burned in the database. On-chain burn requires additional authority setup.',
      note: 'This NFT will no longer appear in the marketplace and cannot be traded.',
    });
  } catch (error) {
    console.error('Error burning NFT:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
