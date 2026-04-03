// src/pages/api/pool/create.ts
// Create a new tokenized pool — requires verified vendor with minted asset
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import VendorProfile from '../../../lib/models/VendorProfile';
import { Asset } from '../../../lib/models/Assets';
import MintRequest from '../../../lib/models/MintRequest';
import { Escrow } from '../../../lib/models/Escrow';
import { createPoolTokenInternal } from '../bags/create-pool-token';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.headers['x-wallet-address'] as string || req.body?.wallet;

  if (!wallet) {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  try {
    await dbConnect();

    const { assetId, targetAmountUSD, minBuyInUSD, maxInvestors, projectedROI } = req.body;

    // Validation
    if (!assetId || !targetAmountUSD) {
      return res.status(400).json({
        error: 'Missing required fields: assetId, targetAmountUSD',
      });
    }

    // Verify caller is an approved vendor (VendorProfile has wallet + approved fields)
    const vendorProfile = await VendorProfile.findOne({ wallet });
    if (!vendorProfile) {
      return res.status(403).json({ error: 'Only registered vendors can create pools' });
    }
    if (!vendorProfile.approved) {
      return res.status(403).json({ error: 'Vendor must be approved to create pools' });
    }

    // Verify asset exists, is owned by this vendor, and has been minted
    // Check both Asset and MintRequest collections (vendor flow uses MintRequest)
    let asset = await Asset.findById(assetId);
    let assetSource: 'asset' | 'mintRequest' = 'asset';

    if (!asset) {
      // Fallback: check MintRequest (vendor mint flow creates these)
      const mintReq = await MintRequest.findById(assetId);
      if (mintReq && mintReq.status === 'minted' && mintReq.mintAddress) {
        asset = {
          _id: mintReq._id,
          title: mintReq.title || `${mintReq.brand} ${mintReq.model}`,
          brand: mintReq.brand,
          model: mintReq.model,
          nftMint: mintReq.mintAddress,
          nftOwnerWallet: mintReq.wallet,
          priceUSD: mintReq.priceUSD,
          imageUrl: mintReq.imageUrl,
          pooled: mintReq.pooled,
        };
        assetSource = 'mintRequest';
      }
    }

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found in Asset or MintRequest collections' });
    }
    // Check ownership
    if (asset.nftOwnerWallet && asset.nftOwnerWallet !== wallet) {
      return res.status(403).json({ error: 'Asset does not belong to this vendor' });
    }
    if (!asset.nftMint) {
      return res.status(400).json({ error: 'Asset must be minted before creating a pool' });
    }

    // Check if pool already exists for this asset
    const existingPool = await Pool.findOne({
      selectedAssetId: assetId,
      status: { $nin: ['closed', 'canceled', 'dead', 'burned'] },
    });
    if (existingPool) {
      // If pool exists but has no Bags token (failed during creation), clean it up and allow retry
      if (!existingPool.bagsTokenMint && existingPool.status === 'open') {
        console.log(`[POOL-CREATE] Cleaning up orphan pool ${existingPool._id} (no token) for retry`);
        await Pool.findByIdAndDelete(existingPool._id);
        // Also unmark the asset as pooled
        if (assetSource === 'mintRequest') {
          await MintRequest.findByIdAndUpdate(assetId, { $set: { pooled: false, poolId: null } });
        } else {
          await Asset.findByIdAndUpdate(assetId, { $set: { pooled: false, poolId: null, status: 'listed' } });
        }
      } else {
        return res.status(409).json({
          error: 'Pool already exists for this asset',
          poolId: existingPool._id,
          bagsTokenMint: existingPool.bagsTokenMint,
        });
      }
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
      vendorId: vendorProfile._id,
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

    // D-03: Remove marketplace listing when pool is created
    if (assetSource === 'mintRequest') {
      await MintRequest.findByIdAndUpdate(assetId, {
        $set: { pooled: true, poolId: pool._id },
      });
    } else {
      asset.status = 'pooled';
      asset.poolId = pool._id;
      asset.pooled = true;
      await asset.save();
    }

    // Update escrow if one exists for this asset
    await Escrow.updateMany(
      { asset: assetId, status: { $in: ['initiated', 'listed'] } },
      { $set: { convertedToPool: true, poolId: pool._id, status: 'converted' } }
    );

    // ── Auto-mint Bags bonding curve token ──
    // Non-blocking: pool is created even if Bags API fails
    let tokenResult: { success: boolean; mint?: string; transaction?: string; error?: string } = {
      success: false,
      error: 'Not attempted',
    };

    try {
      tokenResult = await createPoolTokenInternal(pool._id.toString(), wallet);
      if (!tokenResult.success) {
        // Bags token mint failed, pool still created
      }
    } catch (tokenErr: any) {
      tokenResult = { success: false, error: tokenErr.message };
    }

    // Reload pool to include token data
    const updatedPool = await Pool.findById(pool._id);

    return res.status(201).json({
      success: true,
      pool: {
        _id: updatedPool?._id || pool._id,
        poolNumber: updatedPool?.poolNumber || pool.poolNumber,
        asset: assetId,
        targetAmountUSD: updatedPool?.targetAmountUSD || pool.targetAmountUSD,
        totalShares: updatedPool?.totalShares || pool.totalShares,
        sharePriceUSD: updatedPool?.sharePriceUSD || pool.sharePriceUSD,
        status: updatedPool?.status || pool.status,
        bondingCurveActive: updatedPool?.bondingCurveActive ?? pool.bondingCurveActive,
        bondingCurveType: updatedPool?.bondingCurveType || pool.bondingCurveType,
        liquidityModel: updatedPool?.liquidityModel || pool.liquidityModel,
        ammEnabled: updatedPool?.ammEnabled ?? pool.ammEnabled,
        // Token info (auto-minted)
        bagsTokenMint: updatedPool?.bagsTokenMint || null,
        tokenStatus: updatedPool?.tokenStatus || 'pending',
      },
      token: tokenResult.success
        ? {
            mint: tokenResult.mint,
            transaction: tokenResult.transaction,
            message: 'Token created on Bags bonding curve. Transaction needs signing to finalize.',
          }
        : {
            minted: false,
            error: tokenResult.error,
            message:
              'Pool created but token mint failed. Admin can retry via /api/bags/create-pool-token.',
          },
    });
  } catch (error: any) {
    console.error('[POOL-CREATE] Error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to create pool' });
  }
}

export default handler;
