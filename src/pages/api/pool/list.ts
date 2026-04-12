// src/pages/api/pool/list.ts
// List all pools with optional filtering
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import MintRequest from '../../../lib/models/MintRequest';
// Import models to register schemas for populate()
import '../../../lib/models/Assets';
import '../../../lib/models/Vendor';

interface ListQuery {
  status?: string;
  vendorWallet?: string;
  limit?: string;
  offset?: string;
  includeIncomplete?: string; // "true" to include pools still in setup
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { status, vendorWallet, limit = '50', offset = '0', includeIncomplete } = req.query as ListQuery;

    await dbConnect();

    // Build query
    const query: Record<string, any> = { deleted: { $ne: true } };

    // Hide pools that haven't completed the Bags launch flow.
    // Public/browse pages should only see fully launched pools (tokenStatus = 'minted').
    // Vendor dashboard can pass ?includeIncomplete=true to see their own broken pools.
    if (!includeIncomplete && !vendorWallet) {
      query.tokenStatus = 'minted';
    }

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

    // Fetch pools raw first so we can capture the original selectedAssetId
    // (populate may null it out if the Asset doesn't exist in that collection)
    const rawPools = await Pool.find(query)
      .populate({
        path: 'vendorId',
        select: 'businessName',
      })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    // Collect all unique asset IDs
    const allAssetIds = rawPools.map((p: any) => p.selectedAssetId).filter(Boolean);

    // Look up in both Asset and MintRequest collections in parallel
    const { Asset } = await import('../../../lib/models/Assets');
    const [assets, mintReqs] = await Promise.all([
      Asset.find({ _id: { $in: allAssetIds } }).lean(),
      MintRequest.find({ _id: { $in: allAssetIds } }).lean(),
    ]);

    const assetMap = new Map(assets.map((a: any) => [a._id.toString(), a]));
    const mintReqMap = new Map(mintReqs.map((m: any) => [m._id.toString(), m]));

    // Attach asset data to each pool (prefer Asset collection, fall back to MintRequest)
    const pools = rawPools.map((pool: any) => {
      const assetIdStr = pool.selectedAssetId?.toString();
      if (assetIdStr) {
        const asset = assetMap.get(assetIdStr) as any;
        const mintReq = mintReqMap.get(assetIdStr) as any;
        const source = asset || mintReq;
        if (source) {
          pool.selectedAssetId = {
            _id: source._id,
            model: source.model,
            brand: source.brand,
            priceUSD: source.priceUSD,
            description: source.description,
            serial: source.serial || source.serialNumber,
            imageUrl: source.imageUrl,
            imageIpfsUrls: source.imageIpfsUrls,
            images: source.images,
            arweaveTxId: source.arweaveTxId,
            nftMint: source.mintAddress || source.nftMint,
          };
        }
      }
      return pool;
    });

    // Get total count for pagination
    const total = await Pool.countDocuments(query);

    // Transform pools for frontend
    const transformedPools = pools.map((pool: any) => ({
      _id: pool._id,
      poolNumber: pool.poolNumber || pool._id.toString().slice(-6).toUpperCase(),
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
            imageUrl: pool.selectedAssetId.imageUrl,
            imageIpfsUrls: pool.selectedAssetId.imageIpfsUrls,
            images: pool.selectedAssetId.images,
            arweaveTxId: pool.selectedAssetId.arweaveTxId,
            nftMint: pool.selectedAssetId.nftMint,
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

      // Tokenization (phase 11 fee-funded model)
      tokenStatus: pool.tokenStatus || 'pending',
      vendorPaymentPercent: pool.vendorPaymentPercent,
      fundsInEscrow: pool.fundsInEscrow || 0,
      accumulatedFeesLamports: pool.accumulatedFeesLamports || 0,
      accumulatedFeesLamportsPending: pool.accumulatedFeesLamportsPending || 0,

      // Trading data
      currentBondingPrice: pool.currentBondingPrice,
      lastPriceUSD: pool.lastPriceUSD,
      totalTrades: pool.totalTrades || 0,
      totalVolumeUSD: pool.totalVolumeUSD || 0,
      recentTrades: (pool.recentTrades || []).slice(-5).map((t: any) => ({
        wallet: t.wallet ? `${t.wallet.slice(0, 4)}...${t.wallet.slice(-4)}` : '????',
        type: t.type,
        amount: t.amount,
        amountUSD: t.amountUSD,
        timestamp: t.timestamp,
        txSignature: t.txSignature,
      })),
      graduated: pool.graduated || false,

      // Timestamps
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    }));

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
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
