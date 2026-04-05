// src/pages/api/bags/create-pool-token.ts
// Create pool share token via Bags Token Launch API v2
//
// TWO-PHASE FLOW (fee share must be confirmed on-chain before launch tx):
//
//   Phase 1 (step=setup, default):
//     1. POST /token-launch/create-token-info  → get tokenMint + tokenMetadata
//     2. POST /fee-share/config                → get meteoraConfigKey + txs to sign
//     → Returns fee share transactions. Client signs + sends + waits for confirmation.
//
//   Phase 2 (step=launch, after fee share confirmed):
//     3. POST /token-launch/create-launch-transaction → uses confirmed configKey
//     → Returns launch transaction. Client signs + sends → bonding curve live.
//
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { configureFeeShareInternal } from './configure-fee-share';
import { resolveImageUrl } from '../../../utils/imageUtils';

interface CreatePoolTokenRequest {
  poolId: string;
  adminWallet: string;
  tokenName?: string;
  tokenSymbol?: string;
  initialBuyLamports?: number; // Optional initial buy on launch (in lamports)
  step?: 'setup' | 'launch'; // Phase 1 or Phase 2
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      poolId,
      adminWallet,
      tokenName,
      tokenSymbol,
      initialBuyLamports = 0,
      step = 'setup',
    } = req.body as CreatePoolTokenRequest;

    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
    }

    await dbConnect();

    // Verify admin
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // ──────────────────────────────────────────────────────────────
    // PHASE 2: Create launch transaction (fee share already on-chain)
    // ──────────────────────────────────────────────────────────────
    if (step === 'launch') {
      if (!pool.bagsTokenMint || !pool.meteoraConfigKey) {
        return res.status(400).json({
          error: 'Pool missing token mint or config key. Run step=setup first.',
          hasMint: !!pool.bagsTokenMint,
          hasConfigKey: !!pool.meteoraConfigKey,
        });
      }

      // Find the metadata URL from the token info
      // We stored it during Phase 1 or we can reconstruct
      const metadataUrl = pool.bagsTokenMetadataUrl || `https://ipfs.io/ipfs/${pool.bagsTokenMint}`; // Fallback

      const launchResponse = await fetch(
        `${BAGS_API_BASE}/token-launch/create-launch-transaction`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': bagsApiKey,
          },
          body: JSON.stringify({
            ipfs: metadataUrl,
            tokenMint: pool.bagsTokenMint,
            wallet: adminWallet,
            initialBuyLamports,
            configKey: pool.meteoraConfigKey,
          }),
        }
      );

      if (!launchResponse.ok) {
        const errorData = await launchResponse.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Launch transaction failed. Ensure fee share config is confirmed on-chain.',
          details: errorData,
          tokenMint: pool.bagsTokenMint,
          meteoraConfigKey: pool.meteoraConfigKey,
          hint: 'If you just signed fee share txs, wait a few seconds for confirmation before retrying.',
        });
      }

      const launchResult = await launchResponse.json();
      const launchTx = launchResult.response || launchResult;

      // Update pool status
      await Pool.findByIdAndUpdate(poolId, {
        $set: {
          tokenStatus: 'minted',
          bondingCurveActive: true,
          bondingCurveType: 'exponential',
          initialBondingPrice: pool.sharePriceUSD || 0.01,
          currentBondingPrice: pool.sharePriceUSD || 0.01,
        },
      });

      return res.status(200).json({
        success: true,
        phase: 2,
        pool: {
          _id: pool._id,
          bagsTokenMint: pool.bagsTokenMint,
          meteoraConfigKey: pool.meteoraConfigKey,
        },
        transactions: [
          {
            step: 'launch',
            description: 'Token launch transaction — creates bonding curve',
            transaction: typeof launchTx === 'string' ? launchTx : launchTx.transaction,
            blockhash: typeof launchTx === 'string' ? undefined : launchTx.blockhash,
          },
        ],
        transactionCount: 1,
        message: 'Phase 2 ready: Sign the launch transaction to activate the bonding curve.',
      });
    }

    // ──────────────────────────────────────────────────────────────
    // PHASE 1: Create token info + fee share config
    // ──────────────────────────────────────────────────────────────
    // If mint already exists, skip create-token-info and go straight to
    // fee-share configuration with fresh blockhash (just-in-time signing).
    if (pool.bagsTokenMint) {
      const feeShareResult = await configureFeeShareInternal(poolId, pool.bagsTokenMint, adminWallet);

      if (!feeShareResult.success || !feeShareResult.meteoraConfigKey) {
        return res.status(500).json({
          error: 'Fee share configuration failed',
          details: feeShareResult.error,
          tokenMint: pool.bagsTokenMint,
        });
      }

      const feeShareTransactions = feeShareResult.transactions || [];

      return res.status(200).json({
        success: true,
        phase: 1,
        resumed: true,
        token: {
          mint: pool.bagsTokenMint,
          metadataUrl: pool.bagsTokenMetadataUrl,
        },
        feeShare: {
          meteoraConfigKey: feeShareResult.meteoraConfigKey,
          feeShareAuthority: feeShareResult.feeShareAuthority,
          needsCreation: feeShareTransactions.length > 0,
        },
        pool: {
          _id: pool._id,
          bagsTokenMint: pool.bagsTokenMint,
          meteoraConfigKey: feeShareResult.meteoraConfigKey,
        },
        transactions: feeShareTransactions.map((tx: any, i: number) => ({
          step: `fee-share-${i + 1}`,
          description: `Fee share config transaction ${i + 1}/${feeShareTransactions.length}`,
          ...tx,
        })),
        transactionCount: feeShareTransactions.length,
        message:
          feeShareTransactions.length > 0
            ? `Sign ${feeShareTransactions.length} fee share transaction(s), confirm on-chain, then call step=launch.`
            : 'Fee share config already on-chain. Call again with step=launch.',
      });
    }

    // Get asset info — try populated Asset, fall back to MintRequest
    let asset = pool.selectedAssetId as any;
    if (!asset || !asset.model) {
      const MintRequest = (await import('../../../lib/models/MintRequest')).default;
      const mintReq = await MintRequest.findById(pool.selectedAssetId);
      if (mintReq) {
        asset = {
          model: mintReq.model,
          brand: mintReq.brand,
          serial: mintReq.serial || mintReq.serialNumber,
          description: mintReq.description,
          priceUSD: mintReq.priceUSD,
          imageUrl: mintReq.imageUrl,
          imageIpfsUrls: mintReq.imageIpfsUrls,
          images: mintReq.images,
          mintAddress: mintReq.mintAddress,
        };
      }
    }
    const assetBrand = asset?.brand || '';
    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetSerial = asset?.serial || asset?.serialNumber || '';
    const assetDescription = asset?.description || '';
    const assetNftMint = asset?.mintAddress || asset?.nftMint || '';
    const assetPrice = asset?.priceUSD ? `$${asset.priceUSD.toLocaleString()}` : '';
    const { resolveImageUrl: resolveImg } = await import('../../../utils/imageUtils');
    const rawImage = asset?.imageUrl || asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';
    const assetImage = rawImage ? resolveImg(rawImage) : '';

    // Generate token name and symbol
    const poolNumber = pool.poolNumber || pool._id.toString().slice(-6).toUpperCase();
    const rawName = tokenName || (assetBrand && assetModel ? `${assetBrand} ${assetModel}` : `LuxHub Pool ${poolNumber}`);
    const finalTokenName = rawName.slice(0, 32);
    const finalTokenSymbol = (tokenSymbol || poolNumber).slice(0, 10);

    // Rich description with watch details
    const descParts = [
      `Tokenized ownership pool for an authenticated ${assetBrand} ${assetModel}.`,
      assetSerial ? `Serial: ${assetSerial}.` : '',
      assetPrice ? `Appraised at ${assetPrice}.` : '',
      assetDescription ? assetDescription : '',
      assetNftMint ? `Backing NFT: ${assetNftMint}.` : '',
      `Pool: ${poolNumber}. Custody verified via LuxHub marketplace.`,
    ].filter(Boolean).join(' ');
    const finalDescription = descParts.slice(0, 1000);

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Create token info + metadata via Bags API
    // ──────────────────────────────────────────────────────────────
    const formData = new FormData();
    formData.append('name', finalTokenName);
    formData.append('symbol', finalTokenSymbol);
    formData.append('description', finalDescription);
    // Bags requires an actual image file upload
    if (assetImage) {
      try {
        const imgRes = await fetch(assetImage);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
          const blob = new Blob([imgBuffer], { type: contentType });
          formData.append('image', blob, `pool-asset.${ext}`);
        } else {
          console.warn(`[create-pool-token] Image download failed: ${imgRes.status}`);
        }
      } catch (err: any) {
        console.warn('[create-pool-token] Image download error:', err?.message);
      }
    }
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/pools/${poolId}`);

    const tokenInfoResponse = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
      method: 'POST',
      headers: { 'x-api-key': bagsApiKey },
      body: formData,
    });

    if (!tokenInfoResponse.ok) {
      const errorData = await tokenInfoResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Step 1 failed: Could not create token info via Bags API',
        details: errorData,
      });
    }

    const tokenInfoResult = await tokenInfoResponse.json();
    const tokenInfoData = tokenInfoResult.response || tokenInfoResult;
    const tokenMintAddress = tokenInfoData.tokenMint;
    const tokenMetadataUrl = tokenInfoData.tokenMetadata;

    if (!tokenMintAddress || !tokenMetadataUrl) {
      return res.status(500).json({
        error: 'Step 1 incomplete: Bags did not return tokenMint or tokenMetadata',
        data: tokenInfoData,
      });
    }

    // Save token mint + metadata URL immediately so we don't lose them if later steps fail
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        bagsTokenMint: tokenMintAddress,
        bagsTokenMetadataUrl: tokenMetadataUrl,
        bagsTokenCreatedAt: new Date(),
        fractionalMint: tokenMintAddress,
        bagsTokenName: finalTokenName,
        bagsTokenSymbol: finalTokenSymbol,
        tokenStatus: 'pending', // Not yet launched — needs signing
      },
    });

    // ──────────────────────────────────────────────────────────────
    // STEP 2: Configure fee share → get meteoraConfigKey
    // ──────────────────────────────────────────────────────────────
    const feeShareResult = await configureFeeShareInternal(poolId, tokenMintAddress, adminWallet);

    if (!feeShareResult.success || !feeShareResult.meteoraConfigKey) {
      console.error('[create-pool-token] Fee share config failed:', feeShareResult.error);
      return res.status(500).json({
        error: 'Step 2 failed: Could not configure fee share',
        details: feeShareResult.error,
        note: 'Token info was created (mint saved). You can retry fee share via /api/bags/configure-fee-share, then launch manually.',
        tokenMint: tokenMintAddress,
      });
    }

    const meteoraConfigKey = feeShareResult.meteoraConfigKey;
    const feeShareTransactions = feeShareResult.transactions || [];

    // ──────────────────────────────────────────────────────────────
    // PHASE 1 RESPONSE: Return fee share transactions to sign
    // Client must sign + send + confirm these BEFORE requesting Phase 2
    // ──────────────────────────────────────────────────────────────
    return res.status(200).json({
      success: true,
      phase: 1,
      token: {
        name: finalTokenName,
        symbol: finalTokenSymbol,
        mint: tokenMintAddress,
        metadataUrl: tokenMetadataUrl,
      },
      feeShare: {
        meteoraConfigKey,
        feeShareAuthority: feeShareResult.feeShareAuthority,
        needsCreation: feeShareTransactions.length > 0,
      },
      pool: {
        _id: pool._id,
        bagsTokenMint: tokenMintAddress,
        meteoraConfigKey,
      },
      transactions: feeShareTransactions.map((tx: any, i: number) => ({
        step: `fee-share-${i + 1}`,
        description: `Fee share config transaction ${i + 1}/${feeShareTransactions.length}`,
        ...tx,
      })),
      transactionCount: feeShareTransactions.length,
      message:
        feeShareTransactions.length > 0
          ? `Phase 1 ready: Sign ${feeShareTransactions.length} fee share transaction(s), confirm on-chain, then call again with step=launch.`
          : 'Fee share config already on-chain. Call again with step=launch to get the launch transaction.',
      nextStep: {
        method: 'POST',
        url: '/api/bags/create-pool-token',
        body: { poolId, adminWallet, step: 'launch', initialBuyLamports },
        when: 'After ALL fee share transactions are confirmed on-chain',
      },
    });
  } catch (error: any) {
    console.error('[/api/bags/create-pool-token] Error:', error);
    return res.status(500).json({
      error: 'Failed to create pool token',
      details: error?.message || 'Unknown error',
    });
  }
}

/**
 * Internal function to create a Bags token for a pool.
 * Called automatically during pool creation flow.
 * Non-blocking: logs warnings on failure so pool creation still succeeds.
 *
 * Returns all transactions that need signing before the token is live.
 */
export async function createPoolTokenInternal(
  poolId: string,
  creatorWallet: string,
  tokenImageBase64?: string,
  tokenImageUrl?: string
): Promise<{
  success: boolean;
  mint?: string;
  meteoraConfigKey?: string;
  transactions?: any[];
  error?: string;
}> {
  const bagsApiKey = process.env.BAGS_API_KEY;
  if (!bagsApiKey) {
    return { success: false, error: 'BAGS_API_KEY not configured' };
  }

  try {
    await dbConnect();

    // Fetch pool WITHOUT populate so we keep the original selectedAssetId ObjectId
    // (populate() would null it out if the Asset doc doesn't exist, making
    // MintRequest fallback impossible)
    const pool = await Pool.findById(poolId).lean() as any;
    if (!pool) return { success: false, error: 'Pool not found' };
    if (pool.bagsTokenMint) return { success: true, mint: pool.bagsTokenMint };

    // Look up asset in both Asset and MintRequest collections
    const assetIdStr = pool.selectedAssetId?.toString();
    let asset: any = null;
    if (assetIdStr) {
      const { Asset } = await import('../../../lib/models/Assets');
      const { default: MintRequest } = await import('../../../lib/models/MintRequest');
      const [assetDoc, mintReq] = await Promise.all([
        Asset.findById(assetIdStr).lean() as any,
        MintRequest.findById(assetIdStr).lean() as any,
      ]);
      const source = assetDoc || mintReq;
      if (source) {
        asset = {
          model: source.model,
          brand: source.brand,
          serial: source.serial || source.serialNumber,
          description: source.description,
          priceUSD: source.priceUSD,
          imageUrl: source.imageUrl,
          imageIpfsUrls: source.imageIpfsUrls,
          images: source.images,
          mintAddress: source.mintAddress,
        };
        console.log(`[createPoolTokenInternal] Loaded asset: ${source.brand} ${source.model} (from ${assetDoc ? 'Asset' : 'MintRequest'}), image: ${source.imageUrl?.slice(0, 60)}`);
      }
    }

    const assetBrand = asset?.brand || '';
    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetSerial = asset?.serial || asset?.serialNumber || '';
    const assetDescription = asset?.description || '';
    const assetNftMint = asset?.mintAddress || asset?.nftMint || '';
    const assetPrice = asset?.priceUSD ? `$${asset.priceUSD.toLocaleString()}` : '';

    // Image priority: client-provided URL > DB asset image. Resolve through gateway.
    const rawImage = tokenImageUrl || asset?.imageUrl || asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';
    const assetImage = rawImage ? resolveImageUrl(rawImage) : '';
    console.log(`[createPoolTokenInternal] Asset: ${assetBrand} ${assetModel}, Raw: ${rawImage?.slice(0, 60) || 'NONE'}, Resolved: ${assetImage?.slice(0, 80) || 'NONE'}, Source: ${tokenImageUrl ? 'client-url' : 'db'}`);
    const poolNumber = pool.poolNumber || pool._id.toString().slice(-6).toUpperCase();

    // Token name — prefer "{brand} {model}" to "LuxHub Pool #..." for meaningful identity
    // (32 char limit means we pack brand+model first, fall back gracefully)
    const rawName = assetBrand && assetModel
      ? `${assetBrand} ${assetModel}`
      : `LuxHub Pool ${poolNumber}`;
    const tokenName = rawName.slice(0, 32);

    // Use pool number directly as symbol (LUX0001, LUX0002, etc.)
    // poolNumber is already prefixed "LUX" by create.ts, no need to add another prefix
    const tokenSymbol = poolNumber.slice(0, 10);

    // Rich description — packs watch details, authentication, and backing NFT link
    const descParts = [
      `Tokenized ownership pool for an authenticated ${assetBrand} ${assetModel}.`,
      assetSerial ? `Serial: ${assetSerial}.` : '',
      assetPrice ? `Appraised at ${assetPrice}.` : '',
      assetDescription ? assetDescription : '',
      assetNftMint ? `Backing NFT: ${assetNftMint}.` : '',
      `Pool: ${poolNumber}. Custody verified via LuxHub marketplace.`,
    ].filter(Boolean).join(' ');
    const tokenDescription = descParts.slice(0, 1000);

    // STEP 1: Create token info
    const formData = new FormData();
    formData.append('name', tokenName);
    formData.append('symbol', tokenSymbol);
    formData.append('description', tokenDescription);
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/pools/${poolId}`);

    // Image: prefer user-uploaded base64 > download from URL > fallback to imageUrl string
    let imageAttached = false;

    if (tokenImageBase64 && tokenImageBase64.startsWith('data:image')) {
      // User uploaded image directly — convert base64 to blob
      console.log('[createPoolTokenInternal] Using user-uploaded image (base64)');
      const base64Data = tokenImageBase64.split(',')[1];
      const mimeMatch = tokenImageBase64.match(/data:(image\/\w+);/);
      const mime = mimeMatch?.[1] || 'image/png';
      const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const blob = new Blob([imgBuffer], { type: mime });
      formData.append('image', blob, `pool-token.${ext}`);
      imageAttached = true;
    }

    if (!imageAttached && assetImage) {
      // Try downloading from NFT image URL
      try {
        console.log(`[createPoolTokenInternal] Downloading image: ${assetImage.slice(0, 120)}`);
        const imgRes = await fetch(assetImage);
        console.log(`[createPoolTokenInternal] Image download status: ${imgRes.status}, content-type: ${imgRes.headers.get('content-type')}, size: ${imgRes.headers.get('content-length')}`);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
          const blob = new Blob([imgBuffer], { type: contentType });
          formData.append('image', blob, `pool-token.${ext}`);
          imageAttached = true;
          console.log(`[createPoolTokenInternal] Image attached successfully, buffer size: ${imgBuffer.length} bytes`);
        } else {
          console.warn(`[createPoolTokenInternal] Image download failed: ${imgRes.status} ${imgRes.statusText}`);
        }
      } catch (imgErr: any) {
        console.warn('[createPoolTokenInternal] Image download error:', imgErr?.message || imgErr);
      }
    }

    if (!imageAttached) {
      console.error('[createPoolTokenInternal] No image available for Bags token');
      return { success: false, error: 'No image available. Please upload an image for the pool token.' };
    }

    const infoRes = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
      method: 'POST',
      headers: { 'x-api-key': bagsApiKey },
      body: formData,
    });

    if (!infoRes.ok) {
      const err = await infoRes.json().catch(() => ({}));
      return { success: false, error: `Bags token info failed: ${JSON.stringify(err)}` };
    }

    const infoResult = await infoRes.json();
    const infoData = infoResult.response || infoResult;
    const mint = infoData.tokenMint;
    const metadataUrl = infoData.tokenMetadata;

    if (!mint || !metadataUrl) {
      return { success: false, error: 'Bags did not return tokenMint or tokenMetadata' };
    }

    // Save mint immediately
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        bagsTokenMint: mint,
        bagsTokenCreatedAt: new Date(),
        fractionalMint: mint,
        bagsTokenName: tokenName,
        bagsTokenSymbol: tokenSymbol,
        tokenStatus: 'pending',
      },
    });

    // STOP HERE — Steps 2 and 3 (fee-share + launch) MUST be called just-in-time
    // by the client with fresh blockhashes. Calling them server-side produces
    // transactions that expire before the user can sign them.
    //
    // The stepper will call:
    //   POST /api/bags/create-pool-token { step: 'setup' }  → fresh fee-share txs
    //   (user signs immediately, waits for confirmation)
    //   POST /api/bags/create-pool-token { step: 'launch' } → fresh launch tx
    //
    console.log(
      `[createPoolTokenInternal] Token info created for pool ${poolId}: ${mint}. Awaiting client fee-share signing.`
    );

    return {
      success: true,
      mint,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

