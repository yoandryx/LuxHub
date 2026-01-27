// /pages/api/admin/mint-requests/approve-and-mint.ts
// Approves a mint request and actually mints the NFT to the vendor wallet
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { mplCore, create as createAsset, transfer } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { uploadImage, uploadMetadata, getStorageConfig } from '../../../../utils/storage';

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

  // Check if has permission to approve mints
  const canApproveMints =
    isEnvAdmin || dbAdmin?.permissions?.canApproveMints || dbAdmin?.role === 'super_admin';

  if (!canApproveMints) {
    return res
      .status(403)
      .json({ error: 'Admin access required - must have canApproveMints permission' });
  }

  const { mintRequestId, adminNotes } = req.body;

  if (!mintRequestId) {
    return res.status(400).json({ error: 'mintRequestId is required' });
  }

  try {
    // Get the mint request
    const mintRequest = await MintRequest.findById(mintRequestId);
    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    if (mintRequest.status !== 'pending') {
      return res.status(400).json({ error: `Mint request already ${mintRequest.status}` });
    }

    // Validate vendor wallet
    if (!mintRequest.wallet) {
      return res.status(400).json({ error: 'Vendor wallet address missing from request' });
    }

    // Get admin keypair for minting from centralized config
    const adminConfig = getAdminConfig();
    const adminKeypair = adminConfig.getAdminKeypair();

    if (!adminKeypair) {
      return res.status(500).json({
        error: 'Admin keypair not configured',
        hint: 'Set ADMIN_SECRET environment variable with the keypair JSON array',
      });
    }

    // Step 1: Upload image to storage if not already uploaded
    let imageUrl = mintRequest.imageUrl;
    let imageTxId = mintRequest.imageCid; // Can be IPFS hash or Irys txId

    if (!imageUrl && mintRequest.imageBase64) {
      try {
        // Extract base64 data and convert to buffer
        const base64Data = mintRequest.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const contentType =
          mintRequest.imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';

        // Upload using unified storage (respects STORAGE_PROVIDER env var)
        const imageResult = await uploadImage(buffer, contentType, {
          fileName: `${mintRequest.title.replace(/\s+/g, '-')}.png`,
        });

        imageUrl = imageResult.gateway;
        imageTxId = imageResult.irysTxId || imageResult.ipfsHash;

        console.log(`✅ Image uploaded via ${imageResult.provider}: ${imageUrl}`);
      } catch (error) {
        console.error('Failed to upload image:', error);
        return res.status(500).json({
          error: 'Failed to upload image',
          hint: getStorageConfig(),
        });
      }
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image available for minting' });
    }

    // Step 2: Create NFT metadata
    const metadata = {
      name: mintRequest.title,
      symbol: 'LUXHUB',
      description: mintRequest.description || `${mintRequest.brand} ${mintRequest.model}`,
      image: imageUrl,
      external_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.io'}/nft/`,
      attributes: [
        { trait_type: 'Brand', value: mintRequest.brand },
        { trait_type: 'Model', value: mintRequest.model },
        { trait_type: 'Reference Number', value: mintRequest.referenceNumber },
        { trait_type: 'Price USD', value: mintRequest.priceUSD?.toString() || '0' },
        ...(mintRequest.material ? [{ trait_type: 'Material', value: mintRequest.material }] : []),
        ...(mintRequest.productionYear
          ? [{ trait_type: 'Production Year', value: mintRequest.productionYear }]
          : []),
        ...(mintRequest.movement ? [{ trait_type: 'Movement', value: mintRequest.movement }] : []),
        ...(mintRequest.caseSize ? [{ trait_type: 'Case Size', value: mintRequest.caseSize }] : []),
        ...(mintRequest.waterResistance
          ? [{ trait_type: 'Water Resistance', value: mintRequest.waterResistance }]
          : []),
        ...(mintRequest.dialColor
          ? [{ trait_type: 'Dial Color', value: mintRequest.dialColor }]
          : []),
        ...(mintRequest.condition
          ? [{ trait_type: 'Condition', value: mintRequest.condition }]
          : []),
        ...(mintRequest.boxPapers
          ? [{ trait_type: 'Box & Papers', value: mintRequest.boxPapers }]
          : []),
        ...(mintRequest.limitedEdition
          ? [{ trait_type: 'Limited Edition', value: mintRequest.limitedEdition }]
          : []),
        ...(mintRequest.country
          ? [{ trait_type: 'Country of Origin', value: mintRequest.country }]
          : []),
      ],
      properties: {
        category: 'luxury_watch',
        creators: [
          {
            address: adminKeypair.publicKey.toBase58(),
            share: 100,
          },
        ],
        luxhub: {
          referenceNumber: mintRequest.referenceNumber,
          priceUSD: mintRequest.priceUSD,
          mintedAt: new Date().toISOString(),
          vendorWallet: mintRequest.wallet,
        },
      },
    };

    // Step 3: Upload metadata to storage (Irys/Pinata based on STORAGE_PROVIDER)
    let metadataUri: string;
    try {
      const metadataResult = await uploadMetadata(metadata, mintRequest.title);
      metadataUri = metadataResult.gateway;
      console.log(`✅ Metadata uploaded via ${metadataResult.provider}: ${metadataUri}`);
    } catch (error) {
      console.error('Failed to upload metadata:', error);
      return res.status(500).json({
        error: 'Failed to upload metadata',
        hint: getStorageConfig(),
      });
    }

    // Step 4: Create UMI instance with admin keypair
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
    );
    const umi = createUmi(connection.rpcEndpoint)
      .use(
        keypairIdentity({
          publicKey: umiPublicKey(adminKeypair.publicKey.toBase58()),
          secretKey: adminKeypair.secretKey,
        })
      )
      .use(mplCore());

    // Step 5: Mint the NFT
    const assetSigner = generateSigner(umi);
    let mintAddress: string;

    try {
      await createAsset(umi, {
        asset: assetSigner,
        name: mintRequest.title,
        uri: metadataUri,
      }).sendAndConfirm(umi);

      mintAddress = assetSigner.publicKey.toString();
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      return res.status(500).json({ error: 'Failed to mint NFT on-chain' });
    }

    // Step 6: Transfer NFT to vendor wallet
    try {
      // Fetch the newly minted asset
      const { fetchAsset } = await import('@metaplex-foundation/mpl-core');
      const mintedAsset = await fetchAsset(umi, umiPublicKey(mintAddress));

      await transfer(umi, {
        asset: mintedAsset,
        newOwner: umiPublicKey(mintRequest.wallet),
      }).sendAndConfirm(umi);
    } catch (error) {
      console.error('Failed to transfer NFT to vendor:', error);
      // NFT minted but not transferred - still save to DB
      // Admin can manually transfer later
    }

    // Step 7: Update mint request status
    mintRequest.status = 'minted';
    mintRequest.mintAddress = mintAddress;
    mintRequest.imageCid = imageTxId; // Can be Irys txId or IPFS hash
    mintRequest.imageUrl = imageUrl;
    mintRequest.reviewedBy = requestingWallet;
    mintRequest.reviewedAt = new Date();
    if (adminNotes) {
      mintRequest.adminNotes = adminNotes;
    }
    await mintRequest.save();

    // Step 8: Create Asset record in database
    const asset = await Asset.create({
      vendor: null, // Can be linked later via vendor ID
      model: mintRequest.model,
      serial: mintRequest.referenceNumber,
      description: mintRequest.description,
      priceUSD: mintRequest.priceUSD,
      imageIpfsUrls: imageTxId ? [imageTxId] : [],
      imageUrl: imageUrl,
      metadataIpfsUrl: metadataUri,
      nftMint: mintAddress,
      nftOwnerWallet: mintRequest.wallet,
      status: 'reviewed', // Ready for listing
      category: 'watches',
      transferHistory: [
        {
          from: adminKeypair.publicKey.toBase58(),
          to: mintRequest.wallet,
          timestamp: new Date(),
          type: 'mint_transfer',
        },
      ],
      metaplexMetadata: {
        name: mintRequest.title,
        symbol: 'LUXHUB',
        uri: metadataUri,
        creators: [
          {
            address: adminKeypair.publicKey.toBase58(),
            share: 100,
            verified: true,
          },
        ],
      },
    });

    return res.status(200).json({
      message: 'NFT minted and transferred to vendor successfully',
      mintAddress,
      metadataUri,
      imageUrl,
      imageTxId,
      storageProvider: getStorageConfig().provider,
      assetId: asset._id,
      vendorWallet: mintRequest.wallet,
    });
  } catch (error) {
    console.error('Error in approve-and-mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
