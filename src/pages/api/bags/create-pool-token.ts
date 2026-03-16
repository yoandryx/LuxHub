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

    // Step 1: Create token info via Bags API
    const tokenInfoResponse = await fetch(`${BAGS_API_BASE}/token/create-token-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        name: finalTokenName,
        symbol: finalTokenSymbol,
        description: `Tokenized pool for authenticated ${assetModel}. Trade anytime on secondary markets. Pool ID: ${poolId}`,
        image: assetImage,
        twitter: 'https://x.com/LuxHubStudio',
        website: process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold',
        // Additional metadata
        attributes: [
          { trait_type: 'Pool ID', value: poolId },
          { trait_type: 'Asset Model', value: assetModel },
          { trait_type: 'Total Supply', value: '1,000,000,000' },
          { trait_type: 'Target Amount', value: `$${pool.targetAmountUSD?.toFixed(2) || '0'}` },
        ],
      }),
    });

    if (!tokenInfoResponse.ok) {
      const errorData = await tokenInfoResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to create token info via Bags API',
        details: errorData,
      });
    }

    const tokenInfoResult = await tokenInfoResponse.json();

    // Step 2: Create token launch transaction
    // Determine launch configuration based on launchType
    const isFixedSupply = launchType === 'fixed_supply';
    const calculatedInitialPrice = initialPriceUSD || pool.sharePriceUSD || 0.01;

    const launchPayload: Record<string, unknown> = {
      tokenInfoId: tokenInfoResult.id,
      creator: adminWallet,
    };

    if (isFixedSupply) {
      // Fixed supply mode - traditional pool shares
      launchPayload.totalSupply = pool.totalShares;
      launchPayload.launchType = 'fixed';
    } else {
      // Bonding curve mode - dynamic minting
      launchPayload.launchType = 'bonding_curve';
      launchPayload.bondingCurve = {
        type: bondingCurveType,
        targetMarketCap: pool.targetAmountUSD,
        initialPrice: calculatedInitialPrice,
        // Graduation triggers when market cap reaches target
        graduationThreshold: pool.targetAmountUSD,
      };
      // Creator fee for LuxHub (vested per Bags new model)
      launchPayload.creatorFeeBps = 100; // 1% creator fee (vesting)
      launchPayload.holderDividendBps = pool.holderDividendBps || 100; // 1% holder distributions
    }

    const launchResponse = await fetch(`${BAGS_API_BASE}/token/create-token-launch-transaction`, {
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

    // Update pool with Bags token info and bonding curve config
    const poolUpdate: Record<string, unknown> = {
      bagsTokenMint: launchResult.mint || launchResult.tokenMint,
      bagsTokenCreatedAt: new Date(),
      fractionalMint: launchResult.mint || launchResult.tokenMint,
      bondingCurveActive: !isFixedSupply,
      bondingCurveType: isFixedSupply ? undefined : bondingCurveType,
      initialBondingPrice: isFixedSupply ? undefined : calculatedInitialPrice,
      currentBondingPrice: isFixedSupply ? undefined : calculatedInitialPrice,
      tokenStatus: 'minted',
    };

    if (launchResult.bondingCurveAddress) {
      poolUpdate.bondingCurveAddress = launchResult.bondingCurveAddress;
    }

    await Pool.findByIdAndUpdate(poolId, { $set: poolUpdate });

    // Auto-configure fee share (3% to LuxHub treasury) immediately after token creation
    const tokenMint = launchResult.mint || launchResult.tokenMint;
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
        mint: launchResult.mint || launchResult.tokenMint,
        tokenInfoId: tokenInfoResult.id,
        launchType: isFixedSupply ? 'fixed_supply' : 'bonding_curve',
        ...(isFixedSupply
          ? { totalSupply: pool.totalShares }
          : {
              bondingCurve: {
                type: bondingCurveType,
                initialPrice: calculatedInitialPrice,
                targetMarketCap: pool.targetAmountUSD,
                bondingCurveAddress: launchResult.bondingCurveAddress,
              },
            }),
      },
      pool: {
        _id: pool._id,
        bagsTokenMint: launchResult.mint || launchResult.tokenMint,
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
      transaction: launchResult.transaction,
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
