// src/pages/api/bags/create-pool-token.ts
// Create pool share token via Bags Token Launch API
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Asset } from '../../../lib/models/Assets';
import { User } from '../../../lib/models/User';

interface CreatePoolTokenRequest {
  poolId: string;
  adminWallet: string;
  tokenName?: string;
  tokenSymbol?: string;
}

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

// Admin wallets
const ADMIN_WALLETS = process.env.ADMIN_WALLETS?.split(',') || [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, adminWallet, tokenName, tokenSymbol } = req.body as CreatePoolTokenRequest;

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
    const adminUser = await User.findOne({ wallet: adminWallet });
    const isAdmin = adminUser?.role === 'admin' || ADMIN_WALLETS.includes(adminWallet);
    if (!isAdmin) {
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
        description: `Fractional ownership of authenticated ${assetModel}. Pool ID: ${poolId}`,
        image: assetImage,
        twitter: 'https://twitter.com/LuxHubMarket',
        website: 'https://luxhub.market',
        // Additional metadata
        attributes: [
          { trait_type: 'Pool ID', value: poolId },
          { trait_type: 'Asset Model', value: assetModel },
          { trait_type: 'Total Shares', value: pool.totalShares.toString() },
          { trait_type: 'Share Price USD', value: pool.sharePriceUSD?.toFixed(2) || '0' },
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
    const launchResponse = await fetch(`${BAGS_API_BASE}/token/create-token-launch-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({
        tokenInfoId: tokenInfoResult.id,
        creator: adminWallet,
        totalSupply: pool.totalShares,
        // Initial liquidity configuration (if applicable)
      }),
    });

    if (!launchResponse.ok) {
      const errorData = await launchResponse.json().catch(() => ({}));
      return res.status(500).json({
        error: 'Failed to create token launch transaction via Bags API',
        details: errorData,
      });
    }

    const launchResult = await launchResponse.json();

    // Update pool with Bags token info
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        bagsTokenMint: launchResult.mint || launchResult.tokenMint,
        bagsTokenCreatedAt: new Date(),
        fractionalMint: launchResult.mint || launchResult.tokenMint,
      },
    });

    return res.status(200).json({
      success: true,
      token: {
        name: finalTokenName,
        symbol: finalTokenSymbol,
        mint: launchResult.mint || launchResult.tokenMint,
        tokenInfoId: tokenInfoResult.id,
        totalSupply: pool.totalShares,
      },
      pool: {
        _id: pool._id,
        bagsTokenMint: launchResult.mint || launchResult.tokenMint,
      },
      transaction: launchResult.transaction,
      message: 'Pool share token created via Bags. Transaction ready for signing.',
      nextSteps: [
        'Sign and send the transaction to complete token creation',
        'Pool shares will be represented as SPL tokens',
        'Investors can trade shares on secondary markets',
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
