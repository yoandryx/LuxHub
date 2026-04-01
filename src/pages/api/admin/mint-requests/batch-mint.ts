// /pages/api/admin/mint-requests/batch-mint.ts
// Admin batch mint endpoint — processes multiple approved MintRequests with concurrency control
// Each item has own try/catch for per-item error resilience
import type { NextApiRequest, NextApiResponse } from 'next';
import pLimit from 'p-limit';
import { getConnection } from '@/lib/solana/clusterConfig';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import {
  mplTokenMetadata,
  createNft,
  transferV1,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { generateSigner, publicKey as umiPublicKey, percentAmount } from '@metaplex-foundation/umi';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import Asset from '../../../../lib/models/Assets';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';
import { uploadImage, uploadMetadata, getStorageConfig } from '../../../../utils/storage';

interface BatchMintResult {
  requestId: string;
  status: 'minted' | 'error';
  mintAddress?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);
  const isEnvSuperAdmin = adminConfig.isSuperAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  const canMint =
    isEnvSuperAdmin ||
    isEnvAdmin ||
    dbAdmin?.permissions?.canApproveMints ||
    dbAdmin?.role === 'super_admin';

  if (!canMint) {
    return res.status(403).json({ error: 'Admin access required - must have minting permission' });
  }

  const { requestIds } = req.body;

  if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
    return res.status(400).json({ error: 'requestIds array is required and must not be empty' });
  }

  try {
    // Fetch all MintRequests by IDs
    const mintRequests = await MintRequest.find({ _id: { $in: requestIds } });

    if (mintRequests.length === 0) {
      return res.status(404).json({ error: 'No mint requests found for the provided IDs' });
    }

    // Verify all have status: 'approved'
    const nonApproved = mintRequests.filter((r: any) => r.status !== 'approved');
    if (nonApproved.length > 0) {
      return res.status(400).json({
        error: `${nonApproved.length} request(s) are not in approved status`,
        nonApprovedIds: nonApproved.map((r: any) => ({
          id: r._id.toString(),
          status: r.status,
        })),
      });
    }

    // Get admin keypair for minting
    const adminKeypair = adminConfig.getAdminKeypair();
    if (!adminKeypair) {
      return res.status(500).json({
        error: 'Admin keypair not configured',
        hint: 'Set ADMIN_SECRET environment variable with the keypair JSON array',
      });
    }

    // Setup UMI once for all mints
    const connection = getConnection();
    const umi = createUmi(connection.rpcEndpoint)
      .use(
        keypairIdentity({
          publicKey: umiPublicKey(adminKeypair.publicKey.toBase58()),
          secretKey: adminKeypair.secretKey,
        })
      )
      .use(mplTokenMetadata());

    // Process with concurrency limit of 2
    const limit = pLimit(2);
    const results: BatchMintResult[] = [];

    const tasks = mintRequests.map((mintRequest: any) =>
      limit(async (): Promise<BatchMintResult> => {
        const requestId = mintRequest._id.toString();
        try {
          // Step 1: Upload image
          let imageUrl = mintRequest.imageCid
            ? getStorageConfig().provider === 'irys'
              ? `https://gateway.irys.xyz/${mintRequest.imageCid}`
              : mintRequest.imageUrl
            : null;
          let imageTxId = mintRequest.imageCid;

          if (!imageTxId) {
            let buffer: Buffer;
            let contentType = 'image/png';

            if (mintRequest.imageBase64 && mintRequest.imageBase64.startsWith('data:')) {
              const base64Data = mintRequest.imageBase64.replace(/^data:image\/\w+;base64,/, '');
              buffer = Buffer.from(base64Data, 'base64');
              contentType =
                mintRequest.imageBase64.match(/^data:(image\/\w+);base64,/)?.[1] || 'image/png';
            } else if (
              mintRequest.imageUrl &&
              (mintRequest.imageUrl.startsWith('http://') ||
                mintRequest.imageUrl.startsWith('https://'))
            ) {
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
              // Also support R2 URLs from bulk upload
              if (mintRequest.imageR2Url) {
                fetchUrl = mintRequest.imageR2Url;
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
            } else {
              throw new Error('No valid image source available');
            }

            const imageResult = await uploadImage(buffer, contentType, {
              fileName: `${mintRequest.title.replace(/\s+/g, '-')}.png`,
            });
            imageUrl = imageResult.gateway;
            imageTxId = imageResult.irysTxId || imageResult.ipfsHash;
          }

          if (!imageUrl) {
            throw new Error('No image available for minting');
          }

          // Step 2: Create NFT metadata
          const metadata = {
            name: mintRequest.title,
            symbol: 'LUXHUB',
            description: mintRequest.description || `${mintRequest.brand} ${mintRequest.model}`,
            image: imageUrl,
            external_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/nft/`,
            attributes: [
              { trait_type: 'Brand', value: mintRequest.brand },
              { trait_type: 'Model', value: mintRequest.model },
              { trait_type: 'Reference Number', value: mintRequest.referenceNumber },
              { trait_type: 'Price USD', value: mintRequest.priceUSD?.toString() || '0' },
              ...(mintRequest.material ? [{ trait_type: 'Material', value: mintRequest.material }] : []),
              ...(mintRequest.productionYear ? [{ trait_type: 'Production Year', value: mintRequest.productionYear }] : []),
              ...(mintRequest.movement ? [{ trait_type: 'Movement', value: mintRequest.movement }] : []),
              ...(mintRequest.caseSize ? [{ trait_type: 'Case Size', value: mintRequest.caseSize }] : []),
              ...(mintRequest.waterResistance ? [{ trait_type: 'Water Resistance', value: mintRequest.waterResistance }] : []),
              ...(mintRequest.dialColor ? [{ trait_type: 'Dial Color', value: mintRequest.dialColor }] : []),
              ...(mintRequest.condition ? [{ trait_type: 'Condition', value: mintRequest.condition }] : []),
              ...(mintRequest.boxPapers ? [{ trait_type: 'Box & Papers', value: mintRequest.boxPapers }] : []),
              ...(mintRequest.country ? [{ trait_type: 'Country of Origin', value: mintRequest.country }] : []),
            ],
            properties: {
              category: 'luxury_watch',
              creators: [{ address: adminKeypair.publicKey.toBase58(), share: 100 }],
              luxhub: {
                referenceNumber: mintRequest.referenceNumber,
                priceUSD: mintRequest.priceUSD,
                mintedAt: new Date().toISOString(),
                mintedBy: requestingWallet,
                vendorWallet: mintRequest.wallet,
                batchId: mintRequest.batchId,
              },
            },
          };

          // Step 3: Upload metadata
          const metadataResult = await uploadMetadata(metadata, mintRequest.title);
          const metadataUri = metadataResult.gateway;

          // Step 4: Mint the NFT
          const mintSigner = generateSigner(umi);
          await createNft(umi, {
            mint: mintSigner,
            name: mintRequest.title.slice(0, 32),
            uri: metadataUri,
            sellerFeeBasisPoints: percentAmount(5),
          }).sendAndConfirm(umi);

          const mintAddress = mintSigner.publicKey.toString();

          // Step 5: Transfer to vendor wallet
          let transferSuccess = false;
          if (mintRequest.wallet) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              await transferV1(umi, {
                mint: umiPublicKey(mintAddress),
                destinationOwner: umiPublicKey(mintRequest.wallet),
                tokenStandard: TokenStandard.NonFungible,
              }).sendAndConfirm(umi);
              transferSuccess = true;
            } catch (transferErr) {
              console.error(`[batch-mint] Transfer failed for ${requestId}:`, transferErr);
            }
          }

          // Step 6: Update MintRequest
          await MintRequest.findByIdAndUpdate(requestId, {
            status: 'minted',
            mintAddress,
            imageCid: imageTxId,
            imageUrl,
            mintedBy: requestingWallet,
            mintedAt: new Date(),
          });

          // Step 7: Create Asset
          await Asset.create({
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
            transferHistory: [
              {
                from: adminKeypair.publicKey.toBase58(),
                to: mintRequest.wallet,
                transferredAt: new Date(),
              },
            ],
          });

          return { requestId, status: 'minted', mintAddress };
        } catch (error: any) {
          console.error(`[batch-mint] Error minting ${requestId}:`, error);
          // Update adminNotes with error but keep status='approved' so it's retryable
          try {
            await MintRequest.findByIdAndUpdate(requestId, {
              adminNotes: `Batch mint error: ${error.message || 'Unknown error'}`,
            });
          } catch (updateErr) {
            console.error(`[batch-mint] Failed to update error notes for ${requestId}:`, updateErr);
          }
          return { requestId, status: 'error', error: error.message || 'Unknown error' };
        }
      })
    );

    const batchResults = await Promise.all(tasks);
    results.push(...batchResults);

    const minted = results.filter((r) => r.status === 'minted').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return res.status(200).json({
      results,
      summary: { total: results.length, minted, errors },
    });
  } catch (error) {
    console.error('Error in batch-mint:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
