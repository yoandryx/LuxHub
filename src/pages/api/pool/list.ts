// src/pages/api/pool/list.ts
// List all pools with optional filtering
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
// Import models to register schemas for populate()
import '../../../lib/models/Assets';
import '../../../lib/models/Vendor';

interface ListQuery {
  status?: string;
  vendorWallet?: string;
  limit?: string;
  offset?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { status, vendorWallet, limit = '50', offset = '0' } = req.query as ListQuery;

    await dbConnect();

    // Build query
    const query: Record<string, any> = { deleted: { $ne: true } };

    if (status) {
      // Support comma-separated status values
      const statuses = status.split(',').map((s) => s.trim());
      if (statuses.length === 1) {
        query.status = statuses[0];
      } else {
        query.status = { $in: statuses };
      }
    }

    if (vendorWallet) {
      query.vendorWallet = vendorWallet;
    }

    // Fetch pools with populated asset and vendor info
    const pools = await Pool.find(query)
      .populate({
        path: 'selectedAssetId',
        select: 'model brand priceUSD imageIpfsUrls images description serial',
      })
      .populate({
        path: 'vendorId',
        select: 'businessName',
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await Pool.countDocuments(query);

    // Transform pools for frontend
    const transformedPools = pools.map((pool: any) => ({
      _id: pool._id,
      poolNumber: pool._id.toString().slice(-6).toUpperCase(),
      escrowPda: pool.escrowPda,

      // Asset info
      asset: pool.selectedAssetId
        ? {
            _id: pool.selectedAssetId._id,
            model: pool.selectedAssetId.model,
            brand: pool.selectedAssetId.brand,
            priceUSD: pool.selectedAssetId.priceUSD,
            description: pool.selectedAssetId.description,
            serial: pool.selectedAssetId.serial,
            imageIpfsUrls: pool.selectedAssetId.imageIpfsUrls,
            images: pool.selectedAssetId.images,
          }
        : null,

      // Vendor info
      vendor: pool.vendorId
        ? {
            _id: pool.vendorId._id,
            businessName: pool.vendorId.businessName,
          }
        : null,
      vendorWallet: pool.vendorWallet,

      // Pool configuration
      totalShares: pool.totalShares,
      sharesSold: pool.sharesSold,
      sharePriceUSD: pool.sharePriceUSD,
      targetAmountUSD: pool.targetAmountUSD,
      minBuyInUSD: pool.minBuyInUSD,
      maxInvestors: pool.maxInvestors,
      projectedROI: pool.projectedROI,

      // Status
      status: pool.status,
      custodyStatus: pool.custodyStatus,

      // Resale info
      resaleListingPriceUSD: pool.resaleListingPriceUSD,

      // Participants summary
      participants: pool.participants?.map((p: any) => ({
        wallet: p.wallet,
        shares: p.shares,
        ownershipPercent: p.ownershipPercent,
        investedUSD: p.investedUSD,
      })),

      // Bags integration
      bagsTokenMint: pool.bagsTokenMint,
      bagsFeeShareConfigId: pool.bagsFeeShareConfigId,

      // Tokenization & Liquidity
      tokenStatus: pool.tokenStatus || 'pending',
      liquidityModel: pool.liquidityModel || 'p2p',
      ammEnabled: pool.ammEnabled || false,
      ammLiquidityPercent: pool.ammLiquidityPercent,
      vendorPaymentPercent: pool.vendorPaymentPercent,
      fundsInEscrow: pool.fundsInEscrow || 0,

      // Timestamps
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      pools: transformedPools,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + pools.length < total,
      },
    });
  } catch (error: any) {
    console.error('[/api/pool/list] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch pools',
      details: error?.message || 'Unknown error',
    });
  }
}
