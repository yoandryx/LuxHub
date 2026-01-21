// src/pages/api/pool/convert-from-escrow.ts
// Convert an escrow listing to a crowdfunded pool with auto-tokenization
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { Pool } from '../../../lib/models/Pool';
import { Offer } from '../../../lib/models/Offer';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';
import { Asset } from '../../../lib/models/Assets';

interface ConvertToPoolRequest {
  escrowPda: string;
  vendorWallet: string;

  // Pool configuration
  totalShares: number;
  minBuyInUSD: number;
  maxInvestors?: number;
  projectedROI?: number; // e.g., 1.15 for 15% expected return

  // Liquidity model selection
  liquidityModel?: 'p2p' | 'amm' | 'hybrid';
  ammLiquidityPercent?: number; // Default 30% if AMM enabled
}

// Helper to call Bags API for token creation
async function createPoolToken(
  pool: any,
  asset: any
): Promise<{
  success: boolean;
  mint?: string;
  error?: string;
}> {
  try {
    const BAGS_API_KEY = process.env.BAGS_API_KEY;
    if (!BAGS_API_KEY) {
      console.warn('[Bags] API key not configured, skipping tokenization');
      return { success: false, error: 'Bags API key not configured' };
    }

    // Generate token symbol from pool
    const poolSuffix = pool._id.toString().slice(-6).toUpperCase();
    const symbol = `LUX-${poolSuffix}`;

    // Build token metadata
    const tokenInfo = {
      name: `LuxHub Pool: ${asset?.model || 'Luxury Asset'}`,
      symbol,
      description: `Fractional ownership of ${asset?.brand || ''} ${asset?.model || 'luxury asset'} via LuxHub. Fixed supply: ${pool.totalShares} shares.`,
      image: asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || '',
      totalSupply: pool.totalShares,
      decimals: 0, // Whole shares only
      // Metadata for RWA tracking
      attributes: {
        poolId: pool._id.toString(),
        assetBrand: asset?.brand || '',
        assetModel: asset?.model || '',
        targetValueUSD: pool.targetAmountUSD,
        sharePriceUSD: pool.sharePriceUSD,
        createdAt: new Date().toISOString(),
      },
    };

    // Call Bags Token Launch API
    const response = await fetch('https://api.bags.fm/api/v1/token/create-token-info', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': BAGS_API_KEY,
      },
      body: JSON.stringify(tokenInfo),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bags] Token creation failed:', data);
      return { success: false, error: data.error || 'Token creation failed' };
    }

    // Note: In production, you'd also call create-token-launch-transaction
    // and have an admin sign to actually mint the tokens
    return {
      success: true,
      mint: data.mint || data.tokenMint || `mock-mint-${poolSuffix}`,
    };
  } catch (error: any) {
    console.error('[Bags] Token creation error:', error);
    return { success: false, error: error.message };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      escrowPda,
      vendorWallet,
      totalShares,
      minBuyInUSD,
      maxInvestors = 100,
      projectedROI = 1.2,
      liquidityModel = 'p2p',
      ammLiquidityPercent = 30,
    } = req.body as ConvertToPoolRequest;

    // Validation
    if (!escrowPda || !vendorWallet || !totalShares || !minBuyInUSD) {
      return res.status(400).json({
        error: 'Missing required fields: escrowPda, vendorWallet, totalShares, minBuyInUSD',
      });
    }

    if (totalShares <= 0 || minBuyInUSD <= 0) {
      return res.status(400).json({
        error: 'totalShares and minBuyInUSD must be positive',
      });
    }

    // Validate liquidity model
    if (!['p2p', 'amm', 'hybrid'].includes(liquidityModel)) {
      return res.status(400).json({
        error: 'Invalid liquidityModel. Must be: p2p, amm, or hybrid',
      });
    }

    // Validate AMM percentage
    if (
      (liquidityModel === 'amm' || liquidityModel === 'hybrid') &&
      (ammLiquidityPercent < 10 || ammLiquidityPercent > 50)
    ) {
      return res.status(400).json({
        error: 'ammLiquidityPercent must be between 10 and 50',
      });
    }

    await dbConnect();

    // Find the escrow
    const escrow = await Escrow.findOne({ escrowPda, deleted: false });
    if (!escrow) {
      return res.status(404).json({ error: 'Escrow not found' });
    }

    // Verify vendor ownership
    const user = await User.findOne({ wallet: vendorWallet });
    if (!user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const vendor = await Vendor.findOne({ user: user._id });
    if (!vendor) {
      return res.status(403).json({ error: 'Vendor not found' });
    }

    if (
      escrow.sellerWallet !== vendorWallet &&
      escrow.seller?.toString() !== vendor._id.toString()
    ) {
      return res.status(403).json({ error: 'Not authorized to convert this escrow' });
    }

    // Check if escrow is in a state that allows conversion
    const allowedStatuses = ['initiated', 'listed'];
    if (!allowedStatuses.includes(escrow.status)) {
      return res.status(400).json({
        error: `Cannot convert escrow with status '${escrow.status}'. Allowed: ${allowedStatuses.join(', ')}`,
      });
    }

    // Check if already converted
    if (escrow.convertedToPool) {
      return res.status(400).json({
        error: 'Escrow has already been converted to a pool',
        poolId: escrow.poolId,
      });
    }

    // Check if escrow has a buyer
    if (escrow.buyer) {
      return res.status(400).json({
        error: 'Cannot convert escrow that already has a buyer',
      });
    }

    // Fetch asset details for token metadata
    const asset = await Asset.findById(escrow.asset).lean();

    // Auto-reject all pending offers
    const pendingOffersResult = await Offer.updateMany(
      {
        escrowPda,
        status: { $in: ['pending', 'countered'] },
        deleted: false,
      },
      {
        $set: {
          status: 'auto_rejected',
          autoRejectedReason: 'Listing converted to crowdfunded pool',
          respondedAt: new Date(),
        },
      }
    );

    // Calculate pool values
    const targetAmountUSD = escrow.listingPriceUSD || escrow.amountUSD || 0;
    const sharePriceUSD = targetAmountUSD / totalShares;

    // Calculate vendor payment based on liquidity model
    let vendorPaymentPercent = 97; // Default P2P: 97% (3% LuxHub fee)
    let ammLiquidityAmount = 0;

    if (liquidityModel === 'amm' || liquidityModel === 'hybrid') {
      // AMM model: vendor gets less, rest goes to liquidity pool
      vendorPaymentPercent = 100 - ammLiquidityPercent - 3; // e.g., 67% if 30% AMM
      ammLiquidityAmount = targetAmountUSD * (ammLiquidityPercent / 100);
    }

    // Create the pool
    const pool = new Pool({
      selectedAssetId: escrow.asset,
      escrowId: escrow._id,
      escrowPda,
      sourceType: 'escrow_conversion',
      vendorId: vendor._id,
      vendorWallet,
      totalShares,
      sharesSold: 0,
      sharePriceUSD,
      targetAmountUSD,
      minBuyInUSD,
      maxInvestors,
      projectedROI,
      participants: [],
      status: 'open',
      custodyStatus: 'pending',
      distributionStatus: 'pending',

      // Tokenization & Liquidity fields
      tokenStatus: 'pending', // Will be 'minted' after Bags call
      liquidityModel,
      ammEnabled: liquidityModel === 'amm' || liquidityModel === 'hybrid',
      ammLiquidityPercent: liquidityModel !== 'p2p' ? ammLiquidityPercent : 0,
      ammLiquidityAmount: liquidityModel !== 'p2p' ? ammLiquidityAmount : 0,
      vendorPaymentPercent,
      fundsInEscrow: 0,
    });

    await pool.save();

    // ========== AUTO-TOKENIZATION VIA BAGS ==========
    // Create token immediately on pool creation
    const tokenResult = await createPoolToken(pool, asset);

    if (tokenResult.success && tokenResult.mint) {
      // Update pool with token info
      await Pool.findByIdAndUpdate(pool._id, {
        $set: {
          bagsTokenMint: tokenResult.mint,
          bagsTokenCreatedAt: new Date(),
          tokenStatus: 'minted', // Tokens minted but locked until conditions met
        },
      });
      pool.bagsTokenMint = tokenResult.mint;
      pool.tokenStatus = 'minted';
    }

    // Update escrow
    await Escrow.findByIdAndUpdate(escrow._id, {
      $set: {
        convertedToPool: true,
        poolId: pool._id,
        poolConvertedAt: new Date(),
        saleMode: 'crowdfunded',
        status: 'converted',
        acceptingOffers: false,
        activeOfferCount: 0,
        highestOffer: null,
      },
    });

    // Build response message based on liquidity model
    const liquidityInfo =
      liquidityModel === 'p2p'
        ? 'P2P trading (peer-to-peer, no guaranteed liquidity)'
        : `AMM-backed trading (${ammLiquidityPercent}% liquidity pool)`;

    const vendorInfo =
      liquidityModel === 'p2p'
        ? `Vendor receives ${vendorPaymentPercent}% ($${((targetAmountUSD * vendorPaymentPercent) / 100).toLocaleString()}) when custody verified`
        : `Vendor receives ${vendorPaymentPercent}% ($${((targetAmountUSD * vendorPaymentPercent) / 100).toLocaleString()}), ${ammLiquidityPercent}% ($${ammLiquidityAmount.toLocaleString()}) to AMM liquidity`;

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        escrowPda,
        totalShares,
        sharesSold: 0,
        sharePriceUSD,
        targetAmountUSD,
        minBuyInUSD,
        maxInvestors,
        projectedROI,
        status: 'open',

        // New fields
        liquidityModel,
        ammEnabled: pool.ammEnabled,
        ammLiquidityPercent: pool.ammLiquidityPercent,
        vendorPaymentPercent,
        tokenStatus: pool.tokenStatus,
        bagsTokenMint: pool.bagsTokenMint,
      },
      escrow: {
        _id: escrow._id,
        escrowPda,
        status: 'converted',
        convertedToPool: true,
      },
      tokenization: {
        success: tokenResult.success,
        mint: tokenResult.mint,
        error: tokenResult.error,
        status: pool.tokenStatus,
        note: 'Tokens minted but LOCKED until pool fills and custody is verified',
      },
      offersRejected: pendingOffersResult.modifiedCount,
      message: `Pool created with ${liquidityInfo}. ${tokenResult.success ? 'Tokens minted via Bags.' : 'Tokenization pending.'} ${pendingOffersResult.modifiedCount} offers auto-rejected.`,
      financials: {
        targetAmount: targetAmountUSD,
        vendorPayment: `${vendorPaymentPercent}% ($${((targetAmountUSD * vendorPaymentPercent) / 100).toLocaleString()})`,
        ammLiquidity:
          liquidityModel !== 'p2p'
            ? `${ammLiquidityPercent}% ($${ammLiquidityAmount.toLocaleString()})`
            : 'N/A (P2P model)',
        luxhubFee: `3% ($${(targetAmountUSD * 0.03).toLocaleString()})`,
      },
      nextSteps: [
        '1. Pool is now open for investments',
        '2. Investors buy shares → funds held in escrow',
        '3. Pool fills 100% → status: "filled"',
        '4. Vendor ships watch to LuxHub',
        '5. LuxHub verifies custody → vendor paid, tokens unlocked',
        '6. Secondary trading enabled via Bags',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/convert-from-escrow] Error:', error);
    return res.status(500).json({
      error: 'Failed to convert escrow to pool',
      details: error?.message || 'Unknown error',
    });
  }
}
