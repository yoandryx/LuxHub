#!/usr/bin/env npx tsx
/**
 * LuxHub Pool Tokenomics Test Script
 *
 * Tests pool tokenomics via API calls to the running dev server:
 * 1. Create a test pool via direct MongoDB (using mongoose default import)
 * 2. Simulate trades via the Bags webhook endpoint
 * 3. Verify results by reading back from MongoDB
 * 4. Cleanup
 *
 * Run: npx tsx scripts/test-pool-tokenomics.ts
 * Requires: dev server running on localhost:3000
 */

import { createRequire } from 'module';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

// ============================================
// CONFIGURATION
// ============================================

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const BAGS_WEBHOOK_SECRET = process.env.BAGS_WEBHOOK_SECRET || '';
const MONGODB_URI = process.env.MONGODB_URI;

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

function header(text: string) {
  console.log();
  console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
  console.log(`${C.cyan}${C.bold}  ${text}${C.reset}`);
  console.log(`${C.cyan}${'='.repeat(60)}${C.reset}`);
  console.log();
}

function subheader(text: string) {
  console.log(`${C.magenta}--- ${text} ---${C.reset}`);
}

function success(text: string) {
  console.log(`${C.green}  [PASS]${C.reset} ${text}`);
}

function fail(text: string) {
  console.log(`${C.red}  [FAIL]${C.reset} ${text}`);
}

function info(text: string) {
  console.log(`${C.dim}  ${text}${C.reset}`);
}

function label(key: string, value: any) {
  console.log(`  ${C.white}${key}:${C.reset} ${C.yellow}${value}${C.reset}`);
}

// ============================================
// MONGOOSE SCHEMA (inline to avoid ESM issues)
// ============================================

const { Schema } = mongoose;

const PoolTestSchema = new Schema({}, { strict: false, collection: 'pools' });
const TransactionTestSchema = new Schema({}, { strict: false, collection: 'transactions' });

let PoolModel: any;
let TransactionModel: any;

async function connectDB() {
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env.local');
  await mongoose.connect(MONGODB_URI);
  // Use loose schemas so we can read any field
  PoolModel = mongoose.models.PoolTest || mongoose.model('PoolTest', PoolTestSchema);
  TransactionModel = mongoose.models.TxTest || mongoose.model('TxTest', TransactionTestSchema);
}

// ============================================
// TEST STATE
// ============================================

let testPoolId: string | null = null;
let testTokenMint: string = '';

// ============================================
// PHASE 1: CREATE TEST POOL
// ============================================

async function phase1_createPool(): Promise<boolean> {
  header('PHASE 1: Create Test Pool (1B supply, $15K watch)');

  try {
    testTokenMint = 'TestMint' + Date.now();

    const poolData = {
      selectedAssetId: new mongoose.Types.ObjectId(),
      sourceType: 'dealer',
      targetAmountUSD: 15000,
      totalShares: 1_000_000_000,
      sharePriceUSD: 15000 / 1_000_000_000,
      minBuyInUSD: 1.5,
      maxInvestors: 10000,
      projectedROI: 1.2,
      status: 'open',
      sharesSold: 0,
      participants: [],
      vendorWallet: 'TestVendor1111111111111111111111111111111111',
      bondingCurveActive: true,
      bondingCurveType: 'exponential',
      initialBondingPrice: 15000 / 1_000_000_000,
      currentBondingPrice: 15000 / 1_000_000_000,
      bagsTokenMint: testTokenMint,
      tokenStatus: 'unlocked',
      watchVerificationStatus: 'verified',
      totalTrades: 0,
      totalVolumeUSD: 0,
      accumulatedTradingFees: 0,
      accumulatedHolderFees: 0,
      accumulatedVendorFees: 0,
      accumulatedTradeRewards: 0,
      recentTrades: [],
    };

    // Insert directly into the pools collection
    const result = await mongoose.connection.db.collection('pools').insertOne(poolData);
    testPoolId = result.insertedId.toString();

    success('Test pool created');
    label('Pool ID', testPoolId);
    label('Share Price (USD)', `$${(15000 / 1_000_000_000).toFixed(9)}`);
    label('Total Supply', '1,000,000,000 (1B)');
    label('Target Amount (USD)', '$15,000');
    label('Min Buy-in (USD)', '$1.50 (~0.01 SOL)');
    label('Token Mint', testTokenMint);

    return true;
  } catch (err: any) {
    fail(`Failed to create pool: ${err.message}`);
    return false;
  }
}

// ============================================
// PHASE 2: SIMULATE TRADES VIA WEBHOOK
// ============================================

interface TradeConfig {
  tradeType: 'buy' | 'sell';
  traderWallet: string;
  outputAmount: string;
  priceUSD: number;
}

const TRADES: TradeConfig[] = [
  { tradeType: 'buy',  traderWallet: 'Buyer1aaaa1111111111111111111111111111111111', outputAmount: '50000000',  priceUSD: 0.000016 },
  { tradeType: 'buy',  traderWallet: 'Buyer2bbbb2222222222222222222222222222222222', outputAmount: '100000000', priceUSD: 0.000018 },
  { tradeType: 'sell', traderWallet: 'Buyer1aaaa1111111111111111111111111111111111', outputAmount: '20000000',  priceUSD: 0.000020 },
  { tradeType: 'buy',  traderWallet: 'Buyer3cccc3333333333333333333333333333333333', outputAmount: '75000000',  priceUSD: 0.000022 },
  { tradeType: 'sell', traderWallet: 'Buyer2bbbb2222222222222222222222222222222222', outputAmount: '30000000',  priceUSD: 0.000019 },
];

async function sendTradeWebhook(trade: TradeConfig, index: number): Promise<boolean> {
  const event = {
    type: 'TRADE_EXECUTED',
    timestamp: Math.floor(Date.now() / 1000) + index,
    signature: `TestTx${Date.now()}_${index}`,
    tokenMint: testTokenMint,
    tradeType: trade.tradeType,
    inputMint: trade.tradeType === 'buy' ? 'So11111111111111111111111111111111111111112' : testTokenMint,
    outputMint: trade.tradeType === 'buy' ? testTokenMint : 'So11111111111111111111111111111111111111112',
    inputAmount: String(parseFloat(trade.outputAmount) * trade.priceUSD),
    outputAmount: trade.outputAmount,
    priceUSD: trade.priceUSD,
    traderWallet: trade.traderWallet,
  };

  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (BAGS_WEBHOOK_SECRET) {
    headers['x-bags-signature'] = crypto.createHmac('sha256', BAGS_WEBHOOK_SECRET).update(payload).digest('hex');
  }

  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/bags`, {
      method: 'POST',
      headers,
      body: payload,
    });

    const data = await res.json();
    const amountUSD = parseFloat(trade.outputAmount) * trade.priceUSD;

    if (res.ok && data.success) {
      success(
        `Trade #${index + 1}: ${trade.tradeType.toUpperCase().padEnd(4)} ${Number(trade.outputAmount).toLocaleString()} tokens @ $${trade.priceUSD.toFixed(6)} = $${amountUSD.toFixed(2)}`
      );
      return true;
    } else {
      fail(`Trade #${index + 1}: ${res.status} - ${JSON.stringify(data)}`);
      return false;
    }
  } catch (err: any) {
    fail(`Trade #${index + 1}: Network error - ${err.message}`);
    return false;
  }
}

async function phase2_simulateTrades(): Promise<boolean> {
  header('PHASE 2: Simulate Trades via Webhook');

  info(`Sending ${TRADES.length} TRADE_EXECUTED events to ${BASE_URL}/api/webhooks/bags`);
  if (BAGS_WEBHOOK_SECRET) {
    info('Using HMAC signature verification');
  } else {
    info('No BAGS_WEBHOOK_SECRET — dev mode (signature skipped)');
  }
  console.log();

  let allPassed = true;

  for (let i = 0; i < TRADES.length; i++) {
    const ok = await sendTradeWebhook(TRADES[i], i);
    if (!ok) allPassed = false;
    await new Promise((r) => setTimeout(r, 300));
  }

  return allPassed;
}

// ============================================
// PHASE 3: VERIFY RESULTS
// ============================================

async function phase3_verifyResults(): Promise<boolean> {
  header('PHASE 3: Verify Results');

  try {
    const pool = await mongoose.connection.db
      .collection('pools')
      .findOne({ _id: new mongoose.Types.ObjectId(testPoolId!) });

    if (!pool) {
      fail('Pool not found in database');
      return false;
    }

    // Recent trades
    subheader('Recent Trades Feed');
    const trades = pool.recentTrades || [];
    if (trades.length > 0) {
      for (const t of trades) {
        const typeLabel = t.type === 'buy' ? `${C.green}BUY ${C.reset}` : `${C.red}SELL${C.reset}`;
        info(
          `${typeLabel} | ${t.wallet} | ${Number(t.amount).toLocaleString()} tokens | $${(t.amountUSD || 0).toFixed(4)}`
        );
      }
      if (trades.length === 5) {
        success(`recentTrades has ${trades.length} entries (capped at 5)`);
      } else {
        fail(`recentTrades has ${trades.length} entries (expected 5)`);
      }
    } else {
      fail('recentTrades is empty');
    }

    console.log();

    // Stats
    subheader('Pool Trading Stats');
    label('totalTrades', pool.totalTrades);
    label('totalVolumeUSD', `$${(pool.totalVolumeUSD || 0).toFixed(4)}`);
    label('accumulatedTradingFees', `$${(pool.accumulatedTradingFees || 0).toFixed(6)}`);
    label('accumulatedHolderFees', `$${(pool.accumulatedHolderFees || 0).toFixed(6)}`);
    label('accumulatedVendorFees', `$${(pool.accumulatedVendorFees || 0).toFixed(6)}`);
    label('accumulatedTradeRewards', `$${(pool.accumulatedTradeRewards || 0).toFixed(6)}`);
    label('lastPriceUSD', `$${(pool.lastPriceUSD || 0).toFixed(6)}`);

    console.log();

    let passed = true;

    // Validate trade count
    if (pool.totalTrades === TRADES.length) {
      success(`totalTrades = ${pool.totalTrades} (expected ${TRADES.length})`);
    } else {
      fail(`totalTrades = ${pool.totalTrades} (expected ${TRADES.length})`);
      passed = false;
    }

    // Calculate expected volume
    let expectedVolume = 0;
    for (const t of TRADES) {
      expectedVolume += parseFloat(t.outputAmount) * t.priceUSD;
    }

    const volumeDiff = Math.abs((pool.totalVolumeUSD || 0) - expectedVolume);
    if (volumeDiff < 0.01) {
      success(`totalVolumeUSD = $${pool.totalVolumeUSD.toFixed(4)} (expected $${expectedVolume.toFixed(4)})`);
    } else {
      fail(`totalVolumeUSD = $${(pool.totalVolumeUSD || 0).toFixed(4)} (expected $${expectedVolume.toFixed(4)})`);
      passed = false;
    }

    // Fee split verification
    console.log();
    subheader('Fee Split Verification (3% total)');

    const totalFees = pool.accumulatedTradingFees || 0;
    const expectedTotalFees = expectedVolume * 0.03;
    const feeDiff = Math.abs(totalFees - expectedTotalFees);

    if (feeDiff < 0.001) {
      success(`Total fees = $${totalFees.toFixed(6)} (3% of $${expectedVolume.toFixed(4)} = $${expectedTotalFees.toFixed(6)})`);
    } else {
      fail(`Total fees = $${totalFees.toFixed(6)} (expected $${expectedTotalFees.toFixed(6)})`);
      passed = false;
    }

    const holderFees = pool.accumulatedHolderFees || 0;
    const vendorFees = pool.accumulatedVendorFees || 0;
    const tradeRewards = pool.accumulatedTradeRewards || 0;
    const platformImplied = totalFees - holderFees - vendorFees - tradeRewards;

    info(`Fee breakdown:`);
    info(`  Holders (1/3 of 3% = ~1%):      $${holderFees.toFixed(6)}`);
    info(`  Vendor  (1/6 of 3% = ~0.5%):     $${vendorFees.toFixed(6)}`);
    info(`  Trade rewards (1/6 = ~0.5%):      $${tradeRewards.toFixed(6)}`);
    info(`  Platform (implied ~1%):           $${platformImplied.toFixed(6)}`);

    // Verify ratios
    if (totalFees > 0) {
      const holderRatio = holderFees / totalFees;
      const vendorRatio = vendorFees / totalFees;
      const rewardRatio = tradeRewards / totalFees;

      const ratioOk =
        Math.abs(holderRatio - 1 / 3) < 0.01 &&
        Math.abs(vendorRatio - 1 / 6) < 0.01 &&
        Math.abs(rewardRatio - 1 / 6) < 0.01;

      if (ratioOk) {
        success(
          `Ratios correct: holders=${(holderRatio * 100).toFixed(1)}%, vendor=${(vendorRatio * 100).toFixed(1)}%, rewards=${(rewardRatio * 100).toFixed(1)}%, platform=${((1 - holderRatio - vendorRatio - rewardRatio) * 100).toFixed(1)}%`
        );
      } else {
        fail(`Ratios off: holders=${(holderRatio * 100).toFixed(1)}%, vendor=${(vendorRatio * 100).toFixed(1)}%, rewards=${(rewardRatio * 100).toFixed(1)}%`);
        passed = false;
      }
    }

    return passed;
  } catch (err: any) {
    fail(`Verification error: ${err.message}`);
    return false;
  }
}

// ============================================
// PHASE 4: CLEANUP
// ============================================

async function phase4_cleanup(): Promise<void> {
  header('PHASE 4: Cleanup');

  try {
    if (testPoolId) {
      const result = await mongoose.connection.db
        .collection('pools')
        .deleteOne({ _id: new mongoose.Types.ObjectId(testPoolId) });

      if (result.deletedCount > 0) {
        success(`Deleted test pool: ${testPoolId}`);
      } else {
        info(`Pool already deleted: ${testPoolId}`);
      }

      // Clean up transactions
      const txResult = await mongoose.connection.db
        .collection('transactions')
        .deleteMany({ pool: new mongoose.Types.ObjectId(testPoolId) });

      if (txResult.deletedCount > 0) {
        success(`Deleted ${txResult.deletedCount} test transaction(s)`);
      }
    }
  } catch (err: any) {
    fail(`Cleanup error: ${err.message}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log();
  console.log(`${C.bold}${C.cyan}LuxHub Pool Tokenomics Test${C.reset}`);
  console.log(`${C.dim}Base URL: ${BASE_URL}${C.reset}`);
  console.log(`${C.dim}Time: ${new Date().toISOString()}${C.reset}`);

  await connectDB();
  info('Connected to MongoDB');

  const results: { phase: string; passed: boolean }[] = [];

  try {
    const p1 = await phase1_createPool();
    results.push({ phase: 'Create Pool (1B supply)', passed: p1 });
    if (!p1) {
      fail('Cannot continue without a test pool');
      await phase4_cleanup();
      process.exit(1);
    }

    const p2 = await phase2_simulateTrades();
    results.push({ phase: 'Simulate Trades', passed: p2 });

    // Let DB writes settle
    await new Promise((r) => setTimeout(r, 1000));

    const p3 = await phase3_verifyResults();
    results.push({ phase: 'Verify Results', passed: p3 });
  } finally {
    await phase4_cleanup();
  }

  // Summary
  header('SUMMARY');
  for (const r of results) {
    const icon = r.passed ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`;
    console.log(`  ${icon}  ${r.phase}`);
  }

  const allPassed = results.every((r) => r.passed);
  console.log();
  if (allPassed) {
    console.log(`${C.green}${C.bold}All phases passed!${C.reset}`);
  } else {
    console.log(`${C.red}${C.bold}Some phases failed. Review output above.${C.reset}`);
  }
  console.log();

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err);
  mongoose.disconnect().finally(() => process.exit(1));
});
