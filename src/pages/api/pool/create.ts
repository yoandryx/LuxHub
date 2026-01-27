// src/pages/api/pool/create.ts
// Create a new fractional ownership pool
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Vendor } from '../../../lib/models/Vendor';
import { Asset } from '../../../lib/models/Assets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const {
      assetId,
      vendorWallet,
      targetAmountUSD,
      totalShares,
      sharePriceUSD,
      minBuyInUSD,
      maxInvestors,
      projectedROI,
      tokenName,
      tokenSymbol,
      // Bonding curve options
      liquidityModel,
      ammEnabled,
      ammLiquidityPercent,
      bondingCurveType,
    } = req.body;

    // Validation
    if (!assetId || !vendorWallet || !targetAmountUSD || !totalShares || !sharePriceUSD) {
      return res.status(400).json({
        error:
          'Missing required fields: assetId, vendorWallet, targetAmountUSD, totalShares, sharePriceUSD',
      });
    }

    // Verify asset exists
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Get vendor
    const vendor = await Vendor.findOne({ wallet: vendorWallet });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    // Check if pool already exists for this asset
    const existingPool = await Pool.findOne({ asset: assetId, status: { $ne: 'closed' } });
    if (existingPool) {
      return res.status(409).json({
        error: 'Pool already exists for this asset',
        poolId: existingPool._id,
      });
    }

    // Generate pool number
    const poolCount = await Pool.countDocuments();
    const poolNumber = `LUX-${(poolCount + 1).toString().padStart(5, '0')}`;

    // Create pool
    const pool = new Pool({
      poolNumber,
      asset: assetId,
      vendor: vendor._id,
      vendorWallet,
      targetAmountUSD,
      totalShares,
      sharePriceUSD,
      minBuyInUSD: minBuyInUSD || sharePriceUSD,
      maxInvestors: maxInvestors || 100,
      projectedROI: projectedROI || 1.2,
      status: 'open',
      sharesSold: 0,
      participants: [],
      // Token fields
      tokenName: tokenName || `${asset.brand || 'LuxHub'} Pool Token`,
      tokenSymbol: tokenSymbol || 'LPT',
      // Bonding curve configuration
      liquidityModel: liquidityModel || 'amm',
      ammEnabled: ammEnabled !== false,
      ammLiquidityPercent: ammLiquidityPercent || 80,
      bondingCurveActive: true,
      bondingCurveType: bondingCurveType || 'exponential',
      currentBondingPrice: sharePriceUSD,
      reserveBalance: 0,
      tokensMinted: 0,
      tokensCirculating: 0,
    });

    await pool.save();

    return res.status(201).json({
      success: true,
      pool: {
        _id: pool._id,
        poolNumber: pool.poolNumber,
        asset: assetId,
        targetAmountUSD: pool.targetAmountUSD,
        totalShares: pool.totalShares,
        sharePriceUSD: pool.sharePriceUSD,
        status: pool.status,
        bondingCurveActive: pool.bondingCurveActive,
        bondingCurveType: pool.bondingCurveType,
        liquidityModel: pool.liquidityModel,
        ammEnabled: pool.ammEnabled,
      },
    });
  } catch (error: any) {
    console.error('Create pool error:', error);
    return res.status(500).json({ error: error.message || 'Failed to create pool' });
  }
}
