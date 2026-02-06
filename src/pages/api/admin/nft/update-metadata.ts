// /pages/api/admin/nft/update-metadata.ts
// Update NFT metadata in the database (e.g., watch condition, verification status)
// On-chain metadata update requires LuxHub to have update authority
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import Asset from '../../../../lib/models/Assets';
import NFTAuthorityAction from '../../../../lib/models/NFTAuthorityAction';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

// Helper to upload metadata to Pinata
async function uploadMetadataToPinata(metadata: object, title: string): Promise<string> {
  const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY || process.env.PINATA_API_KEY;
  const pinataSecretKey =
    process.env.PINATA_API_SECRET_KEY || process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

  if (!pinataApiKey || !pinataSecretKey) {
    throw new Error('Pinata API keys not configured');
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      pinata_api_key: pinataApiKey,
      pinata_secret_api_key: pinataSecretKey,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: { name: `${title}-metadata-updated` },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload metadata to Pinata');
  }

  const data = await response.json();
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
  return `${gateway}${data.IpfsHash}`;
}

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

  // Check if has admin access
  const canUpdate = isEnvAdmin || dbAdmin?.isActive;

  if (!canUpdate) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const {
    mintAddress,
    reason,
    updates, // Object containing fields to update
    notifyOwner = true,
    uploadToIpfs = true, // Whether to upload new metadata to IPFS
  } = req.body;

  if (!mintAddress) {
    return res.status(400).json({ error: 'mintAddress is required' });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'updates object is required with fields to update' });
  }

  // Allowed update fields
  const allowedFields = [
    'name',
    'description',
    'condition',
    'verificationStatus',
    'authenticityScore',
    'lastInspectionDate',
    'inspectionNotes',
    'serviceHistory',
    'priceUSD',
    'attributes',
  ];

  const invalidFields = Object.keys(updates).filter((key) => !allowedFields.includes(key));
  if (invalidFields.length > 0) {
    return res.status(400).json({
      error: `Invalid update fields: ${invalidFields.join(', ')}`,
      allowedFields,
    });
  }

  try {
    // Find the asset in database
    const dbAsset = await Asset.findOne({ nftMint: mintAddress });
    if (!dbAsset) {
      return res.status(404).json({ error: 'NFT not found in database' });
    }

    const adminIdentifier = requestingWallet;
    const previousUri = dbAsset.metadataIpfsUrl;

    // Build updated metadata for IPFS
    let newMetadataUri: string | null = null;
    if (uploadToIpfs) {
      try {
        // Fetch existing metadata if available
        let existingMetadata: Record<string, unknown> = {};
        if (dbAsset.metadataIpfsUrl) {
          try {
            const metadataResponse = await fetch(dbAsset.metadataIpfsUrl);
            if (metadataResponse.ok) {
              existingMetadata = await metadataResponse.json();
            }
          } catch (e) {
            console.warn('Could not fetch existing metadata:', e);
          }
        }

        const updatedMetadata = {
          ...existingMetadata,
          name: updates.name || existingMetadata.name || dbAsset.model,
          description: updates.description || existingMetadata.description || dbAsset.description,
          properties: {
            ...((existingMetadata.properties as object) || {}),
            luxhub: {
              ...((existingMetadata.properties as Record<string, unknown>)?.luxhub || {}),
              lastUpdated: new Date().toISOString(),
              updatedBy: adminIdentifier,
              updateReason: reason,
              ...(updates.condition && { condition: updates.condition }),
              ...(updates.verificationStatus && { verificationStatus: updates.verificationStatus }),
              ...(updates.authenticityScore && { authenticityScore: updates.authenticityScore }),
              ...(updates.lastInspectionDate && { lastInspectionDate: updates.lastInspectionDate }),
              ...(updates.inspectionNotes && { inspectionNotes: updates.inspectionNotes }),
              ...(updates.serviceHistory && { serviceHistory: updates.serviceHistory }),
              ...(updates.priceUSD && { priceUSD: updates.priceUSD }),
            },
          },
        };

        newMetadataUri = await uploadMetadataToPinata(
          updatedMetadata,
          updates.name || dbAsset.model || 'LuxHub-Asset'
        );
      } catch (error) {
        console.error('Failed to upload metadata to IPFS:', error);
        // Continue without IPFS upload - still update database
      }
    }

    // Record the action
    const authorityAction = await NFTAuthorityAction.create({
      mintAddress,
      action: 'update_metadata',
      reason: reason || 'Metadata update',
      performedBy: adminIdentifier,
      performedAt: new Date(),
      previousOwner: dbAsset.nftOwnerWallet,
      notifyOwner,
      status: 'completed',
      assetId: dbAsset._id,
      previousUri,
      newUri: newMetadataUri,
      metadata: {
        updates,
        onChainUpdate: false, // Database update only for now
        ipfsUpdated: !!newMetadataUri,
      },
    });

    // Update asset in database
    if (updates.condition) dbAsset.condition = updates.condition;
    if (updates.priceUSD) dbAsset.priceUSD = updates.priceUSD;
    if (updates.description) dbAsset.description = updates.description;
    if (newMetadataUri) dbAsset.metadataIpfsUrl = newMetadataUri;

    dbAsset.lastMetadataUpdate = new Date();
    dbAsset.lastUpdatedBy = adminIdentifier;

    // Track metadata history
    if (!dbAsset.metadataHistory) {
      dbAsset.metadataHistory = [];
    }
    dbAsset.metadataHistory.push({
      uri: newMetadataUri || previousUri,
      updatedAt: new Date(),
      updatedBy: adminIdentifier,
      reason: reason || 'Metadata update',
      changes: updates,
    });

    // Update AI verification if verification status changed
    if (updates.verificationStatus || updates.authenticityScore) {
      if (!dbAsset.aiVerification) {
        dbAsset.aiVerification = {};
      }
      if (updates.verificationStatus) {
        dbAsset.aiVerification.verified = updates.verificationStatus === 'verified';
      }
      if (updates.authenticityScore) {
        dbAsset.aiVerification.authenticityScore = updates.authenticityScore;
      }
      dbAsset.aiVerification.verifiedAt = new Date();
    }

    await dbAsset.save();

    return res.status(200).json({
      message: 'Metadata updated successfully',
      mintAddress,
      newMetadataUri,
      ipfsUpdated: !!newMetadataUri,
      actionId: authorityAction._id,
      updates,
      note: 'On-chain metadata update requires LuxHub to have update authority on the NFT.',
    });
  } catch (error) {
    console.error('Error updating metadata:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
