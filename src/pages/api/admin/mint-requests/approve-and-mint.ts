// /pages/api/admin/mint-requests/approve-and-mint.ts
// Approves a mint request and actually mints the NFT to the vendor wallet
import type { NextApiRequest, NextApiResponse } from 'next';
import { Keypair, Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { mplCore, create as createAsset, transfer } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { verifyToken } from '../../../../lib/auth/token';
import { JwtPayload } from 'jsonwebtoken';

// Helper to upload metadata to Pinata
async function uploadMetadataToPinata(metadata: object, title: string): Promise<string> {
  const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const pinataSecretKey = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

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
      pinataMetadata: { name: `${title}-metadata` },
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload metadata to Pinata');
  }

  const data = await response.json();
  const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
  return `${gateway}${data.IpfsHash}`;
}

// Helper to upload image from base64 to Pinata
async function uploadImageToPinata(base64Image: string, title: string): Promise<string> {
  const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const pinataSecretKey = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;

  if (!pinataApiKey || !pinataSecretKey) {
    throw new Error('Pinata API keys not configured');
  }

  // Extract base64 data and convert to buffer
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Create form data
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'image/png' });
  formData.append('file', blob, `${title.replace(/\s+/g, '-')}.png`);
  formData.append('pinataMetadata', JSON.stringify({ name: `${title}-image` }));

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: pinataApiKey,
      pinata_secret_api_key: pinataSecretKey,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload image to Pinata');
  }

  const data = await response.json();
  return data.IpfsHash;
}

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

  const { mintRequestId, adminNotes } = req.body;

  if (!mintRequestId) {
    return res.status(400).json({ error: 'mintRequestId is required' });
  }

  try {
    await dbConnect();

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

    // Get admin keypair for minting
    const adminKeypairJson = process.env.ADMIN_KEYPAIR_JSON;
    const adminKeypairPath = process.env.ADMIN_KEYPAIR_PATH;

    let adminKeypair: Keypair;
    if (adminKeypairJson) {
      const secretKey = new Uint8Array(JSON.parse(adminKeypairJson));
      adminKeypair = Keypair.fromSecretKey(secretKey);
    } else if (adminKeypairPath) {
      const fs = await import('fs');
      const keypairData = JSON.parse(fs.readFileSync(adminKeypairPath, 'utf-8'));
      adminKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    } else {
      return res.status(500).json({ error: 'Admin keypair not configured' });
    }

    // Step 1: Upload image to IPFS if not already uploaded
    let imageCid = mintRequest.imageCid;
    if (!imageCid && mintRequest.imageBase64) {
      try {
        imageCid = await uploadImageToPinata(mintRequest.imageBase64, mintRequest.title);
      } catch (error) {
        console.error('Failed to upload image:', error);
        return res.status(500).json({ error: 'Failed to upload image to IPFS' });
      }
    }

    if (!imageCid && !mintRequest.imageUrl) {
      return res.status(400).json({ error: 'No image available for minting' });
    }

    const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
    const imageUrl = mintRequest.imageUrl || `${gateway}${imageCid}`;

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

    // Step 3: Upload metadata to IPFS
    let metadataUri: string;
    try {
      metadataUri = await uploadMetadataToPinata(metadata, mintRequest.title);
    } catch (error) {
      console.error('Failed to upload metadata:', error);
      return res.status(500).json({ error: 'Failed to upload metadata to IPFS' });
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
    mintRequest.imageCid = imageCid;
    mintRequest.reviewedBy =
      (decoded as JwtPayload).wallet || (decoded as JwtPayload).email || 'admin';
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
      imageIpfsUrls: imageCid ? [imageCid] : [],
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
      imageCid,
      assetId: asset._id,
      vendorWallet: mintRequest.wallet,
    });
  } catch (error) {
    console.error('Error in approve-and-mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
