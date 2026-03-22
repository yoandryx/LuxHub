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
  console.log(`[prepare-mint] Handler called: method=${req.method}`);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();
  console.log('[prepare-mint] DB connected');

  // Get the admin wallet that will sign
  const signerWallet = req.headers['x-wallet-address'] as string;
  const { mintRequestId, mintAddress: preGeneratedMint } = req.body;
  console.log(
    `[prepare-mint] Request: signerWallet=${signerWallet}, mintRequestId=${mintRequestId}, preGeneratedMint=${preGeneratedMint || 'none'}`
  );

  if (!signerWallet) {
    console.log('[prepare-mint] Rejected: no x-wallet-address header');
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

  console.log(
    `[prepare-mint] Admin check: isEnvAdmin=${isEnvAdmin}, isEnvSuperAdmin=${isEnvSuperAdmin}, dbAdmin=${dbAdmin ? `role=${dbAdmin.role}` : 'none'}, canMint=${!!canMint}`
  );

  if (!canMint) {
    console.log(`[prepare-mint] Rejected: wallet ${signerWallet} lacks mint permissions`);
    return res.status(403).json({
      error: 'Admin access required - must have canApproveMints permission',
    });
  }

  if (!mintRequestId) {
    return res.status(400).json({ error: 'mintRequestId is required' });
  }

  try {
    // Get the mint request - must be in "approved" status
    const mintRequest = await MintRequest.findById(mintRequestId);
    console.log(
      `[prepare-mint] MintRequest lookup: found=${!!mintRequest}, status=${mintRequest?.status || 'N/A'}, hasImageCid=${!!mintRequest?.imageCid}, hasImageBase64=${!!mintRequest?.imageBase64}, hasImageUrl=${!!mintRequest?.imageUrl}`
    );

    if (!mintRequest) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    if (mintRequest.status !== 'approved') {
      console.log(
        `[prepare-mint] Rejected: status is "${mintRequest.status}", expected "approved"`
      );
      return res.status(400).json({
        error: `Cannot mint - request status is "${mintRequest.status}". Must be "approved" first.`,
      });
    }

    if (!mintRequest.wallet) {
      return res.status(400).json({ error: 'Vendor wallet address missing from request' });
    }

    // Step 1: Upload image if needed
    let imageUrl = mintRequest.imageCid
      ? getStorageConfig().provider === 'irys'
        ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
        : mintRequest.imageUrl
      : null;
    let imageTxId = mintRequest.imageCid;

    console.log(
      `[prepare-mint] Step 1 (image): existingCid=${mintRequest.imageCid || 'none'}, existingImageUrl=${imageUrl || 'none'}, needsUpload=${!imageTxId}`
    );

    if (!imageTxId) {
      try {
        let buffer: Buffer;
        let contentType = 'image/png';

        if (mintRequest.imageBase64 && mintRequest.imageBase64.startsWith('data:')) {
          console.log('[prepare-mint] Image source: base64 data URI');
          const base64Data = mintRequest.imageBase64.replace(/^data:image\/\w+;base64,/, '');
          buffer = Buffer.from(base64Data, 'base64');
          contentType =
            mintRequest.imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
          console.log(
            `[prepare-mint] Base64 decoded: bufferSize=${buffer.length} bytes, contentType=${contentType}`
          );
        } else if (
          mintRequest.imageUrl &&
          (mintRequest.imageUrl.startsWith('http://') ||
            mintRequest.imageUrl.startsWith('https://'))
        ) {
          let fetchUrl = mintRequest.imageUrl;
          console.log(
            `[prepare-mint] Image source: URL fetch, originalUrl=${mintRequest.imageUrl}`
          );

          if (fetchUrl.includes('dropbox.com')) {
            fetchUrl = fetchUrl
              .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
              .replace(/[?&]dl=0/, '?dl=1')
              .replace(/[?&]raw=1/, '?dl=1');
            if (!fetchUrl.includes('dl=1')) {
              fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'dl=1';
            }
          }

          console.log(`[prepare-mint] Fetching image: fetchUrl=${fetchUrl}`);
          const response = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'LuxHub/1.0' },
            redirect: 'follow',
          });

          console.log(
            `[prepare-mint] Fetch response: status=${response.status}, contentType=${response.headers.get('content-type')}`
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
          contentType = response.headers.get('content-type') || 'image/png';
          console.log(
            `[prepare-mint] Image fetched: bufferSize=${buffer.length} bytes, contentType=${contentType}`
          );

          if (contentType.includes('text/html')) {
            throw new Error('Image URL returned HTML - not publicly accessible');
          }
        } else {
          console.log('[prepare-mint] Rejected: no valid image source');
          return res.status(400).json({ error: 'No valid image source available' });
        }

        const storageConfig = getStorageConfig();
        const fileName = `${mintRequest.title.replace(/\s+/g, '-')}.png`;
        console.log(
          `[prepare-mint] Uploading image: bufferSize=${buffer.length} bytes, contentType=${contentType}, fileName=${fileName}, provider=${storageConfig.provider}`
        );

        const imageResult = await uploadImage(buffer, contentType, { fileName });

        console.log(
          `[prepare-mint] Image uploaded: gateway=${imageResult.gateway}, irysTxId=${imageResult.irysTxId || 'N/A'}, ipfsHash=${imageResult.ipfsHash || 'N/A'}, provider=${imageResult.provider}`
        );

        imageUrl = imageResult.gateway;
        imageTxId = imageResult.irysTxId || imageResult.ipfsHash;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        const errStack = error instanceof Error ? error.stack : String(error);
        console.error(`[prepare-mint] Step 1 FAILED (image upload):`, errMsg);
        console.error(`[prepare-mint] Stack:`, errStack);
        return res.status(500).json({
          error: 'Failed to upload image',
          details: errMsg,
        });
      }
    }

    if (!imageUrl) {
      console.log('[prepare-mint] Rejected: no image available after upload step');
      return res.status(400).json({ error: 'No image available for minting' });
    }

    // Step 2: Create and upload metadata (matching createNFT.tsx format)
    // On-chain name has 32 char max -- use brand + model, full title goes in description
    const shortName =
      `${mintRequest.brand || ''} ${mintRequest.model || ''}`.trim().slice(0, 32) ||
      mintRequest.title.slice(0, 32);
    const metadata = {
      name: shortName,
      symbol: 'LUXHUB',
      description:
        mintRequest.description || mintRequest.title || `${mintRequest.brand} ${mintRequest.model}`,
      image: imageUrl,
      external_url: preGeneratedMint
        ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/nft/${preGeneratedMint}`
        : `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/nft`,
      seller_fee_basis_points: 500, // 5% royalty
      attributes: [
        { trait_type: 'Brand', value: mintRequest.brand },
        { trait_type: 'Model', value: mintRequest.model },
        { trait_type: 'Reference Number', value: mintRequest.referenceNumber },
        { trait_type: 'Price USD', value: mintRequest.priceUSD?.toString() || '0' },
        { trait_type: 'LuxHub Verified', value: 'Yes' },
        { trait_type: 'Vendor Mint', value: 'Official' },
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
        ...(mintRequest.certificate
          ? [{ trait_type: 'Certificate', value: mintRequest.certificate }]
          : []),
        ...(mintRequest.warrantyInfo
          ? [{ trait_type: 'Warranty Info', value: mintRequest.warrantyInfo }]
          : []),
        ...(mintRequest.provenance
          ? [{ trait_type: 'Provenance', value: mintRequest.provenance }]
          : []),
        ...(mintRequest.features ? [{ trait_type: 'Features', value: mintRequest.features }] : []),
      ],
      // Collection info for Explorer/Wallets
      collection: {
        name: 'LuxHub Verified Timepieces',
        family: 'LuxHub',
      },
      properties: {
        category: 'luxury_watch',
        creators: [{ address: signerWallet, share: 100 }],
        files: [
          {
            uri: imageUrl,
            type: 'image/png',
          },
        ],
      },
      // LuxHub Verification for authenticated vendor mints
      luxhub_verification: {
        verified: true,
        vendor_wallet: mintRequest.wallet,
        minted_by: signerWallet,
        minted_at: new Date().toISOString(),
        reference_number: mintRequest.referenceNumber,
        price_usd: mintRequest.priceUSD,
        verification_url: preGeneratedMint
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/nft/${preGeneratedMint}`
          : `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/nft`,
      },
    };

    const metadataJson = JSON.stringify(metadata);
    console.log(
      `[prepare-mint] Step 2 (metadata): keys=${Object.keys(metadata).join(',')}, jsonSize=${metadataJson.length} chars, attributeCount=${metadata.attributes.length}`
    );

    let metadataUri: string;
    try {
      const metadataResult = await uploadMetadata(metadata, mintRequest.title);
      metadataUri = metadataResult.gateway;
      console.log(
        `[prepare-mint] Metadata uploaded: metadataUri=${metadataUri}, provider=${metadataResult.provider}`
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      const errStack = error instanceof Error ? error.stack : String(error);
      console.error(`[prepare-mint] Step 2 FAILED (metadata upload):`, errMsg);
      console.error(`[prepare-mint] Stack:`, errStack);
      return res.status(500).json({
        error: 'Failed to upload metadata',
        details: errMsg,
      });
    }

    // Store the pending mint info for confirmation later
    mintRequest.pendingMint = {
      metadataUri,
      imageUrl,
      imageTxId,
      preparedAt: new Date(),
      preparedBy: signerWallet,
    };
    console.log(`[prepare-mint] Saving pendingMint:`, JSON.stringify(mintRequest.pendingMint));
    await mintRequest.save();
    console.log('[prepare-mint] MintRequest saved successfully');

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
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    const errStack = error instanceof Error ? error.stack : String(error);
    console.error(`[prepare-mint] Unhandled error: ${errMsg}`);
    console.error(`[prepare-mint] Stack:`, errStack);
    return res.status(500).json({
      error: 'Internal Server Error',
      details: errMsg,
    });
  }
}
