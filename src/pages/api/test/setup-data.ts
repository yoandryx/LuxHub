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
const TEST_VENDOR_WALLET_2 = 'VendorTestWallet2222222222222222222222222222';

// Mock watch data with new images
const MOCK_WATCHES = [
  {
    model: 'Rolex Daytona Rainbow',
    brand: 'Rolex',
    description:
      'The iconic Rolex Cosmograph Daytona "Rainbow" ref. 116595RBOW features a stunning bezel set with 36 rainbow-colored sapphires. Rose gold case with black dial.',
    priceUSD: 450000,
    imageUrl: '/images/rolex-daytona-rainbow.jpg',
    serial: 'RDR-2024-001',
  },
  {
    model: 'Richard Mille RM 027',
    brand: 'Richard Mille',
    description:
      'The RM 027 Tourbillon Rafael Nadal - an ultra-lightweight manual winding tourbillon movement. Carbon TPT case weighing under 20 grams.',
    priceUSD: 850000,
    imageUrl: '/images/rm-027.jpg',
    serial: 'RM27-2024-001',
  },
  {
    model: 'Audemars Piguet Royal Oak Offshore',
    brand: 'Audemars Piguet',
    description:
      'The Royal Oak Offshore Chronograph in stainless steel with black ceramic bezel. 44mm case with Grande Tapisserie dial pattern.',
    priceUSD: 35000,
    imageUrl: '/images/ap-offshore.jpg',
    serial: 'AP-ROO-2024-001',
  },
  {
    model: 'Cartier Crash',
    brand: 'Cartier',
    description:
      'The legendary Cartier Crash - a surrealist masterpiece inspired by a Salvador Dalí painting. 18k yellow gold case with asymmetrical design.',
    priceUSD: 175000,
    imageUrl: '/images/cartier-crash.jpg',
    serial: 'CC-2024-001',
  },
];

// Pool configurations to showcase different states
const POOL_CONFIGS = [
  {
    // Open pool with P2P liquidity - accepting investments
    watchIndex: 0,
    status: 'open',
    tokenStatus: 'minted',
    liquidityModel: 'p2p',
    ammEnabled: false,
    sharesSoldPercent: 35,
    projectedROI: 1.25,
  },
  {
    // Open pool with AMM liquidity - partially filled
    watchIndex: 1,
    status: 'open',
    tokenStatus: 'minted',
    liquidityModel: 'amm',
    ammEnabled: true,
    ammLiquidityPercent: 30,
    sharesSoldPercent: 68,
    projectedROI: 1.35,
  },
  {
    // Filled pool - tokens unlocked, in custody
    watchIndex: 2,
    status: 'active',
    tokenStatus: 'unlocked',
    liquidityModel: 'p2p',
    ammEnabled: false,
    sharesSoldPercent: 100,
    projectedROI: 1.15,
    custodyStatus: 'stored',
  },
  {
    // Listed for resale - hybrid liquidity
    watchIndex: 3,
    status: 'listed',
    tokenStatus: 'unlocked',
    liquidityModel: 'hybrid',
    ammEnabled: true,
    ammLiquidityPercent: 20,
    sharesSoldPercent: 100,
    projectedROI: 1.4,
    custodyStatus: 'stored',
    resaleListingPriceUSD: 210000,
  },
];

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

    const createdData: {
      users: string[];
      vendors: string[];
      assets: string[];
      pools: string[];
    } = {
      users: [],
      vendors: [],
      assets: [],
      pools: [],
    };

    // Create test users
    const testWallets = [TEST_VENDOR_WALLET, TEST_VENDOR_WALLET_2];
    const testUsers = [];

    for (const wallet of testWallets) {
      let user = await User.findOne({ wallet });
      if (!user) {
        user = await User.create({
          wallet,
          role: 'vendor',
        });
        console.log('Created test user:', wallet.slice(0, 20) + '...');
      }
      testUsers.push(user);
      createdData.users.push(user._id.toString());
    }

    // Create test vendors
    const vendorNames = ['LuxWatch Collective', 'Prestige Timepieces'];
    const testVendors = [];

    for (let i = 0; i < testUsers.length; i++) {
      let vendor = await Vendor.findOne({ user: testUsers[i]._id });
      if (!vendor) {
        vendor = await Vendor.create({
          user: testUsers[i]._id,
          businessName: vendorNames[i],
          username:
            vendorNames[i].toLowerCase().replace(/\s+/g, '_') +
            '_' +
            Date.now().toString().slice(-4),
          verified: true,
        });
        console.log('Created vendor:', vendorNames[i]);
      }
      testVendors.push(vendor);
      createdData.vendors.push(vendor._id.toString());
    }

    // Create assets and pools
    for (let i = 0; i < POOL_CONFIGS.length; i++) {
      const config = POOL_CONFIGS[i];
      const watchData = MOCK_WATCHES[config.watchIndex];
      const vendor = testVendors[i % testVendors.length];

      // Check if asset already exists
      let asset = await Asset.findOne({ serial: watchData.serial });
      if (!asset) {
        asset = await Asset.create({
          vendor: vendor._id,
          model: watchData.model,
          brand: watchData.brand,
          serial: watchData.serial,
          priceUSD: watchData.priceUSD,
          description: watchData.description,
          images: [watchData.imageUrl],
          imageIpfsUrls: [watchData.imageUrl],
          status: 'pooled',
        });
        console.log('Created asset:', watchData.model);
      }
      createdData.assets.push(asset._id.toString());

      // Check if pool already exists for this asset
      let pool = await Pool.findOne({ selectedAssetId: asset._id, deleted: { $ne: true } });

      // Calculate shares and pricing
      const totalShares = Math.ceil(watchData.priceUSD / 100); // $100 per share
      const sharesSold = Math.floor(totalShares * (config.sharesSoldPercent / 100));
      const sharePriceUSD = watchData.priceUSD / totalShares;

      // Generate mock participants if shares sold
      const participants = [];
      if (sharesSold > 0) {
        const numParticipants = Math.min(5, Math.ceil(sharesSold / 50));
        let remainingShares = sharesSold;

        for (let p = 0; p < numParticipants; p++) {
          const participantShares =
            p === numParticipants - 1
              ? remainingShares
              : Math.floor((remainingShares / (numParticipants - p)) * (0.5 + Math.random()));
          remainingShares -= participantShares;

          if (participantShares > 0) {
            participants.push({
              wallet: `MockInvestor${p + 1}${'1'.repeat(40 - 13 - String(p + 1).length)}`,
              shares: participantShares,
              ownershipPercent: (participantShares / totalShares) * 100,
              investedUSD: participantShares * sharePriceUSD,
              investedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
            });
          }
        }
      }

      if (!pool) {
        pool = await Pool.create({
          selectedAssetId: asset._id,
          vendorId: vendor._id,
          vendorWallet: testWallets[i % testWallets.length],
          sourceType: 'dealer',
          targetAmountUSD: watchData.priceUSD,
          totalShares,
          sharesSold,
          sharePriceUSD,
          minBuyInUSD: sharePriceUSD,
          maxInvestors: 100,
          projectedROI: config.projectedROI,
          status: config.status,
          participants,

          // Tokenization & Liquidity fields
          tokenStatus: config.tokenStatus,
          liquidityModel: config.liquidityModel,
          ammEnabled: config.ammEnabled,
          ammLiquidityPercent: config.ammLiquidityPercent || 30,
          vendorPaymentPercent: config.ammEnabled ? 67 : 97,
          fundsInEscrow: sharesSold * sharePriceUSD,

          // Mock Bags token mint for tokenized pools
          bagsTokenMint:
            config.tokenStatus !== 'pending'
              ? `LuxPool${asset._id.toString().slice(-8)}${'1'.repeat(32)}`
              : undefined,
          bagsTokenCreatedAt: config.tokenStatus !== 'pending' ? new Date() : undefined,

          // Custody status for filled pools
          custodyStatus: config.custodyStatus || 'pending',

          // Resale info
          resaleListingPriceUSD: config.resaleListingPriceUSD,
        });
        console.log(
          'Created pool:',
          watchData.model,
          '- Status:',
          config.status,
          '- Token:',
          config.tokenStatus
        );
      } else {
        // Update existing pool with new fields
        await Pool.findByIdAndUpdate(pool._id, {
          tokenStatus: config.tokenStatus,
          liquidityModel: config.liquidityModel,
          ammEnabled: config.ammEnabled,
          ammLiquidityPercent: config.ammLiquidityPercent || 30,
          vendorPaymentPercent: config.ammEnabled ? 67 : 97,
          fundsInEscrow: sharesSold * sharePriceUSD,
          bagsTokenMint:
            config.tokenStatus !== 'pending'
              ? `LuxPool${asset._id.toString().slice(-8)}${'1'.repeat(32)}`
              : undefined,
          custodyStatus: config.custodyStatus || 'pending',
          resaleListingPriceUSD: config.resaleListingPriceUSD,
        });
        console.log('Updated pool:', watchData.model);
      }
      createdData.pools.push(pool._id.toString());
    }

    return res.status(200).json({
      success: true,
      message: 'Test data setup complete with mock pools',
      data: createdData,
      pools: POOL_CONFIGS.map((config, i) => ({
        watch: MOCK_WATCHES[config.watchIndex].model,
        status: config.status,
        tokenStatus: config.tokenStatus,
        liquidityModel: config.liquidityModel,
        progress: `${config.sharesSoldPercent}%`,
      })),
    });
  } catch (error: unknown) {
    console.error('Setup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to setup test data', details: message });
  }
}
