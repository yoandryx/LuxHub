// src/pages/api/pool/buy-resale.ts
// Purchase a pool asset that is listed for resale
// Marks pool as sold and triggers distribution flow
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { Transaction } from '../../../lib/models/Transaction';
import { verifyTransactionForWallet } from '../../../lib/services/txVerification';

interface BuyResaleRequest {
  poolId: string;
  buyerWallet: string;
  txSignature: string; // On-chain payment transaction signature
  paidPriceUSD: number;
  paidPriceLamports?: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { poolId, buyerWallet, txSignature, paidPriceUSD, paidPriceLamports } =
      req.body as BuyResaleRequest;

    if (!poolId || !buyerWallet || !txSignature || !paidPriceUSD) {
      return res.status(400).json({
        error: 'Missing required fields: poolId, buyerWallet, txSignature, paidPriceUSD',
      });
    }

    await dbConnect();

    const pool = await Pool.findById(poolId).populate('selectedAssetId');
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Must be listed for resale
    if (pool.status !== 'listed') {
      return res.status(400).json({
        error: `Pool must be in 'listed' status to purchase. Current: ${pool.status}`,
      });
    }

    // Verify on-chain payment
    const txResult = await verifyTransactionForWallet(txSignature, buyerWallet);
    if (!txResult.verified) {
      return res.status(400).json({
        error: 'Transaction verification failed',
        details: txResult.error,
        message: 'On-chain payment could not be verified.',
      });
    }

    // Verify price meets listing minimum
    if (paidPriceUSD < pool.resaleListingPriceUSD) {
      return res.status(400).json({
        error: `Payment ($${paidPriceUSD}) is below listing price ($${pool.resaleListingPriceUSD})`,
      });
    }

    // Calculate distribution preview
    const royaltyAmount = paidPriceUSD * 0.03;
    const distributionPool = paidPriceUSD * 0.97;
    const totalInvested = pool.targetAmountUSD || 0;
    const profit = distributionPool - totalInvested;
    const roi = totalInvested > 0 ? (distributionPool / totalInvested - 1) * 100 : 0;

    // Update pool to sold status
    await Pool.findByIdAndUpdate(poolId, {
      $set: {
        status: 'sold',
        resaleSoldPriceUSD: paidPriceUSD,
        resaleSoldPrice: paidPriceLamports || 0,
        resaleSoldAt: new Date(),
        resaleBuyerWallet: buyerWallet,
        resaleTxSignature: txSignature,
        distributionStatus: 'pending',
      },
    });

    // Record the transaction
    try {
      await Transaction.create({
        type: 'pool_resale',
        from: pool.vendorWallet || 'luxhub_custody',
        to: buyerWallet,
        amount: paidPriceLamports || 0,
        amountUSD: paidPriceUSD,
        txSignature,
        nftMint: pool.fractionalMint || pool.bagsTokenMint,
        status: 'confirmed',
        poolId: pool._id,
        metadata: {
          poolNumber: pool._id.toString().slice(-6).toUpperCase(),
          asset: (pool.selectedAssetId as any)?.model || 'Unknown',
          listingPrice: pool.resaleListingPriceUSD,
          salePrice: paidPriceUSD,
        },
      });
    } catch (txErr) {
      console.warn('[buy-resale] Transaction record failed:', txErr);
    }

    return res.status(200).json({
      success: true,
      sale: {
        poolId: pool._id,
        buyerWallet,
        paidPriceUSD,
        txSignature,
        soldAt: new Date(),
      },
      distributionPreview: {
        resalePrice: paidPriceUSD,
        royaltyAmount,
        royaltyPercent: '3%',
        distributionPool,
        distributionPercent: '97%',
        totalInvested,
        profit,
        roi: `${roi.toFixed(2)}%`,
      },
      pool: {
        _id: pool._id,
        status: 'sold',
        distributionStatus: 'pending',
      },
      message: 'Pool asset purchased. Distribution to investors is now pending.',
      nextSteps: [
        '1. Admin initiates distribution via POST /api/pool/distribute',
        '2. Squads multisig members approve distribution',
        '3. Investors receive their pro-rata share of proceeds',
        '4. LuxHub treasury receives 3% royalty',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/buy-resale] Error:', error);
    return res.status(500).json({
      error: 'Failed to process resale purchase',
      details: error?.message || 'Unknown error',
    });
  }
}
