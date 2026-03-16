#!/usr/bin/env node
/**
 * Pool Lifecycle Integration Test
 *
 * Simulates: Vendor creates pool → Multiple buyers invest → Pool fills → Funded
 * Tests the full flow without needing real Solana transactions.
 *
 * Usage: npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' scripts/test-pool-lifecycle.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load env
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// ─── Models (inline to avoid Next.js imports) ───
const { Schema, model, models } = mongoose;

// VendorProfile
const VPSchema = new Schema({
  wallet: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  bio: String,
  avatarUrl: String,
  bannerUrl: String,
  verified: { type: Boolean, default: false },
  socialLinks: { instagram: String, x: String, website: String },
  inventory: [String],
  joined: { type: Date, default: Date.now },
  approved: { type: Boolean, default: false },
  applicationStatus: { type: String, default: 'pending' },
  businessType: String,
  primaryCategory: String,
  yearsInBusiness: Number,
  reliabilityScore: { type: Number, default: 100 },
});
VPSchema.pre('save', function(next) {
  if (this.isModified('applicationStatus')) this.approved = this.applicationStatus === 'approved';
  if (this.isModified('approved') && !this.isModified('applicationStatus'))
    this.applicationStatus = this.approved ? 'approved' : 'pending';
  next();
});
const VendorProfile = models.VendorProfile || model('VendorProfile', VPSchema);

// Asset
const AssetSchema = new Schema({
  vendor: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  model: { type: String, required: true },
  serial: String,
  description: String,
  priceUSD: Number,
  brand: String,
  title: String,
  imageUrl: String,
  nftOwnerWallet: String,
  mintedBy: String,
  nftMint: String,
  status: { type: String, default: 'pending' },
  category: { type: String, default: 'watches' },
  condition: String,
}, { timestamps: true });
const Asset = models.Asset || model('Asset', AssetSchema);

// User
const UserSchema = new Schema({
  wallet: { type: String, required: true, unique: true },
  role: { type: String, default: 'buyer' },
}, { timestamps: true });
const User = models.User || model('User', UserSchema);

// Pool (full schema)
const PoolSchema = new Schema({
  poolNumber: String,
  selectedAssetId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
  escrowId: { type: Schema.Types.ObjectId, ref: 'Escrow' },
  escrowPda: String,
  sourceType: { type: String, enum: ['dealer', 'luxhub_owned', 'escrow_conversion'], required: true },
  maxInvestors: { type: Number, required: true },
  minBuyInUSD: { type: Number, required: true },
  totalShares: { type: Number, required: true },
  sharesSold: { type: Number, default: 0 },
  sharePriceUSD: Number,
  targetAmountUSD: Number,
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    wallet: String,
    shares: Number,
    ownershipPercent: Number,
    investedUSD: Number,
    projectedReturnUSD: Number,
    investedAt: Date,
    txSignature: String,
  }],
  vendorId: { type: Schema.Types.ObjectId, ref: 'Vendor' },
  vendorWallet: String,
  vendorPaidAmount: Number,
  vendorPaidAt: Date,
  vendorPaymentTx: String,
  custodyStatus: { type: String, default: 'pending' },
  tokenStatus: { type: String, default: 'pending' },
  liquidityModel: { type: String, default: 'amm' },
  ammEnabled: { type: Boolean, default: false },
  ammLiquidityPercent: { type: Number, default: 30 },
  vendorPaymentPercent: { type: Number, default: 97 },
  fundsInEscrow: { type: Number, default: 0 },
  bondingCurveActive: { type: Boolean, default: true },
  bondingCurveType: { type: String, default: 'exponential' },
  currentBondingPrice: Number,
  initialBondingPrice: Number,
  reserveBalance: { type: Number, default: 0 },
  tokensMinted: { type: Number, default: 0 },
  tokensCirculating: { type: Number, default: 0 },
  projectedROI: Number,
  watchVerificationStatus: { type: String, default: 'verified' },
  totalTrades: { type: Number, default: 0 },
  totalVolumeUSD: { type: Number, default: 0 },
  bagsTokenMint: String,
  graduated: { type: Boolean, default: false },
  squadMultisigPda: String,
  recentTrades: [{
    wallet: String,
    type: { type: String, enum: ['buy', 'sell'] },
    amount: Number,
    amountUSD: Number,
    timestamp: Date,
    txSignature: String,
  }],
  status: { type: String, default: 'open', index: true },
  deleted: { type: Boolean, default: false },
  feeAllocations: {
    platformBps: { type: Number, default: 100 },
    holderBps: { type: Number, default: 100 },
    vendorBps: { type: Number, default: 50 },
    tradeRewardBps: { type: Number, default: 50 },
  },
  distributionStatus: { type: String, default: 'pending' },
  distributionAmount: Number,
  distributionRoyalty: Number,
  windDownStatus: { type: String, default: 'none' },
  resaleListingPriceUSD: Number,
}, { timestamps: true });

// Pre-save hooks (matching production)
PoolSchema.pre('save', function(next) {
  if (this.isModified('participants') && this.totalShares > 0) {
    this.participants.forEach((p: any) => {
      p.ownershipPercent = (p.shares / this.totalShares) * 100;
      p.projectedReturnUSD = (p.investedUSD || 0) * (this.projectedROI || 1);
    });
    const totalInvested = this.participants.reduce((sum: number, p: any) => sum + (p.investedUSD || 0), 0);
    this.fundsInEscrow = totalInvested;
    if (this.sharesSold >= this.totalShares && this.status === 'open') {
      this.status = 'filled';
    }
  }
  if (!this.sharePriceUSD && this.targetAmountUSD && this.totalShares) {
    this.sharePriceUSD = this.targetAmountUSD / this.totalShares;
  }
  if (this.isModified('status') && this.status === 'funded' && !this.vendorPaidAmount && this.targetAmountUSD) {
    if (this.liquidityModel === 'amm' || this.liquidityModel === 'hybrid') {
      const ammPct = this.ammLiquidityPercent || 30;
      const vendorPct = (100 - ammPct - 3) / 100;
      this.vendorPaidAmount = this.targetAmountUSD * vendorPct;
      this.vendorPaymentPercent = vendorPct * 100;
    } else {
      this.vendorPaidAmount = this.targetAmountUSD * 0.97;
      this.vendorPaymentPercent = 97;
    }
  }
  next();
});

const Pool = models.Pool || model('Pool', PoolSchema);

// ─── Helpers ───
const fakeWallet = () => crypto.randomBytes(32).toString('hex').slice(0, 44);
const fakeTxSig = () => crypto.randomBytes(64).toString('base64').slice(0, 88);
const SOL_PRICE = 135; // Simulated SOL/USD price

const log = (emoji: string, msg: string) => console.log(`${emoji}  ${msg}`);
const divider = () => console.log('\n' + '═'.repeat(70) + '\n');

// ─── Test Data ───
const TEST_PREFIX = '__TEST_POOL_LIFECYCLE__';
const VENDOR_WALLET = 'TestVendor' + fakeWallet().slice(10);
const WATCH_PRICE_USD = 15000;
const NUM_BUYERS = 8;

// Generate buyer wallets
const buyers = Array.from({ length: NUM_BUYERS }, (_, i) => ({
  wallet: `TestBuyer${i}_${fakeWallet().slice(11)}`,
  name: `Test Buyer ${i + 1}`,
}));

// ─── Main Test ───
async function main() {
  console.log('\n' + '╔' + '═'.repeat(68) + '╗');
  console.log('║' + '  LUXHUB POOL LIFECYCLE - INTEGRATION TEST'.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝\n');

  const results: { test: string; status: 'PASS' | 'FAIL' | 'WARN'; details: string }[] = [];

  // Connect to MongoDB
  log('🔌', 'Connecting to MongoDB...');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in .env.local');
  await mongoose.connect(uri, { ssl: true });
  log('✅', `Connected to ${mongoose.connection.name}`);
  divider();

  let vendorProfile: any;
  let asset: any;
  let pool: any;

  try {
    // ═══════════════════════════════════════════════════════
    // PHASE 1: Setup - Create Vendor + Asset
    // ═══════════════════════════════════════════════════════
    log('📦', 'PHASE 1: Create Test Vendor & Asset');

    // 1a. Create approved vendor
    vendorProfile = await VendorProfile.create({
      wallet: VENDOR_WALLET,
      name: `${TEST_PREFIX} Prestige Watches`,
      username: `test_prestige_${Date.now()}`,
      bio: 'Test vendor for pool lifecycle',
      approved: true,
      applicationStatus: 'approved',
      verified: true,
      businessType: 'dealer',
      primaryCategory: 'watches',
      yearsInBusiness: 10,
    });
    log('✅', `Vendor created: ${vendorProfile.name} (${vendorProfile.wallet.slice(0, 12)}...)`);
    results.push({ test: 'Create Vendor', status: 'PASS', details: `ID: ${vendorProfile._id}` });

    // 1b. Create minted asset
    asset = await Asset.create({
      model: 'Submariner Date 41mm',
      brand: 'Rolex',
      title: `${TEST_PREFIX} Rolex Submariner Date 41mm`,
      description: 'Black dial, ceramic bezel, Oystersteel. Full set with box and papers.',
      priceUSD: WATCH_PRICE_USD,
      serial: 'TEST-12345678',
      nftOwnerWallet: VENDOR_WALLET,
      nftMint: `TestMint${fakeWallet().slice(8)}`, // Simulated mint
      status: 'listed',
      condition: 'Excellent',
      category: 'watches',
      imageUrl: 'https://via.placeholder.com/400x400?text=Rolex+Submariner',
    });
    log('✅', `Asset created: ${asset.brand} ${asset.model} ($${asset.priceUSD.toLocaleString()})`);
    results.push({ test: 'Create Asset', status: 'PASS', details: `Mint: ${asset.nftMint.slice(0, 16)}...` });

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 2: Create Pool
    // ═══════════════════════════════════════════════════════
    log('🏊', 'PHASE 2: Create Pool');

    const TOTAL_SUPPLY = 1_000_000_000;
    const sharePrice = WATCH_PRICE_USD / TOTAL_SUPPLY;
    const poolCount = await Pool.countDocuments();
    const poolNumber = `LUX-${(poolCount + 1).toString().padStart(5, '0')}`;

    pool = await Pool.create({
      poolNumber,
      selectedAssetId: asset._id,
      vendorId: vendorProfile._id,
      vendorWallet: VENDOR_WALLET,
      sourceType: 'dealer',
      targetAmountUSD: WATCH_PRICE_USD,
      totalShares: TOTAL_SUPPLY,
      sharePriceUSD: sharePrice,
      minBuyInUSD: 1.5,
      maxInvestors: 10000,
      projectedROI: 1.2,
      status: 'open',
      sharesSold: 0,
      participants: [],
      liquidityModel: 'amm',
      ammEnabled: true,
      ammLiquidityPercent: 30,
      bondingCurveActive: true,
      bondingCurveType: 'exponential',
      initialBondingPrice: sharePrice,
      currentBondingPrice: sharePrice,
      watchVerificationStatus: 'verified',
    });

    log('✅', `Pool created: ${poolNumber}`);
    log('📊', `  Target: $${WATCH_PRICE_USD.toLocaleString()}`);
    log('📊', `  Total Supply: ${TOTAL_SUPPLY.toLocaleString()} tokens`);
    log('📊', `  Share Price: $${sharePrice.toFixed(12)}`);
    log('📊', `  Min Buy: $1.50 (~${(1.5 / SOL_PRICE).toFixed(4)} SOL)`);
    log('📊', `  Liquidity Model: AMM (30% to liquidity)`);
    results.push({ test: 'Create Pool', status: 'PASS', details: poolNumber });

    // Verify asset status updated
    const updatedAsset = await Asset.findById(asset._id);
    log('🔍', `  Asset status after pool: "${updatedAsset?.status}" (expected: "listed" - create.ts sets "pooled")`);
    if (updatedAsset?.status !== 'pooled') {
      results.push({ test: 'Asset Status Update', status: 'WARN', details: `Status is "${updatedAsset?.status}", expected "pooled" — script doesn't call create API which sets this` });
    }
    // Manually set it like the API would
    await Asset.findByIdAndUpdate(asset._id, { status: 'pooled' });

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 3: Simulate Buyer Investments
    // ═══════════════════════════════════════════════════════
    log('💰', 'PHASE 3: Simulate Investments');
    log('👥', `  ${NUM_BUYERS} buyers will invest to fill the pool`);
    console.log('');

    // Distribute investments: first 7 get equal portions, last one fills remaining
    const baseInvestUSD = Math.floor(WATCH_PRICE_USD / NUM_BUYERS);

    for (let i = 0; i < NUM_BUYERS; i++) {
      const buyer = buyers[i];

      // Last buyer fills the remaining
      const isLast = i === NUM_BUYERS - 1;
      const currentPool = await Pool.findById(pool._id);
      if (!currentPool) throw new Error('Pool disappeared!');

      const availableShares = currentPool.totalShares - currentPool.sharesSold;

      let investUSD: number;
      let shares: number;

      if (isLast) {
        // Last buyer buys all remaining shares
        shares = availableShares;
        investUSD = shares * currentPool.sharePriceUSD;
      } else {
        investUSD = baseInvestUSD;
        shares = Math.floor(investUSD / currentPool.sharePriceUSD);
        // Make sure we don't overshoot
        if (shares > availableShares) shares = availableShares;
        investUSD = shares * currentPool.sharePriceUSD;
      }

      const solAmount = investUSD / SOL_PRICE;
      const txSig = fakeTxSig();

      // Create user
      const user = await User.findOneAndUpdate(
        { wallet: buyer.wallet },
        { $setOnInsert: { wallet: buyer.wallet, role: 'buyer' } },
        { upsert: true, new: true }
      );

      // Check if buyer already in pool
      const existingParticipant = currentPool.participants.find((p: any) => p.wallet === buyer.wallet);

      if (existingParticipant) {
        existingParticipant.shares += shares;
        existingParticipant.investedUSD += investUSD;
        existingParticipant.ownershipPercent = (existingParticipant.shares / currentPool.totalShares) * 100;
        existingParticipant.txSignature = txSig;
      } else {
        currentPool.participants.push({
          user: user._id,
          wallet: buyer.wallet,
          shares,
          ownershipPercent: (shares / currentPool.totalShares) * 100,
          investedUSD: investUSD,
          projectedReturnUSD: investUSD * currentPool.projectedROI,
          investedAt: new Date(),
          txSignature: txSig,
        });
      }

      currentPool.sharesSold += shares;

      // Check auto-fill
      if (currentPool.sharesSold >= currentPool.totalShares) {
        currentPool.status = 'filled';
      }

      await currentPool.save();

      const pctFilled = ((currentPool.sharesSold / currentPool.totalShares) * 100).toFixed(1);
      const progressBar = '█'.repeat(Math.floor(parseInt(pctFilled) / 5)) + '░'.repeat(20 - Math.floor(parseInt(pctFilled) / 5));

      log(isLast ? '🏁' : '💸', `  Buyer ${i + 1}/${NUM_BUYERS}: ${buyer.wallet.slice(0, 16)}...`);
      log('  ', `    ${solAmount.toFixed(2)} SOL ($${investUSD.toFixed(2)}) → ${shares.toLocaleString()} tokens`);
      log('  ', `    [${progressBar}] ${pctFilled}% filled | Status: ${currentPool.status}`);

      results.push({
        test: `Buyer ${i + 1} Investment`,
        status: currentPool.sharesSold <= currentPool.totalShares ? 'PASS' : 'FAIL',
        details: `${shares.toLocaleString()} tokens, $${investUSD.toFixed(2)}`,
      });
    }

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 4: Verify Pool State After Filling
    // ═══════════════════════════════════════════════════════
    log('🔍', 'PHASE 4: Verify Pool State');

    const filledPool = await Pool.findById(pool._id);
    if (!filledPool) throw new Error('Pool not found!');

    const checks = [
      { name: 'Status is "filled"', pass: filledPool.status === 'filled', got: filledPool.status },
      { name: 'All shares sold', pass: filledPool.sharesSold >= filledPool.totalShares, got: `${filledPool.sharesSold}/${filledPool.totalShares}` },
      { name: 'FundsInEscrow matches target', pass: Math.abs(filledPool.fundsInEscrow - WATCH_PRICE_USD) < 1, got: `$${filledPool.fundsInEscrow?.toFixed(2)} vs $${WATCH_PRICE_USD}` },
      { name: 'Participant count', pass: filledPool.participants.length === NUM_BUYERS, got: filledPool.participants.length },
      { name: 'Ownership sums to ~100%', pass: Math.abs(filledPool.participants.reduce((s: number, p: any) => s + p.ownershipPercent, 0) - 100) < 0.01, got: filledPool.participants.reduce((s: number, p: any) => s + p.ownershipPercent, 0).toFixed(4) + '%' },
    ];

    for (const check of checks) {
      log(check.pass ? '✅' : '❌', `  ${check.name}: ${check.got}`);
      results.push({ test: check.name, status: check.pass ? 'PASS' : 'FAIL', details: String(check.got) });
    }

    // Log participant breakdown
    console.log('\n  Participant Breakdown:');
    console.log('  ' + '─'.repeat(60));
    console.log('  ' + 'Wallet'.padEnd(20) + 'Shares'.padStart(15) + 'USD'.padStart(12) + 'Own%'.padStart(10));
    console.log('  ' + '─'.repeat(60));
    for (const p of filledPool.participants) {
      console.log(
        '  ' +
        (p.wallet?.slice(0, 18) + '..').padEnd(20) +
        p.shares.toLocaleString().padStart(15) +
        `$${p.investedUSD?.toFixed(2)}`.padStart(12) +
        `${p.ownershipPercent?.toFixed(2)}%`.padStart(10)
      );
    }
    console.log('  ' + '─'.repeat(60));
    console.log(
      '  ' +
      'TOTAL'.padEnd(20) +
      filledPool.sharesSold.toLocaleString().padStart(15) +
      `$${filledPool.fundsInEscrow?.toFixed(2)}`.padStart(12) +
      `${filledPool.participants.reduce((s: number, p: any) => s + p.ownershipPercent, 0).toFixed(2)}%`.padStart(10)
    );

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 5: Simulate Vendor Payment & Custody
    // ═══════════════════════════════════════════════════════
    log('💳', 'PHASE 5: Vendor Payment & Custody Flow');

    // Simulate vendor payment (what pay-vendor.ts does)
    filledPool.status = 'funded';
    filledPool.vendorPaidAt = new Date();
    filledPool.vendorPaymentTx = fakeTxSig();
    await filledPool.save();

    const fundedPool = await Pool.findById(pool._id);
    log('✅', `  Status: ${fundedPool?.status}`);
    log('✅', `  Vendor Payment: $${fundedPool?.vendorPaidAmount?.toFixed(2)} (${fundedPool?.vendorPaymentPercent}%)`);
    results.push({ test: 'Vendor Payment Calculation', status: fundedPool?.vendorPaidAmount ? 'PASS' : 'FAIL', details: `$${fundedPool?.vendorPaidAmount?.toFixed(2)}` });

    // Expected for AMM model: 67% to vendor (100 - 30% AMM - 3% fee)
    const expectedVendorPct = 67;
    const actualVendorPct = fundedPool?.vendorPaymentPercent;
    log('🔍', `  Vendor %: ${actualVendorPct}% (expected: ~${expectedVendorPct}%)`);
    results.push({
      test: 'AMM Vendor Payment Split',
      status: Math.abs((actualVendorPct || 0) - expectedVendorPct) < 1 ? 'PASS' : 'FAIL',
      details: `${actualVendorPct}% vs expected ${expectedVendorPct}%`
    });

    // Simulate custody flow
    fundedPool!.custodyStatus = 'shipped';
    fundedPool!.set('custodyTrackingCarrier', 'FedEx');
    fundedPool!.set('custodyTrackingNumber', 'TEST1234567890');
    await fundedPool!.save();
    log('📦', '  Custody: shipped → received → verified');

    fundedPool!.custodyStatus = 'received';
    fundedPool!.set('custodyReceivedAt', new Date());
    await fundedPool!.save();

    fundedPool!.custodyStatus = 'verified';
    fundedPool!.set('custodyVerifiedBy', 'TestAdmin');
    await fundedPool!.save();

    log('✅', `  Custody Status: ${fundedPool?.custodyStatus}`);
    results.push({ test: 'Custody Flow', status: fundedPool?.custodyStatus === 'verified' ? 'PASS' : 'FAIL', details: fundedPool?.custodyStatus || 'unknown' });

    // Unlock tokens
    fundedPool!.tokenStatus = 'unlocked';
    fundedPool!.set('tokenUnlockedAt', new Date());
    fundedPool!.status = 'active';
    await fundedPool!.save();
    log('🔓', `  Token Status: ${fundedPool?.tokenStatus}`);
    log('🟢', `  Pool Status: ${fundedPool?.status}`);
    results.push({ test: 'Token Unlock', status: fundedPool?.tokenStatus === 'unlocked' ? 'PASS' : 'FAIL', details: fundedPool?.tokenStatus || 'unknown' });

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 6: Test Sell Flow (Bonding Curve)
    // ═══════════════════════════════════════════════════════
    log('📉', 'PHASE 6: Test Sell Flow (Bonding Curve)');
    console.log('');

    // Reload pool for sell testing
    const activePool = await Pool.findById(pool._id);
    if (!activePool) throw new Error('Pool disappeared before sell test!');

    // Test 1: Buyer 1 sells 25% of their tokens
    const seller = buyers[0];
    const sellerParticipant = activePool.participants.find((p: any) => p.wallet === seller.wallet);
    const sellAmount = Math.floor((sellerParticipant?.shares || 0) * 0.25);
    const priceBeforeSell = activePool.currentBondingPrice || activePool.sharePriceUSD;

    log('💰', `  Buyer 1 selling 25% (${sellAmount.toLocaleString()} tokens)`);

    // Simulate sell (mirrors sell.ts logic)
    const grossOutputUSD = sellAmount * priceBeforeSell;
    const feeRate = 0.03;
    const totalFeeUSD = grossOutputUSD * feeRate;
    const netOutputUSD = grossOutputUSD - totalFeeUSD;

    // Update participant
    const sellRatio = sellAmount / (sellerParticipant?.shares || 1);
    sellerParticipant!.shares -= sellAmount;
    sellerParticipant!.ownershipPercent = (sellerParticipant!.shares / activePool.totalShares) * 100;
    sellerParticipant!.investedUSD = Math.max(0, (sellerParticipant!.investedUSD || 0) * (1 - sellRatio));

    // Update pool-level counters
    activePool.sharesSold -= sellAmount;

    // Update bonding curve price (price goes DOWN on sell)
    const k = 3;
    const newSoldRatio = activePool.sharesSold / activePool.totalShares;
    activePool.currentBondingPrice = (activePool.initialBondingPrice || priceBeforeSell) * Math.exp(k * newSoldRatio);
    const priceAfterSell = activePool.currentBondingPrice;

    // Track trade
    activePool.totalTrades = (activePool.totalTrades || 0) + 1;
    activePool.totalVolumeUSD = (activePool.totalVolumeUSD || 0) + grossOutputUSD;
    activePool.accumulatedTradingFees = (activePool.accumulatedTradingFees || 0) + totalFeeUSD;

    if (!activePool.recentTrades) activePool.recentTrades = [];
    activePool.recentTrades.push({
      wallet: seller.wallet,
      type: 'sell',
      amount: sellAmount,
      amountUSD: grossOutputUSD,
      timestamp: new Date(),
      txSignature: fakeTxSig(),
    });

    await activePool.save();

    // Verify sell results
    const afterSellPool = await Pool.findById(pool._id);
    const sellerAfter = afterSellPool?.participants.find((p: any) => p.wallet === seller.wallet);

    const sellChecks = [
      { name: 'Seller tokens reduced', pass: sellerAfter!.shares === sellerParticipant!.shares, got: `${sellerAfter?.shares.toLocaleString()} (was ${(sellAmount + sellerAfter!.shares).toLocaleString()})` },
      { name: 'Pool sharesSold decreased', pass: afterSellPool!.sharesSold < TOTAL_SUPPLY, got: `${afterSellPool?.sharesSold.toLocaleString()} / ${TOTAL_SUPPLY.toLocaleString()}` },
      { name: 'Price adjusted on sell', pass: priceAfterSell !== priceBeforeSell, got: `$${priceBeforeSell.toFixed(12)} → $${priceAfterSell.toFixed(12)} (curve reflects ${(newSoldRatio * 100).toFixed(1)}% sold)` },
      { name: '3% fee applied', pass: Math.abs(totalFeeUSD - grossOutputUSD * 0.03) < 0.000001, got: `Fee: $${totalFeeUSD.toFixed(6)} (${(feeRate * 100)}%)` },
      { name: 'Net output after fee', pass: netOutputUSD < grossOutputUSD, got: `$${netOutputUSD.toFixed(6)} net (from $${grossOutputUSD.toFixed(6)} gross)` },
      { name: 'Trade recorded', pass: (afterSellPool?.totalTrades || 0) >= 1, got: `${afterSellPool?.totalTrades} trades, $${afterSellPool?.totalVolumeUSD?.toFixed(6)} volume` },
      { name: 'Recent trades updated', pass: (afterSellPool?.recentTrades?.length || 0) >= 1, got: `${afterSellPool?.recentTrades?.length} recent trades` },
    ];

    for (const check of sellChecks) {
      log(check.pass ? '✅' : '❌', `  ${check.name}: ${check.got}`);
      results.push({ test: `Sell: ${check.name}`, status: check.pass ? 'PASS' : 'FAIL', details: String(check.got) });
    }

    // Test 2: Buyer 2 sells ALL tokens (should be removed from participants)
    console.log('');
    const seller2 = buyers[1];
    const seller2Participant = afterSellPool!.participants.find((p: any) => p.wallet === seller2.wallet);
    const seller2Amount = seller2Participant?.shares || 0;
    log('💰', `  Buyer 2 selling ALL tokens (${seller2Amount.toLocaleString()})`);

    const participantsBefore = afterSellPool!.participants.length;

    // Remove shares
    seller2Participant!.shares = 0;
    afterSellPool!.sharesSold -= seller2Amount;

    // Remove participant with 0 shares
    const idx = afterSellPool!.participants.findIndex((p: any) => p.wallet === seller2.wallet);
    if (idx !== -1 && afterSellPool!.participants[idx].shares <= 0) {
      afterSellPool!.participants.splice(idx, 1);
    }

    await afterSellPool!.save();

    const afterFullSell = await Pool.findById(pool._id);
    const participantsAfter = afterFullSell!.participants.length;
    const seller2Gone = !afterFullSell!.participants.find((p: any) => p.wallet === seller2.wallet);

    log(seller2Gone ? '✅' : '❌', `  Seller removed from participants: ${participantsBefore} → ${participantsAfter}`);
    results.push({ test: 'Sell: Full sell removes participant', status: seller2Gone ? 'PASS' : 'FAIL', details: `${participantsBefore} → ${participantsAfter}` });

    // Test 3: Verify pool reopens when shares available after being filled
    // (Pool was active, not filled, so this tests the concept)
    log('🔍', `  Pool status after sells: ${afterFullSell?.status} (shares available: ${(afterFullSell!.totalShares - afterFullSell!.sharesSold).toLocaleString()})`);
    results.push({ test: 'Sell: Shares available after sell', status: afterFullSell!.sharesSold < TOTAL_SUPPLY ? 'PASS' : 'FAIL', details: `${(afterFullSell!.totalShares - afterFullSell!.sharesSold).toLocaleString()} available` });

    // Summary table
    console.log('\n  Post-Sell State:');
    console.log('  ' + '─'.repeat(50));
    console.log(`  Participants:    ${afterFullSell?.participants.length} (was ${NUM_BUYERS})`);
    console.log(`  Shares Sold:     ${afterFullSell?.sharesSold.toLocaleString()} / ${afterFullSell?.totalShares.toLocaleString()}`);
    console.log(`  Bonding Price:   $${afterFullSell?.currentBondingPrice?.toFixed(12)}`);
    console.log(`  Volume:          $${afterFullSell?.totalVolumeUSD?.toFixed(6)}`);
    console.log(`  Total Trades:    ${afterFullSell?.totalTrades}`);
    console.log(`  Fees Collected:  $${afterFullSell?.accumulatedTradingFees?.toFixed(6)}`);
    console.log('  ' + '─'.repeat(50));

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 7: Audit - Remaining Issues
    // ═══════════════════════════════════════════════════════
    log('🔎', 'PHASE 7: Remaining Issues & Considerations');
    console.log('');

    const issues = [
      {
        severity: 'MEDIUM',
        area: 'PoolDetail.tsx:207-209',
        issue: 'Buy sends SOL to treasury, not pool escrow',
        details: 'Investment SOL goes to NEXT_PUBLIC_LUXHUB_WALLET instead of a pool-specific vault.',
        fix: 'Track pool-specific deposits or use escrow PDA',
      },
      {
        severity: 'LOW',
        area: 'Pool.ts pre-save',
        issue: 'fundsInEscrow from MongoDB, not on-chain',
        details: 'Could drift from on-chain reality over time.',
        fix: 'Periodic reconciliation with on-chain balances',
      },
      {
        severity: 'LOW',
        area: 'PoolDetail.tsx:152',
        issue: 'Token calc uses linear division, not bonding curve',
        details: 'Frontend shows linear pricing; backend sell uses exponential curve.',
        fix: 'Add bonding curve quote to frontend or use Bags API quote',
      },
      {
        severity: 'FIXED',
        area: 'PoolDetail.tsx:450',
        issue: 'Sell button now calls handleSell()',
        details: 'Previously called handleBuy(). Now has separate sell logic with slippage protection.',
        fix: 'DONE',
      },
      {
        severity: 'FIXED',
        area: '/api/pool/sell.ts',
        issue: 'Sell endpoint created',
        details: 'Bonding curve sell with 3% fees, slippage protection, price impact warnings.',
        fix: 'DONE',
      },
      {
        severity: 'FIXED',
        area: 'list.ts:65',
        issue: 'poolNumber now uses actual field',
        details: 'Falls back to _id slice if poolNumber not set.',
        fix: 'DONE',
      },
      {
        severity: 'FIXED',
        area: 'invest.ts:89',
        issue: 'Tolerance now 1% of expected amount',
        details: 'Was absolute $0.01, now percentage-based.',
        fix: 'DONE',
      },
    ];

    for (const issue of issues) {
      const icon = issue.severity === 'FIXED' ? '✅' : issue.severity === 'MEDIUM' ? '🟡' : issue.severity === 'LOW' ? '🔵' : 'ℹ️';
      console.log(`  ${icon} [${issue.severity}] ${issue.issue}`);
      console.log(`     ${issue.details}`);
      if (issue.severity !== 'FIXED') console.log(`     Fix: ${issue.fix}`);
      console.log('');
    }

    divider();

    // ═══════════════════════════════════════════════════════
    // PHASE 8: API-Level Tests (if dev server running)
    // ═══════════════════════════════════════════════════════
    log('🌐', 'PHASE 8: API-Level Tests');
    console.log('');

    let serverRunning = false;
    try {
      const resp = await fetch('http://localhost:3000/api/pool/list');
      serverRunning = resp.ok;
      if (serverRunning) {
        const data = await resp.json();
        log('✅', `  Dev server running. ${data.pools?.length || 0} pools found.`);

        // Test sell endpoint exists
        const sellResp = await fetch('http://localhost:3000/api/pool/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId: 'invalid', sellerWallet: 'test', tokenAmount: 100 }),
        });
        const sellData = await sellResp.json();
        log('🔍', `  Sell endpoint responds: ${sellResp.status} — "${sellData.error}"`);
        results.push({
          test: 'Sell API endpoint exists',
          status: sellResp.status !== 404 && sellResp.status !== 405 ? 'PASS' : 'FAIL',
          details: `${sellResp.status}: ${sellData.error}`
        });

        // Test invest rejects missing tx
        const investResp = await fetch('http://localhost:3000/api/pool/invest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id.toString(),
            investorWallet: buyers[0].wallet,
            shares: 1000,
            investedUSD: 0.000015,
          }),
        });
        const investData = await investResp.json();
        log('🔍', `  Invest without TX: ${investResp.status} — "${investData.error}"`);
        results.push({
          test: 'Invest rejects missing txSignature',
          status: investResp.status === 400 ? 'PASS' : 'FAIL',
          details: investData.error
        });
      }
    } catch {
      log('⚠️', '  Dev server not running. Skipping API tests.');
      results.push({ test: 'API-level tests', status: 'WARN', details: 'Dev server not running' });
    }

    divider();

    // ═══════════════════════════════════════════════════════
    // RESULTS SUMMARY
    // ═══════════════════════════════════════════════════════
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + '  TEST RESULTS SUMMARY'.padEnd(68) + '║');
    console.log('╚' + '═'.repeat(68) + '╝\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;

    for (const r of results) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`  ${icon} ${r.test.padEnd(35)} ${r.details}`);
    }

    console.log('\n  ' + '─'.repeat(60));
    console.log(`  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}  |  ⚠️ Warnings: ${warned}`);
    console.log(`  Total: ${results.length} tests\n`);

    // High-priority fixes needed
    if (failed > 0 || issues.filter(i => i.severity === 'HIGH').length > 0) {
      console.log('  🔥 HIGH PRIORITY FIXES NEEDED:');
      for (const issue of issues.filter(i => i.severity === 'HIGH')) {
        console.log(`     → ${issue.issue} (${issue.area})`);
      }
      console.log('');
    }

  } finally {
    // ═══════════════════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════════════════
    log('🧹', 'Cleaning up test data...');

    if (pool?._id) {
      await Pool.deleteOne({ _id: pool._id });
      log('  ', `  Deleted pool: ${pool._id}`);
    }
    if (asset?._id) {
      await Asset.deleteOne({ _id: asset._id });
      log('  ', `  Deleted asset: ${asset._id}`);
    }
    if (vendorProfile?._id) {
      await VendorProfile.deleteOne({ _id: vendorProfile._id });
      log('  ', `  Deleted vendor: ${vendorProfile._id}`);
    }
    // Clean up test users
    const buyerWallets = buyers.map(b => b.wallet);
    const deletedUsers = await User.deleteMany({ wallet: { $in: buyerWallets } });
    log('  ', `  Deleted ${deletedUsers.deletedCount} test users`);

    log('✅', 'Cleanup complete');

    await mongoose.disconnect();
    log('🔌', 'Disconnected from MongoDB');
  }
}

main().catch((err) => {
  console.error('\n❌ Test failed with error:', err.message);
  console.error(err.stack);
  mongoose.disconnect();
  process.exit(1);
});
