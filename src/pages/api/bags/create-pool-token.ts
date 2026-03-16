// src/pages/api/bags/create-pool-token.ts
// Create pool share token via Bags Token Launch API
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
  // Bonding curve configuration
  launchType?: 'fixed_supply' | 'bonding_curve';
  bondingCurveType?: 'linear' | 'exponential' | 'sqrt';
  initialPriceUSD?: number;
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
      launchType = 'bonding_curve',
      bondingCurveType = 'exponential',
      initialPriceUSD,
    } = req.body as CreatePoolTokenRequest;

    // Validation
    if (!poolId || !adminWallet) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, adminWallet',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({
        error: 'BAGS_API_KEY not configured',
      });
    }

    await dbConnect();

    // Verify admin privileges
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Find the pool
    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Check if token already exists
    if (pool.bagsTokenMint) {
      return res.status(400).json({
        error: 'Pool already has a token mint',
        bagsTokenMint: pool.bagsTokenMint,
      });
    }

    // Get asset info for token metadata
    const asset = pool.selectedAssetId as any;
    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetImage = asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';

    // Generate token name and symbol
    const poolNumber = pool._id.toString().slice(-6).toUpperCase();
    const finalTokenName = tokenName || `LuxHub Pool #${poolNumber} - ${assetModel}`;
    const finalTokenSymbol = tokenSymbol || `LUX-${poolNumber}`;

    // Step 1: Create token info via Bags API (multipart/form-data)
    const formData = new FormData();
    formData.append('name', finalTokenName);
    formData.append('symbol', finalTokenSymbol);
    formData.append(
      'description',
      `Tokenized pool for authenticated ${assetModel}. Trade anytime on secondary markets. Pool ID: ${poolId}`
    );
    formData.append('imageUrl', assetImage);
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold');

    const tokenInfoResponse = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
      method: 'POST',
      headers: {
        'x-api-key': bagsApiKey,
      },
      body: formData,
    });

    if (!tokenInfoResponse.ok) {
      const errorData = await tokenInfoResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to create token info via Bags API',
        details: errorData,
      });
    }

    const tokenInfoResult = await tokenInfoResponse.json();
    const tokenInfoData = tokenInfoResult.response || tokenInfoResult;

    // Step 2: Create token launch transaction
    // Determine launch configuration based on launchType
    const isFixedSupply = launchType === 'fixed_supply';

    const launchPayload: Record<string, unknown> = {
      ipfs: tokenInfoData.tokenMetadata, // IPFS URL from create-info response
      tokenMint: tokenInfoData.tokenMint, // Token mint from create-info response
      wallet: adminWallet,
      initialBuyLamports: 0, // No initial buy by default
      configKey: isFixedSupply ? 'fixed' : 'bonding_curve',
    };

    const launchResponse = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify(launchPayload),
    });

    if (!launchResponse.ok) {
      const errorData = await launchResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to create token launch transaction via Bags API',
        details: errorData,
      });
    }

    const launchResult = await launchResponse.json();
    const launchData = launchResult.response || launchResult;

    // The token mint comes from the create-info step
    const tokenMintAddress = tokenInfoData.tokenMint;
    const calculatedInitialPrice = initialPriceUSD || pool.sharePriceUSD || 0.01;

    // Update pool with Bags token info and bonding curve config
    const poolUpdate: Record<string, unknown> = {
      bagsTokenMint: tokenMintAddress,
      bagsTokenCreatedAt: new Date(),
      fractionalMint: tokenMintAddress,
      bondingCurveActive: !isFixedSupply,
      bondingCurveType: isFixedSupply ? undefined : bondingCurveType,
      initialBondingPrice: isFixedSupply ? undefined : calculatedInitialPrice,
      currentBondingPrice: isFixedSupply ? undefined : calculatedInitialPrice,
      tokenStatus: 'minted',
    };

    await Pool.findByIdAndUpdate(poolId, { $set: poolUpdate });

    // Auto-configure fee share (3% to LuxHub treasury) immediately after token creation
    const tokenMint = tokenMintAddress;
    let feeShareResult = null;
    try {
      feeShareResult = await configureFeeShareInternal(poolId, tokenMint, adminWallet);
      if (!feeShareResult.success) {
        console.warn('[create-pool-token] Fee share auto-config failed:', feeShareResult.error);
      }
    } catch (feeErr) {
      console.warn('[create-pool-token] Fee share auto-config error:', feeErr);
    }

    return res.status(200).json({
      success: true,
      token: {
        name: finalTokenName,
        symbol: finalTokenSymbol,
        mint: tokenMintAddress,
        tokenInfoId: tokenInfoData.tokenMint,
        launchType: isFixedSupply ? 'fixed_supply' : 'bonding_curve',
        ...(isFixedSupply
          ? { totalSupply: pool.totalShares }
          : {
              bondingCurve: {
                type: bondingCurveType,
                initialPrice: calculatedInitialPrice,
                targetMarketCap: pool.targetAmountUSD,
              },
            }),
      },
      pool: {
        _id: pool._id,
        bagsTokenMint: tokenMintAddress,
        bondingCurveActive: !isFixedSupply,
      },
      feeShare: feeShareResult?.success
        ? {
            configured: true,
            configId: feeShareResult.configId,
            feePercent: '3%',
            transaction: feeShareResult.transaction,
          }
        : {
            configured: false,
            error:
              feeShareResult?.error ||
              'Fee share not configured — run /api/bags/configure-fee-share manually',
          },
      transaction: launchData, // base58 serialized tx string from launch response
      message: isFixedSupply
        ? 'Pool share token created via Bags (fixed supply). Transaction ready for signing.'
        : 'Pool bonding curve token created via Bags. Transaction ready for signing.',
      nextSteps: isFixedSupply
        ? [
            'Sign and send the transaction to complete token creation',
            'Pool shares will be represented as SPL tokens',
            'Participants can trade tokens on secondary markets',
          ]
        : [
            'Sign and send the transaction to launch bonding curve',
            'Participants buy tokens which mints new supply dynamically',
            'Price increases as more tokens are minted (bonding curve)',
            'When target market cap is reached, token graduates to DEX',
            'Top 100 holders become Squad DAO members for governance',
          ],
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
 * Called automatically during pool creation — no admin auth needed (already validated upstream).
 * Non-blocking: logs warnings on failure so pool creation still succeeds.
 */
export async function createPoolTokenInternal(
  poolId: string,
  creatorWallet: string
): Promise<{ success: boolean; mint?: string; transaction?: string; error?: string }> {
  const bagsApiKey = process.env.BAGS_API_KEY;
  if (!bagsApiKey) {
    return { success: false, error: 'BAGS_API_KEY not configured' };
  }

  try {
    await dbConnect();

    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool) return { success: false, error: 'Pool not found' };
    if (pool.bagsTokenMint) return { success: true, mint: pool.bagsTokenMint }; // Already has token

    const asset = pool.selectedAssetId as any;
    const assetModel = asset?.model || 'LuxHub Pool Asset';
    const assetImage = asset?.imageUrl || asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '';
    const poolNumber = pool.poolNumber || pool._id.toString().slice(-6).toUpperCase();
    const tokenName = `LuxHub Pool #${poolNumber} - ${assetModel}`;
    const tokenSymbol = `LUX-${poolNumber.replace('LUX-', '')}`;

    // Step 1: Create token info (multipart/form-data)
    const formData = new FormData();
    formData.append('name', tokenName);
    formData.append('symbol', tokenSymbol);
    formData.append(
      'description',
      `Tokenized pool for authenticated ${assetModel}. Pool ID: ${poolId}`
    );
    formData.append('imageUrl', assetImage);
    formData.append('twitter', 'https://x.com/LuxHubStudio');
    formData.append('website', process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold');

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
    const initialPrice = pool.sharePriceUSD || 0.01;

    // Step 2: Create token launch transaction (bonding curve)
    const launchRes = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': bagsApiKey },
      body: JSON.stringify({
        ipfs: infoData.tokenMetadata, // IPFS URL from create-info response
        tokenMint: infoData.tokenMint, // Token mint from create-info response
        wallet: creatorWallet,
        initialBuyLamports: 0,
        configKey: 'bonding_curve',
      }),
    });

    if (!launchRes.ok) {
      const err = await launchRes.json().catch(() => ({}));
      return { success: false, error: `Bags token launch failed: ${JSON.stringify(err)}` };
    }

    const launchResult = await launchRes.json();
    // Token mint comes from the create-info step; launch response is the serialized tx
    const mint = infoData.tokenMint;

    // Update pool with token info
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        bagsTokenMint: mint,
        bagsTokenCreatedAt: new Date(),
        fractionalMint: mint,
        bondingCurveActive: true,
        bondingCurveType: 'exponential',
        initialBondingPrice: initialPrice,
        currentBondingPrice: initialPrice,
        tokenStatus: 'minted',
        // bondingCurveAddress no longer returned by Bags API
      },
    });

    // Auto-configure fee share (3% to LuxHub)
    try {
      await configureFeeShareInternal(poolId, mint, creatorWallet);
    } catch (feeErr) {
      console.warn('[createPoolTokenInternal] Fee share config failed:', feeErr);
    }

    console.log(`[createPoolTokenInternal] Token minted for pool ${poolId}: ${mint}`);

    return {
      success: true,
      mint,
      transaction: launchResult.response || launchResult.transaction, // base58 serialized tx, needs signing by creator
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown error' };
  }
}
