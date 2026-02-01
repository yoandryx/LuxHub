// pages/api/verify/nft.ts
// Public endpoint to verify if an NFT is an authentic LuxHub mint

import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '@/lib/models/Assets';
import { VaultInventory, VaultConfig } from '@/lib/models/LuxHubVault';
import { Vendor } from '@/lib/models/Vendor';

interface VerificationResult {
  isVerified: boolean;
  verificationLevel: 'full' | 'partial' | 'unverified';
  checks: {
    inLuxHubDatabase: boolean;
    verifiedCreator: boolean;
    inVerifiedCollection: boolean;
    mintedByVault: boolean;
  };
  details: {
    nftMint: string;
    name?: string;
    mintedAt?: string;
    mintedBy?: string;
    currentStatus?: string;
    luxhubAssetId?: string;
    collectionVerified?: boolean;
  };
  warnings: string[];
  message: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerificationResult | { error: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mint } = req.query;

  if (!mint || typeof mint !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid mint address' });
  }

  // Validate mint address format
  try {
    new PublicKey(mint);
  } catch {
    return res.status(400).json({ error: 'Invalid Solana address format' });
  }

  await dbConnect();

  const warnings: string[] = [];
  const checks = {
    inLuxHubDatabase: false,
    verifiedCreator: false,
    inVerifiedCollection: false,
    mintedByVault: false,
  };

  const details: VerificationResult['details'] = {
    nftMint: mint,
  };

  try {
    // 1. Check if NFT exists in LuxHub Asset database
    const asset = await Asset.findOne({ nftMint: mint });
    if (asset) {
      checks.inLuxHubDatabase = true;
      details.luxhubAssetId = asset._id.toString();
      details.name = asset.model;
      details.currentStatus = asset.status;
    }

    // 2. Check if NFT was minted through LuxHub Vault
    const vaultItem = await VaultInventory.findOne({ nftMint: mint });
    if (vaultItem) {
      checks.mintedByVault = true;
      details.mintedAt = vaultItem.mintedAt?.toISOString();
      details.mintedBy = vaultItem.mintedBy;
      details.name = details.name || vaultItem.name;

      if (vaultItem.isVerifiedCreator) {
        checks.verifiedCreator = true;
      }
      if (vaultItem.inVerifiedCollection) {
        checks.inVerifiedCollection = true;
        details.collectionVerified = true;
      }
    }

    // 3. Get vault config for on-chain verification
    const vaultConfig = await VaultConfig.findOne({ isActive: true });
    const luxhubVendor = await Vendor.findOne({ isOfficial: true });

    // 4. On-chain verification (check creators array)
    if (vaultConfig?.vaultPda || luxhubVendor?.walletAddress) {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );

      try {
        // Fetch NFT metadata from chain to verify creator
        const accountInfo = await connection.getAccountInfo(new PublicKey(mint));

        if (accountInfo) {
          // For mpl-core assets, we'd need to deserialize and check the authority
          // For now, trust the database records if they exist
          if (!checks.verifiedCreator && (checks.inLuxHubDatabase || checks.mintedByVault)) {
            // If in our database but not explicitly marked as verified creator,
            // add a warning
            warnings.push('Creator verification pending on-chain confirmation');
          }
        }
      } catch (chainError) {
        console.warn('[VERIFY] On-chain check failed:', chainError);
        warnings.push('On-chain verification temporarily unavailable');
      }
    }

    // Determine verification level
    let verificationLevel: VerificationResult['verificationLevel'] = 'unverified';
    let message = '';

    const passedChecks = Object.values(checks).filter(Boolean).length;

    if (passedChecks >= 3) {
      verificationLevel = 'full';
      message = 'This NFT is fully verified as an authentic LuxHub mint.';
    } else if (passedChecks >= 1) {
      verificationLevel = 'partial';
      message = 'This NFT has partial verification. Some checks passed.';
    } else {
      verificationLevel = 'unverified';
      message =
        'This NFT could not be verified as a LuxHub mint. It may be a third-party or counterfeit NFT.';
      warnings.push('NFT not found in LuxHub registry');
    }

    // Add specific warnings
    if (checks.inLuxHubDatabase && !checks.mintedByVault) {
      warnings.push('NFT registered but not minted through official vault');
    }

    if (!checks.inVerifiedCollection && checks.mintedByVault) {
      warnings.push('NFT not yet added to verified collection');
    }

    const result: VerificationResult = {
      isVerified: verificationLevel === 'full',
      verificationLevel,
      checks,
      details,
      warnings,
      message,
    };

    // Cache headers for public endpoint
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json(result);
  } catch (error) {
    console.error('[VERIFY] Error:', error);
    return res.status(500).json({ error: 'Verification service error' });
  }
}
