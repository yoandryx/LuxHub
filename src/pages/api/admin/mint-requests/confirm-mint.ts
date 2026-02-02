// /pages/api/admin/mint-requests/confirm-mint.ts
// Confirms a mint after client-side signing and submission
// Updates database records with the mint address
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, fetchAsset, transfer } from '@metaplex-foundation/mpl-core';
import { publicKey as umiPublicKey, keypairIdentity } from '@metaplex-foundation/umi';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { getStorageConfig } from '../../../../utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const signerWallet = req.headers['x-wallet-address'] as string;
  if (!signerWallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  // Verify admin permissions
  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(signerWallet);
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(signerWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: signerWallet, isActive: true });

  const canMint =
    isEnvSuperAdmin ||
    isEnvAdmin ||
    dbAdmin?.permissions?.canApproveMints ||
    dbAdmin?.role === 'super_admin';

  if (!canMint) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { mintRequestId, mintAddress, signature, transferToVendor } = req.body;

  if (!mintRequestId || !mintAddress) {
    return res.status(400).json({ error: 'mintRequestId and mintAddress are required' });
  }

  try {
    const mintRequest = await MintRequest.findById(mintRequestId);
    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    // Verify the mint exists on-chain
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
    );

    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(mintAddress));
      if (!accountInfo) {
        return res.status(400).json({
          error: 'Mint address not found on-chain. Transaction may have failed.',
        });
      }
    } catch (e) {
      console.error('Failed to verify mint on-chain:', e);
      // Continue anyway - might be RPC issue
    }

    // Get image/metadata info from pending mint or existing fields
    const imageUrl =
      mintRequest.pendingMint?.imageUrl ||
      mintRequest.imageUrl ||
      (mintRequest.imageCid
        ? getStorageConfig().provider === 'irys'
          ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
          : mintRequest.imageUrl
        : null);
    const imageTxId = mintRequest.pendingMint?.imageTxId || mintRequest.imageCid;
    const metadataUri = mintRequest.pendingMint?.metadataUri;

    // Update mint request status
    mintRequest.status = 'minted';
    mintRequest.mintAddress = mintAddress;
    mintRequest.mintedBy = signerWallet;
    mintRequest.mintedAt = new Date();
    mintRequest.mintSignature = signature;
    if (imageTxId) mintRequest.imageCid = imageTxId;
    if (imageUrl) mintRequest.imageUrl = imageUrl;
    mintRequest.pendingMint = undefined; // Clear pending state
    await mintRequest.save();

    // Create Asset record (auto-listed on marketplace)
    const asset = await Asset.create({
      vendor: null,
      model: mintRequest.model,
      serial: mintRequest.referenceNumber,
      description: mintRequest.description,
      priceUSD: mintRequest.priceUSD,
      imageIpfsUrls: imageTxId ? [imageTxId] : [],
      imageUrl: imageUrl,
      metadataIpfsUrl: metadataUri,
      nftMint: mintAddress,
      nftOwnerWallet: transferToVendor ? mintRequest.wallet : signerWallet,
      mintedBy: signerWallet,
      status: 'listed',
      category: 'watches',
      brand: mintRequest.brand,
      title: mintRequest.title,
      material: mintRequest.material,
      productionYear: mintRequest.productionYear,
      movement: mintRequest.movement,
      caseSize: mintRequest.caseSize,
      waterResistance: mintRequest.waterResistance,
      dialColor: mintRequest.dialColor,
      condition: mintRequest.condition,
      boxPapers: mintRequest.boxPapers,
      limitedEdition: mintRequest.limitedEdition,
      country: mintRequest.country,
      certificate: mintRequest.certificate,
      warrantyInfo: mintRequest.warrantyInfo,
      provenance: mintRequest.provenance,
      features: mintRequest.features,
      releaseDate: mintRequest.releaseDate,
      arweaveTxId: imageTxId,
      arweaveMetadataTxId: metadataUri?.includes('gateway.irys.xyz')
        ? metadataUri.split('/').pop()
        : undefined,
      transferHistory: [
        {
          from: signerWallet,
          to: transferToVendor ? mintRequest.wallet : signerWallet,
          transferredAt: new Date(),
        },
      ],
      metaplexMetadata: {
        name: mintRequest.title,
        symbol: 'LUXHUB',
        uri: metadataUri || '',
        creators: [
          {
            address: signerWallet,
            share: 100,
            verified: true,
          },
        ],
      },
    });

    console.log(`✅ Mint confirmed. Asset: ${asset._id}, Mint: ${mintAddress}`);

    return res.status(200).json({
      success: true,
      message: 'NFT minted and recorded successfully',
      mintAddress,
      assetId: asset._id,
      signature,
      vendorWallet: mintRequest.wallet,
      currentOwner: transferToVendor ? mintRequest.wallet : signerWallet,
    });
  } catch (error) {
    console.error('Error confirming mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
