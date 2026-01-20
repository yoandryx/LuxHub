// src/pages/api/test/setup-data.ts
// Creates test data for marketplace API tests
// IMPORTANT: Only enable in development/testing environments

import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/database/mongodb';
import { Asset } from '@/lib/models/Assets';
import { Vendor } from '@/lib/models/Vendor';
import { User } from '@/lib/models/User';
import { Escrow } from '@/lib/models/Escrow';
import { Pool } from '@/lib/models/Pool';

// Test wallets
const TEST_VENDOR_WALLET = 'VendorTestWallet1111111111111111111111111111';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();

    // Create test user
    let testUser = await User.findOne({ wallet: TEST_VENDOR_WALLET });
    if (!testUser) {
      testUser = await User.create({
        wallet: TEST_VENDOR_WALLET,
        role: 'vendor',
      });
      console.log('Created test user');
    }

    // Create test vendor
    let testVendor = await Vendor.findOne({ user: testUser._id });
    if (!testVendor) {
      testVendor = await Vendor.create({
        user: testUser._id,
        businessName: 'Test Luxury Vendor',
        username: 'test_vendor_' + Date.now().toString().slice(-6),
        verified: true,
      });
      console.log('Created test vendor');
    }

    // Create test asset
    let testAsset = await Asset.findOne({ model: 'Test Rolex Submariner' });
    if (!testAsset) {
      testAsset = await Asset.create({
        vendor: testVendor._id,
        model: 'Test Rolex Submariner',
        serial: 'TEST-' + Date.now().toString().slice(-6),
        priceUSD: 15000,
        status: 'listed', // valid enum: pending, reviewed, listed, pooled, sold, burned
        description: 'Test watch for API testing',
      });
      console.log('Created test asset');
    }

    // Create test escrow (for offer/shipment tests)
    let testEscrow = await Escrow.findOne({ asset: testAsset._id, deleted: { $ne: true } });
    if (!testEscrow) {
      testEscrow = await Escrow.create({
        asset: testAsset._id,
        seller: testVendor._id,
        sellerWallet: TEST_VENDOR_WALLET,
        escrowPda: 'TestEscrowPda' + Date.now().toString(),
        nftMint: 'TestNftMint' + Date.now().toString(),
        saleMode: 'accepting_offers',
        acceptingOffers: true,
        listingPrice: 15000000000, // 15 SOL in lamports
        listingPriceUSD: 15000,
        minimumOffer: 10000000000, // 10 SOL minimum
        minimumOfferUSD: 10000,
        status: 'initiated',
      });
      console.log('Created test escrow');
    }

    // Create test pool
    let testPool = await Pool.findOne({ selectedAssetId: testAsset._id, deleted: { $ne: true } });
    if (!testPool) {
      testPool = await Pool.create({
        selectedAssetId: testAsset._id,
        vendorId: testVendor._id,
        vendorWallet: TEST_VENDOR_WALLET,
        sourceType: 'dealer', // required: dealer, luxhub_owned, escrow_conversion
        targetAmountUSD: 15000,
        totalShares: 100,
        sharesSold: 0,
        sharePriceUSD: 150,
        minBuyInUSD: 150,
        maxInvestors: 50,
        projectedROI: 1.2,
        status: 'open',
        participants: [],
      });
      console.log('Created test pool');
    }

    return res.status(200).json({
      success: true,
      message: 'Test data setup complete',
      data: {
        userId: testUser._id.toString(),
        vendorId: testVendor._id.toString(),
        assetId: testAsset._id.toString(),
        escrowId: testEscrow._id.toString(),
        escrowPda: testEscrow.escrowPda,
        poolId: testPool._id.toString(),
      },
    });
  } catch (error: unknown) {
    console.error('Setup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to setup test data', details: message });
  }
}
