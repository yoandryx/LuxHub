// src/pages/api/pool/create.ts
// Create a new tokenized pool — requires verified vendor with minted asset
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Vendor } from '../../../lib/models/Vendor';
import { Asset } from '../../../lib/models/Assets';
import { withWalletValidation, AuthenticatedRequest } from '@/lib/middleware/walletAuth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = (req as AuthenticatedRequest).wallet;

  try {
    await dbConnect();

    const { assetId, targetAmountUSD, minBuyInUSD, maxInvestors, projectedROI } = req.body;

    // Validation
    if (!assetId || !targetAmountUSD) {
      return res.status(400).json({
        error: 'Missing required fields: assetId, targetAmountUSD',
      });
    }

    // Verify caller is an approved vendor
    const vendor = await Vendor.findOne({ wallet });
    if (!vendor) {
      return res.status(403).json({ error: 'Only registered vendors can create pools' });
    }
    if (vendor.status !== 'approved') {
      return res.status(403).json({ error: 'Vendor must be approved to create pools' });
    }

    // Verify asset exists, is owned by this vendor, and has been minted
    const asset = await Asset.findById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    if (String(asset.vendor) !== String(vendor._id)) {
      return res.status(403).json({ error: 'Asset does not belong to this vendor' });
    }
    if (!asset.nftMint) {
      return res.status(400).json({ error: 'Asset must be minted before creating a pool' });
    }

    // Check if pool already exists for this asset
    const existingPool = await Pool.findOne({
      selectedAssetId: assetId,
      status: { $ne: 'closed' },
    });
    if (existingPool) {
      return res.status(409).json({
        error: 'Pool already exists for this asset',
        poolId: existingPool._id,
      });
    }

    // Generate pool number
    const poolCount = await Pool.countDocuments();
    const poolNumber = `LUX-${(poolCount + 1).toString().padStart(5, '0')}`;

    // 1B supply (Bags platform standard)
    const BAGS_TOTAL_SUPPLY = 1_000_000_000;
    const calculatedSharePrice = targetAmountUSD / BAGS_TOTAL_SUPPLY;

    // Create pool
    const pool = new Pool({
      poolNumber,
      selectedAssetId: assetId,
      vendorId: vendor._id,
      vendorWallet: wallet,
      sourceType: 'dealer',
      targetAmountUSD,
      totalShares: BAGS_TOTAL_SUPPLY,
      sharePriceUSD: calculatedSharePrice,
      minBuyInUSD: minBuyInUSD || 1.5,
      maxInvestors: maxInvestors || 10000,
      projectedROI: projectedROI || 1.2,
      status: 'open',
      sharesSold: 0,
      participants: [],
      liquidityModel: 'amm',
      ammEnabled: true,
      ammLiquidityPercent: 30,
      bondingCurveActive: true,
      bondingCurveType: 'exponential',
      initialBondingPrice: calculatedSharePrice,
      currentBondingPrice: calculatedSharePrice,
      reserveBalance: 0,
      tokensMinted: 0,
      tokensCirculating: 0,
      watchVerificationStatus: 'verified',
    });

    await pool.save();

    console.log('[POOL-CREATE] Pool created:', poolNumber, 'by vendor:', wallet);

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
    console.error('[POOL-CREATE] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to create pool' });
  }
}

export default withWalletValidation(handler);
