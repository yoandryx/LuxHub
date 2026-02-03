// /pages/api/admin/mint-requests/prepare-mint.ts
// Prepares metadata for minting - uploads image and metadata to storage
// Returns the metadataUri for the client to use with UMI minting
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { uploadImage, uploadMetadata, getStorageConfig } from '../../../../utils/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Get the admin wallet that will sign
  const signerWallet = req.headers['x-wallet-address'] as string;
  if (!signerWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
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
    return res.status(403).json({
      error: 'Admin access required - must have canApproveMints permission',
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
      });
    }

    if (!mintRequest.wallet) {
      return res.status(400).json({ error: 'Vendor wallet address missing from request' });
    }

    console.log('🔑 Preparing mint metadata for:', {
      signer: signerWallet.slice(0, 8) + '...',
      mintRequestId,
      title: mintRequest.title,
    });

    // Step 1: Upload image if needed
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
          }

          const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'LuxHub/1.0' },
            redirect: 'follow',
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          contentType = response.headers.get('content-type') || 'image/png';

          if (contentType.includes('text/html')) {
            throw new Error('Image URL returned HTML - not publicly accessible');
          }
          console.log(`✅ Fetched image (${buffer.length} bytes)`);
        } else {
          return res.status(400).json({ error: 'No valid image source available' });
        }

        const imageResult = await uploadImage(buffer, contentType, {
          fileName: `${mintRequest.title.replace(/\s+/g, '-')}.png`,
        });

        imageUrl = imageResult.gateway;
        imageTxId = imageResult.irysTxId || imageResult.ipfsHash;
        console.log(`✅ Image uploaded: ${imageUrl}`);
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

    // Step 2: Create and upload metadata (matching createNFT.tsx format)
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
        creators: [{ address: signerWallet, share: 100 }],
        luxhub: {
          referenceNumber: mintRequest.referenceNumber,
          priceUSD: mintRequest.priceUSD,
          mintedAt: new Date().toISOString(),
          mintedBy: signerWallet,
          vendorWallet: mintRequest.wallet,
        },
      },
    };

    let metadataUri: string;
    try {
      const metadataResult = await uploadMetadata(metadata, mintRequest.title);
      metadataUri = metadataResult.gateway;
      console.log(`✅ Metadata uploaded: ${metadataUri}`);
    } catch (error) {
      console.error('Failed to upload metadata:', error);
      return res.status(500).json({ error: 'Failed to upload metadata' });
    }

    // Store the pending mint info for confirmation later
    mintRequest.pendingMint = {
      metadataUri,
      imageUrl,
      imageTxId,
      preparedAt: new Date(),
      preparedBy: signerWallet,
    };
    await mintRequest.save();

    console.log(`✅ Metadata prepared for minting: ${mintRequest.title}`);

    // Return metadata URI for client-side minting with UMI
    return res.status(200).json({
      success: true,
      metadataUri,
      imageUrl,
      imageTxId,
      title: mintRequest.title,
      vendorWallet: mintRequest.wallet,
      mintRequestId: mintRequest._id,
      message: 'Metadata ready. Use UMI to mint on the client.',
    });
  } catch (error) {
    console.error('Error preparing mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
