// /pages/api/admin/mint-requests/mint.ts
// Mints an approved mint request - requires admin with canMint permission
// Optionally verifies Squads membership for audit trail
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import {
  mplCore,
  create as createAsset,
  transfer,
  fetchAsset,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { uploadImage, uploadMetadata, getStorageConfig } from '../../../../utils/storage';

// Helper to check Squads membership (optional verification)
async function checkSquadsMembership(wallet: string): Promise<{
  isMember: boolean;
  canMint: boolean;
  squadsConfigured: boolean;
}> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/squads/check-membership?wallet=${wallet}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Could not check Squads membership:', error);
  }
  return { isMember: false, canMint: false, squadsConfigured: false };
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
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  // Check if has permission to mint
  const canMint =
    isEnvSuperAdmin ||
    isEnvAdmin ||
    dbAdmin?.permissions?.canApproveMints ||
    dbAdmin?.role === 'super_admin';

  if (!canMint) {
    return res.status(403).json({
      error: 'Admin access required - must have canApproveMints permission to mint',
    });
  }

  // Optional: Check Squads membership for enhanced security
  const squadsCheck = await checkSquadsMembership(requestingWallet);
  const requireSquadsMembership = process.env.REQUIRE_SQUADS_FOR_MINTING === 'true';

  if (requireSquadsMembership && squadsCheck.squadsConfigured && !squadsCheck.isMember) {
    return res.status(403).json({
      error: 'Must be a LuxHub Squads multisig member to mint NFTs',
      squadsConfigured: true,
      isMember: false,
    });
  }

  const { mintRequestId } = req.body;

  if (!mintRequestId) {
    return res.status(400).json({ error: 'mintRequestId is required' });
  }

  try {
    // Get the mint request - must be in "approved" status
    const mintRequest = await MintRequest.findById(mintRequestId);
    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    if (mintRequest.status !== 'approved') {
      return res.status(400).json({
        error: `Cannot mint - request status is "${mintRequest.status}". Must be "approved" first.`,
        currentStatus: mintRequest.status,
        hint:
          mintRequest.status === 'pending'
            ? 'Use /api/admin/mint-requests/review to approve first'
            : undefined,
      });
    }

    // Validate vendor wallet
    if (!mintRequest.wallet) {
      return res.status(400).json({ error: 'Vendor wallet address missing from request' });
    }

    // Get admin keypair for minting
    const adminKeypair = adminConfig.getAdminKeypair();

    console.log('🔑 Mint authorization:', {
      mintingAdmin: requestingWallet.slice(0, 8) + '...',
      isEnvAdmin,
      isEnvSuperAdmin,
      hasDbPermission: !!dbAdmin?.permissions?.canApproveMints,
      squadsConfigured: squadsCheck.squadsConfigured,
      isSquadsMember: squadsCheck.isMember,
    });

    if (!adminKeypair) {
      return res.status(500).json({
        error: 'Admin keypair not configured',
        hint: 'Set ADMIN_SECRET environment variable with the keypair JSON array',
      });
    }

    // Step 1: Upload image to storage
    let imageUrl = mintRequest.imageCid
      ? getStorageConfig().provider === 'irys'
        ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
        : mintRequest.imageUrl
      : null;
    let imageTxId = mintRequest.imageCid;

    if (!imageTxId) {
      try {
        let buffer: Buffer;
        let contentType = 'image/png';

        if (mintRequest.imageBase64 && mintRequest.imageBase64.startsWith('data:')) {
          const base64Data = mintRequest.imageBase64.replace(/^data:image\/\w+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
          contentType =
            mintRequest.imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
          console.log('📦 Processing base64 image...');
        } else if (
          mintRequest.imageUrl &&
          (mintRequest.imageUrl.startsWith('http://') ||
            mintRequest.imageUrl.startsWith('https://'))
        ) {
          console.log(`📥 Fetching external image: ${mintRequest.imageUrl}`);

          let fetchUrl = mintRequest.imageUrl;
          if (fetchUrl.includes('dropbox.com')) {
            fetchUrl = fetchUrl
              .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
              .replace(/[?&]dl=0/, '?dl=1')
              .replace(/[?&]raw=1/, '?dl=1');
            if (!fetchUrl.includes('dl=1')) {
              fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'dl=1';
            }
            console.log(`🔄 Converted Dropbox URL: ${fetchUrl}`);
          }

          const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'LuxHub/1.0' },
            redirect: 'follow',
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          contentType = response.headers.get('content-type') || 'image/png';

          if (contentType.includes('text/html')) {
            throw new Error('Image URL returned HTML - check if the image is publicly accessible');
          }

          console.log(`✅ Fetched image (${buffer.length} bytes, ${contentType})`);
        } else {
          return res.status(400).json({ error: 'No valid image source available' });
        }

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
          details: error instanceof Error ? error.message : 'Unknown error',
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
        creators: [{ address: adminKeypair.publicKey.toBase58(), share: 100 }],
        luxhub: {
          referenceNumber: mintRequest.referenceNumber,
          priceUSD: mintRequest.priceUSD,
          mintedAt: new Date().toISOString(),
          mintedBy: requestingWallet, // Track which admin minted
          vendorWallet: mintRequest.wallet,
          squadsMember: squadsCheck.isMember,
        },
      },
    };

    console.log('📝 Creating NFT metadata...');

    // Step 3: Upload metadata
    let metadataUri: string;
    try {
      const metadataResult = await uploadMetadata(metadata, mintRequest.title);
      metadataUri = metadataResult.gateway;
      console.log(`✅ Metadata uploaded via ${metadataResult.provider}: ${metadataUri}`);
    } catch (error) {
      console.error('Failed to upload metadata:', error);
      return res.status(500).json({ error: 'Failed to upload metadata' });
    }

    // Step 4: Create UMI instance
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
      console.log(`🔨 Minting NFT: ${mintRequest.title}`);
      await createAsset(umi, {
        asset: assetSigner,
        name: mintRequest.title,
        uri: metadataUri,
      }).sendAndConfirm(umi);

      mintAddress = assetSigner.publicKey.toString();
      console.log(`✅ NFT minted: ${mintAddress}`);
    } catch (error) {
      console.error('Failed to mint NFT:', error);
      return res.status(500).json({ error: 'Failed to mint NFT on-chain' });
    }

    // Step 6: Transfer NFT to vendor wallet
    let transferSuccess = false;
    try {
      const mintedAsset = await fetchAsset(umi, umiPublicKey(mintAddress));
      await transfer(umi, {
        asset: mintedAsset,
        newOwner: umiPublicKey(mintRequest.wallet),
      }).sendAndConfirm(umi);
      transferSuccess = true;
      console.log(`✅ NFT transferred to vendor: ${mintRequest.wallet.slice(0, 8)}...`);
    } catch (error) {
      console.error('Failed to transfer NFT to vendor:', error);
      // NFT minted but not transferred - continue to save records
    }

    // Step 7: Update mint request status
    mintRequest.status = 'minted';
    mintRequest.mintAddress = mintAddress;
    mintRequest.imageCid = imageTxId;
    mintRequest.imageUrl = imageUrl;
    mintRequest.mintedBy = requestingWallet;
    mintRequest.mintedAt = new Date();
    mintRequest.squadsMemberWallet = squadsCheck.isMember ? requestingWallet : undefined;
    await mintRequest.save();

    // Step 8: Create Asset record (auto-listed on marketplace)
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
      nftOwnerWallet: mintRequest.wallet,
      mintedBy: requestingWallet,
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
      arweaveMetadataTxId: metadataUri.includes('gateway.irys.xyz')
        ? metadataUri.split('/').pop()
        : undefined,
      transferHistory: [
        {
          from: adminKeypair.publicKey.toBase58(),
          to: mintRequest.wallet,
          transferredAt: new Date(),
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

    console.log(`✅ Asset created and auto-listed: ${asset._id}`);

    return res.status(200).json({
      message: 'NFT minted and transferred to vendor successfully',
      mintAddress,
      metadataUri,
      imageUrl,
      imageTxId,
      storageProvider: getStorageConfig().provider,
      assetId: asset._id,
      vendorWallet: mintRequest.wallet,
      transferSuccess,
      mintedBy: requestingWallet,
      squadsVerified: squadsCheck.isMember,
    });
  } catch (error) {
    console.error('Error in mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
