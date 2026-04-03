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
    if (pool.bagsTokenMint) {
      return res.status(400).json({
        error: 'Pool already has a token mint. Use step=launch to get the launch transaction.',
        bagsTokenMint: pool.bagsTokenMint,
        meteoraConfigKey: pool.meteoraConfigKey,
      });
    }

    // Get asset info — try populated Asset, fall back to MintRequest
    let asset = pool.selectedAssetId as any;
    if (!asset || !asset.model) {
      const MintRequest = (await import('../../../lib/models/MintRequest')).default;
      const mintReq = await MintRequest.findById(pool.selectedAssetId);
      if (mintReq) {
        asset = { model: mintReq.model, brand: mintReq.brand, imageUrl: mintReq.imageUrl, imageIpfsUrls: mintReq.imageIpfsUrls, images: mintReq.images };
      }
    }
    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetImage = asset?.imageUrl || asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';

    // Generate token name and symbol
    const poolNumber = pool.poolNumber || pool._id.toString().slice(-6).toUpperCase();
    const finalTokenName = tokenName || `LuxHub Pool #${poolNumber} - ${assetModel}`;
    const finalTokenSymbol = tokenSymbol || `LUX-${poolNumber.replace('LUX-', '')}`;

    // ──────────────────────────────────────────────────────────────
    // STEP 1: Create token info + metadata via Bags API
    // ──────────────────────────────────────────────────────────────
    const formData = new FormData();
    formData.append('name', finalTokenName.slice(0, 32)); // Max 32 chars
    formData.append('symbol', finalTokenSymbol.slice(0, 10)); // Max 10 chars
    formData.append(
      'description',
      `Tokenized pool for authenticated ${assetModel}. Trade on secondary markets. Pool ID: ${poolId}`.slice(
        0,
        1000
      )
    );
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
          formData.append('imageUrl', assetImage);
        }
      } catch {
        formData.append('imageUrl', assetImage);
      }
    }
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold');

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
  tokenImageBase64?: string
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

    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool) return { success: false, error: 'Pool not found' };
    if (pool.bagsTokenMint) return { success: true, mint: pool.bagsTokenMint };

    // Get asset data — try populated Asset first, then fall back to MintRequest
    let asset = pool.selectedAssetId as any;
    if (!asset || !asset.model) {
      // Populate failed (MintRequest ID, not Asset) — fetch from MintRequest
      const { default: MintRequest } = await import('../../../lib/models/MintRequest');
      const mintReq = await MintRequest.findById(pool.selectedAssetId);
      if (mintReq) {
        asset = {
          model: mintReq.model,
          brand: mintReq.brand,
          imageUrl: mintReq.imageUrl,
          imageIpfsUrls: mintReq.imageIpfsUrls,
          images: mintReq.images,
        };
        console.log(`[createPoolTokenInternal] Loaded asset from MintRequest: ${mintReq.brand} ${mintReq.model}, image: ${mintReq.imageUrl?.slice(0, 60)}`);
      }
    }

    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetImage = asset?.imageUrl || asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';
    console.log(`[createPoolTokenInternal] Asset: ${assetModel}, Image URL: ${assetImage?.slice(0, 80) || 'NONE'}`);
    const poolNumber = pool.poolNumber || pool._id.toString().slice(-6).toUpperCase();
    const tokenName = `LuxHub Pool #${poolNumber} - ${assetModel}`.slice(0, 32);
    const tokenSymbol = `LUX-${poolNumber.replace('LUX-', '')}`.slice(0, 10);

    // STEP 1: Create token info
    const formData = new FormData();
    formData.append('name', tokenName);
    formData.append('symbol', tokenSymbol);
    formData.append(
      'description',
      `Tokenized pool for authenticated ${assetModel}. Pool ID: ${poolId}`.slice(0, 1000)
    );
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold');

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
        console.log(`[createPoolTokenInternal] Downloading image: ${assetImage.slice(0, 80)}`);
        const imgRes = await fetch(assetImage);
        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get('content-type') || 'image/png';
          const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
          const blob = new Blob([imgBuffer], { type: contentType });
          formData.append('image', blob, `pool-token.${ext}`);
          imageAttached = true;
        } else {
          console.warn(`[createPoolTokenInternal] Image download failed: ${imgRes.status}`);
        }
      } catch (imgErr) {
        console.warn('[createPoolTokenInternal] Image download error:', imgErr);
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

    // STEP 2: Configure fee share → get meteoraConfigKey
    const feeShareResult = await configureFeeShareInternal(poolId, mint, creatorWallet);

    if (!feeShareResult.success || !feeShareResult.meteoraConfigKey) {
      console.warn('[createPoolTokenInternal] Fee share config failed:', feeShareResult.error);
      return {
        success: false,
        mint,
        error: `Fee share failed: ${feeShareResult.error}. Token info saved — retry fee share + launch manually.`,
      };
    }

    // STEP 3: Create launch transaction
    const launchRes = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': bagsApiKey },
      body: JSON.stringify({
        ipfs: metadataUrl,
        tokenMint: mint,
        wallet: creatorWallet,
        initialBuyLamports: 0,
        configKey: feeShareResult.meteoraConfigKey,
      }),
    });

    if (!launchRes.ok) {
      const err = await launchRes.json().catch(() => ({}));
      return {
        success: false,
        mint,
        meteoraConfigKey: feeShareResult.meteoraConfigKey,
        error: `Launch tx failed: ${JSON.stringify(err)}. Fee share configured — retry launch manually.`,
      };
    }

    const launchResult = await launchRes.json();
    const launchTx = launchResult.response || launchResult;

    // Update pool
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        tokenStatus: 'minted',
        bondingCurveActive: true,
        bondingCurveType: 'exponential',
        initialBondingPrice: pool.sharePriceUSD || 0.01,
        currentBondingPrice: pool.sharePriceUSD || 0.01,
      },
    });

    // Collect all transactions in signing order
    const allTransactions = [
      ...(feeShareResult.transactions || []),
      typeof launchTx === 'string' ? { transaction: launchTx } : launchTx,
    ];

    console.log(
      `[createPoolTokenInternal] Token prepared for pool ${poolId}: ${mint} (${allTransactions.length} txs to sign)`
    );

    return {
      success: true,
      mint,
      meteoraConfigKey: feeShareResult.meteoraConfigKey,
      transactions: allTransactions,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
