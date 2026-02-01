// pages/api/vault/mint.ts
// Record an NFT mint to the LuxHub vault inventory

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultInventory, VaultActivity, VaultConfig } from '@/lib/models/LuxHubVault';
import authMiddleware from '@/lib/middleware/auth';

interface VaultMintRequest {
  nftMint: string;
  name: string;
  description?: string;
  imageUrl: string;
  metadataUri: string;
  mintSignature: string;
  assetId?: string;
  tags?: string[];
  notes?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const adminWallet = (req as any).user?.walletAddress;
  if (!adminWallet) {
    return res.status(401).json({ error: 'Admin wallet not found' });
  }

  const { nftMint, name, description, imageUrl, metadataUri, mintSignature, assetId, tags, notes } =
    req.body as VaultMintRequest;

  // Validation
  if (!nftMint || !name || !imageUrl || !metadataUri) {
    return res.status(400).json({
      error: 'Missing required fields: nftMint, name, imageUrl, metadataUri',
    });
  }

  try {
    // Check if already exists
    const existing = await VaultInventory.findOne({ nftMint });
    if (existing) {
      return res.status(400).json({ error: 'NFT already exists in vault inventory' });
    }

    // Get vault config
    const vaultConfig = await VaultConfig.findOne({ isActive: true });

    // Create vault inventory item
    const vaultItem = await VaultInventory.create({
      nftMint,
      assetId,
      name,
      description,
      imageUrl,
      metadataUri,
      mintedBy: adminWallet,
      mintedAt: new Date(),
      mintSignature,
      isVerifiedCreator: true,
      inVerifiedCollection: !!vaultConfig?.collectionMint,
      collectionMint: vaultConfig?.collectionMint,
      status: 'minted',
      tags: tags || [],
      notes,
      history: [
        {
          action: 'minted_to_vault',
          performedBy: adminWallet,
          performedAt: new Date(),
          details: { mintSignature },
        },
      ],
    });

    // Log activity
    await VaultActivity.create({
      activityType: 'mint_completed',
      performedBy: adminWallet,
      nftMint,
      inventoryId: vaultItem._id,
      transactionSignature: mintSignature,
      details: {
        name,
        metadataUri,
        assetId,
      },
      notes,
    });

    // Update vault stats
    await VaultConfig.updateOne(
      { isActive: true },
      {
        $inc: { totalMinted: 1, currentHoldings: 1 },
      }
    );

    console.log(`[VAULT-MINT] NFT recorded in vault: ${nftMint} by ${adminWallet}`);

    return res.status(200).json({
      success: true,
      message: 'NFT recorded in vault inventory',
      data: {
        inventoryId: vaultItem._id,
        nftMint,
        name,
        status: vaultItem.status,
        mintedBy: adminWallet,
        mintedAt: vaultItem.mintedAt,
      },
    });
  } catch (error) {
    console.error('[VAULT-MINT] Error:', error);
    return res.status(500).json({ error: 'Failed to record vault mint' });
  }
}

// Require admin authentication
export default authMiddleware(handler);
