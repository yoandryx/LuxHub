// src/pages/api/pool/[id].ts
// Fetch a single pool by ID
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import MintRequest from '../../../lib/models/MintRequest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid pool ID' });
    }

    await dbConnect();

    // Fetch pool raw first so we keep the original selectedAssetId reference
    const poolDoc = await Pool.findOne({ _id: id, deleted: { $ne: true } })
      .populate({
        path: 'vendorId',
        select: 'businessName username verified wallet',
      })
      .populate({
        path: 'escrowId',
        select: 'escrowPda status',
      })
      .populate({
        path: 'participants.user',
        select: 'wallet username',
      })
      .lean();

    if (!poolDoc) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    const pool = poolDoc as any;

    // Look up asset in Asset first, MintRequest as fallback
    if (pool.selectedAssetId) {
      const assetIdStr = pool.selectedAssetId.toString();
      const { Asset } = await import('../../../lib/models/Assets');
      const [assetDoc, mintReq] = await Promise.all([
        Asset.findById(assetIdStr).lean() as any,
        MintRequest.findById(assetIdStr).lean() as any,
      ]);
      const source = assetDoc || mintReq;
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
          category: source.category,
          nftMint: source.mintAddress || source.nftMint,
        };
      }
    }

    // Calculate funding progress
    const fundingProgress = pool.totalShares > 0 ? (pool.sharesSold / pool.totalShares) * 100 : 0;

    // Calculate time remaining (if pool has expiration)
    const daysRemaining = pool.expiresAt
      ? Math.max(
          0,
          Math.ceil((new Date(pool.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        )
      : null;

    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');
    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        // Asset
        asset: pool.selectedAssetId,
        // Pool configuration
        status: pool.status,
        sourceType: pool.sourceType,
        totalShares: pool.totalShares,
        sharesSold: pool.sharesSold,
        sharePriceUSD: pool.sharePriceUSD,
        targetAmountUSD: pool.targetAmountUSD,
        minBuyInUSD: pool.minBuyInUSD,
        maxInvestors: pool.maxInvestors,
        projectedROI: pool.projectedROI,
        fundingProgress,
        daysRemaining,
        // Escrow link
        escrow: pool.escrowId,
        escrowPda: pool.escrowPda,
        // Vendor
        vendor: pool.vendorId,
        vendorWallet: pool.vendorWallet,
        vendorPaidAmount: pool.vendorPaidAmount,
        vendorPaidAt: pool.vendorPaidAt,
        // Participants
        participants: pool.participants?.map((p: any) => ({
          wallet: p.wallet,
          username: p.user?.username,
          shares: p.shares,
          ownershipPercent: p.ownershipPercent,
          investedUSD: p.investedUSD,
          projectedReturnUSD: p.projectedReturnUSD,
          investedAt: p.investedAt,
        })),
        investorCount: pool.participants?.length || 0,
        // Custody
        custodyStatus: pool.custodyStatus,
        custodyTrackingCarrier: pool.custodyTrackingCarrier,
        custodyTrackingNumber: pool.custodyTrackingNumber,
        custodyProofUrls: pool.custodyProofUrls,
        custodyReceivedAt: pool.custodyReceivedAt,
        // Resale
        resaleListingPriceUSD: pool.resaleListingPriceUSD,
        resaleListedAt: pool.resaleListedAt,
        resaleSoldPriceUSD: pool.resaleSoldPriceUSD,
        resaleSoldAt: pool.resaleSoldAt,
        // Distribution
        distributionStatus: pool.distributionStatus,
        distributionAmount: pool.distributionAmount,
        distributionRoyalty: pool.distributionRoyalty,
        distributions: pool.distributions,
        // Bags API / Token info
        poolNumber: pool.poolNumber,
        bagsTokenMint: pool.bagsTokenMint,
        bagsTokenName: pool.bagsTokenName,
        bagsTokenSymbol: pool.bagsTokenSymbol,
        bagsTokenMetadataUrl: pool.bagsTokenMetadataUrl,
        bagsTokenStatus: pool.bagsTokenStatus,
        meteoraConfigKey: pool.meteoraConfigKey,
        bondingCurveActive: pool.bondingCurveActive,
        graduated: pool.graduated,
        tokenStatus: pool.tokenStatus,
        currentBondingPrice: pool.currentBondingPrice,
        lastPriceUSD: pool.lastPriceUSD,
        claimWindowExpiresAt: pool.claimWindowExpiresAt,
        // Phase 11: fee-funded rewire
        fundingTargetUsdc: pool.fundingTargetUsdc,
        fundingTargetUsdcSource: pool.fundingTargetUsdcSource,
        accumulatedFeesLamports: pool.accumulatedFeesLamports,
        accumulatedFeesLamportsPending: pool.accumulatedFeesLamportsPending,
        lastFeeClaimAt: pool.lastFeeClaimAt,
        lifecycleMemos: pool.lifecycleMemos,
        backingEscrowPda: pool.backingEscrowPda,
        custodyVaultPda: pool.custodyVaultPda,
        // Timestamps
        createdAt: pool.createdAt,
        updatedAt: pool.updatedAt,
      },
    });
  } catch (error: any) {
    console.error('[/api/pool/[id]] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch pool',
      details: error?.message || 'Unknown error',
    });
  }
}
