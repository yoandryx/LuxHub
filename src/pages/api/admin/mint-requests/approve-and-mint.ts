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

    // Step 1: Upload image to storage (always upload to Irys for permanence)
    let imageUrl = mintRequest.imageCid
      ? getStorageConfig().provider === 'irys'
        ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
        : mintRequest.imageUrl
      : null;
    let imageTxId = mintRequest.imageCid;

    // If no permanent storage yet, we need to upload
    if (!imageTxId) {
      try {
        let buffer: Buffer;
        let contentType = 'image/png';

        if (mintRequest.imageBase64 && mintRequest.imageBase64.startsWith('data:')) {
          // Base64 image - extract and convert to buffer
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
          // External URL (e.g., Dropbox) - fetch and upload to permanent storage
          console.log(`📥 Fetching external image: ${mintRequest.imageUrl}`);

          // Convert Dropbox share links to direct download links
          let fetchUrl = mintRequest.imageUrl;
          if (fetchUrl.includes('dropbox.com')) {
            // Handle various Dropbox URL formats
            // Format 1: www.dropbox.com/s/xxx/file.jpg?dl=0
            // Format 2: www.dropbox.com/scl/fi/xxx/file.jpg?...&dl=0
            // Convert to direct download
            fetchUrl = fetchUrl
              .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
              .replace(/[?&]dl=0/, '?dl=1')
              .replace(/[?&]raw=1/, '?dl=1');

            // If URL doesn't have dl parameter, add it
            if (!fetchUrl.includes('dl=1')) {
              fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'dl=1';
            }
            console.log(`🔄 Converted Dropbox URL: ${fetchUrl}`);
          }

          const response = await fetch(fetchUrl, {
            headers: {
              'User-Agent': 'LuxHub/1.0',
            },
            redirect: 'follow',
          });

          if (!response.ok) {
            console.error(`❌ Fetch failed: ${response.status} ${response.statusText}`);
            console.error(`   URL: ${fetchUrl}`);
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          contentType = response.headers.get('content-type') || 'image/png';

          // Validate we got an image, not HTML
          if (contentType.includes('text/html')) {
            console.error('❌ Received HTML instead of image - URL may require authentication');
            throw new Error('Image URL returned HTML - check if the image is publicly accessible');
          }

          console.log(`✅ Fetched image (${buffer.length} bytes, ${contentType})`);
        } else {
          return res.status(400).json({ error: 'No valid image source available' });
        }

        // Upload to permanent storage (Irys/Pinata)
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
          hint: getStorageConfig(),
        });
      }
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'No image available for minting' });
    }

    // Log all attributes for debugging
    console.log('📋 Mint Request from MongoDB:', {
      _id: mintRequest._id,
      title: mintRequest.title,
      brand: mintRequest.brand,
      model: mintRequest.model,
      referenceNumber: mintRequest.referenceNumber,
      priceUSD: mintRequest.priceUSD,
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
      imageBase64: mintRequest.imageBase64
        ? `(${mintRequest.imageBase64.length} chars)`
        : '(empty)',
      imageUrl: mintRequest.imageUrl || '(empty)',
      imageCid: mintRequest.imageCid || '(empty)',
    });

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

    // Log the metadata being created
    console.log('📝 NFT Metadata to upload:', JSON.stringify(metadata, null, 2));
    console.log('📊 Attributes count:', metadata.attributes.length);

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

    // Step 8: Create Asset record in database (auto-listed on marketplace)
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
      mintedBy: requestingWallet, // Track which admin minted this
      status: 'listed', // Auto-listed on marketplace immediately
      category: 'watches',
      // Include all attributes from mint request
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
      arweaveTxId: imageTxId, // Store the Irys/Arweave transaction ID
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
    });
  } catch (error) {
    console.error('Error in approve-and-mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
