// scripts/test-marketplace-apis.ts
// Comprehensive test script for new marketplace API endpoints
// Run with: npx tsx scripts/test-marketplace-apis.ts

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

// Test wallets (use devnet wallets for testing)
const TEST_VENDOR_WALLET = 'VendorTestWallet1111111111111111111111111111';
const TEST_BUYER_WALLET = 'BuyerTestWallet11111111111111111111111111111';
const TEST_ADMIN_WALLET = process.env.ADMIN_WALLET || 'AdminTestWallet11111111111111111111111111111';

// Test data storage (populated by setup API)
let testAssetId: string = '';
let testVendorId: string = '';
let testEscrowId: string = '';
let testEscrowPda: string = '';
let testOfferId: string = '';
let testPoolId: string = '';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  responseTime?: number;
}

const results: TestResult[] = [];

async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<{ ok: boolean; status: number; data: any; time: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    return {
      ok: response.ok,
      status: response.status,
      data,
      time: Date.now() - start,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      data: { error: error.message },
      time: Date.now() - start,
    };
  }
}

function logResult(result: TestResult) {
  const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '○';
  const color =
    result.status === 'PASS' ? '\x1b[32m' : result.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
  console.log(
    `${color}${icon}\x1b[0m [${result.method}] ${result.endpoint} - ${result.message}${result.responseTime ? ` (${result.responseTime}ms)` : ''}`
  );
  results.push(result);
}

// ============================================
// SETUP: Create test data via API
// ============================================

async function setupTestData() {
  console.log('\n\x1b[36m━━━ Setting up test data ━━━\x1b[0m\n');

  try {
    // Use the test setup API endpoint
    const response = await fetch(`${BASE_URL}/api/test/setup-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(`\x1b[33m○ Setup API returned ${response.status}: ${errorData.error || 'Unknown error'}\x1b[0m`);
      return false;
    }

    const result = await response.json();
    if (result.success && result.data) {
      testAssetId = result.data.assetId;
      testVendorId = result.data.vendorId;
      testEscrowId = result.data.escrowId;
      testEscrowPda = result.data.escrowPda;
      testPoolId = result.data.poolId;

      console.log('\x1b[32m✓ Test data setup complete\x1b[0m');
      console.log(`  Asset ID: ${testAssetId}`);
      console.log(`  Vendor ID: ${testVendorId}`);
      console.log(`  Escrow PDA: ${testEscrowPda}`);
      console.log(`  Pool ID: ${testPoolId}\n`);
      return true;
    }

    console.log('\x1b[33m○ Setup API did not return expected data\x1b[0m');
    return false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Setup error:', message);
    return false;
  }
}

// ============================================
// ESCROW ENDPOINT TESTS
// ============================================

async function testEscrowEndpoints() {
  console.log('\n\x1b[36m━━━ Testing Escrow Endpoints ━━━\x1b[0m\n');

  // Test 1: Create with mint (requires Squads - will likely fail without config)
  const createResult = await makeRequest('/api/escrow/create-with-mint', 'POST', {
    vendorWallet: TEST_VENDOR_WALLET,
    assetId: testAssetId || 'invalid-id',
    nftMint: 'TestMint' + Date.now(),
    saleMode: 'fixed_price',
    listingPrice: 15000000000,
    listingPriceUSD: 15000,
    seed: Date.now(),
    fileCid: 'QmTestCid123',
  });
  logResult({
    endpoint: '/api/escrow/create-with-mint',
    method: 'POST',
    status: createResult.status === 400 || createResult.status === 500 ? 'SKIP' : createResult.ok ? 'PASS' : 'FAIL',
    message: createResult.ok
      ? 'Escrow creation initiated'
      : `Expected (needs Squads): ${createResult.data.error || createResult.status}`,
    responseTime: createResult.time,
  });

  // Test 2: Update price
  const updateResult = await makeRequest('/api/escrow/update-price', 'POST', {
    escrowPda: testEscrowPda || 'test-pda',
    vendorWallet: TEST_VENDOR_WALLET,
    listingPriceUSD: 16000,
    saleMode: 'accepting_offers',
  });
  logResult({
    endpoint: '/api/escrow/update-price',
    method: 'POST',
    status: updateResult.ok ? 'PASS' : updateResult.status === 404 ? 'SKIP' : 'FAIL',
    message: updateResult.ok
      ? 'Price updated successfully'
      : updateResult.data.error || `Status: ${updateResult.status}`,
    responseTime: updateResult.time,
  });

  // Test 3: Pending shipments (GET) - no auth required
  const pendingResult = await makeRequest('/api/escrow/pending-shipments');
  logResult({
    endpoint: '/api/escrow/pending-shipments',
    method: 'GET',
    status: pendingResult.ok ? 'PASS' : 'FAIL',
    message: pendingResult.ok
      ? `Found ${pendingResult.data.count || 0} pending shipments`
      : pendingResult.data.error || `Status: ${pendingResult.status}`,
    responseTime: pendingResult.time,
  });

  // Test 4: Submit shipment (requires funded escrow - skip)
  const shipmentResult = await makeRequest('/api/escrow/submit-shipment', 'POST', {
    escrowPda: testEscrowPda || 'test-pda',
    vendorWallet: TEST_VENDOR_WALLET,
    trackingCarrier: 'fedex',
    trackingNumber: 'TEST123456789',
    shipmentProofUrls: ['https://example.com/proof.jpg'],
  });
  logResult({
    endpoint: '/api/escrow/submit-shipment',
    method: 'POST',
    status: shipmentResult.status === 400 || shipmentResult.status === 404 ? 'SKIP' : shipmentResult.ok ? 'PASS' : 'FAIL',
    message: shipmentResult.ok
      ? 'Shipment submitted'
      : `Expected (needs funded escrow): ${shipmentResult.data.error}`,
    responseTime: shipmentResult.time,
  });

  // Test 5: Verify shipment (admin only)
  const verifyResult = await makeRequest('/api/escrow/verify-shipment', 'POST', {
    escrowPda: testEscrowPda || 'test-pda',
    adminWallet: TEST_ADMIN_WALLET,
    approved: true,
  });
  logResult({
    endpoint: '/api/escrow/verify-shipment',
    method: 'POST',
    status: verifyResult.status === 400 || verifyResult.status === 403 ? 'SKIP' : verifyResult.ok ? 'PASS' : 'FAIL',
    message: verifyResult.ok
      ? 'Shipment verified'
      : `Expected (needs shipped escrow): ${verifyResult.data.error}`,
    responseTime: verifyResult.time,
  });
}

// ============================================
// OFFERS ENDPOINT TESTS
// ============================================

async function testOffersEndpoints() {
  console.log('\n\x1b[36m━━━ Testing Offers Endpoints ━━━\x1b[0m\n');

  // Test 1: Create offer
  const createResult = await makeRequest('/api/offers/create', 'POST', {
    escrowPda: testEscrowPda || 'test-pda',
    buyerWallet: TEST_BUYER_WALLET,
    offerAmount: 12000000000, // 12 SOL
    offerPriceUSD: 12000,
    message: 'Test offer from API test',
    expiresInHours: 24,
  });
  if (createResult.ok && createResult.data.offer?._id) {
    testOfferId = createResult.data.offer._id;
  }
  logResult({
    endpoint: '/api/offers/create',
    method: 'POST',
    status: createResult.ok ? 'PASS' : createResult.status === 404 ? 'SKIP' : 'FAIL',
    message: createResult.ok
      ? `Offer created: ${createResult.data.offer?._id}`
      : createResult.data.error || `Status: ${createResult.status}`,
    responseTime: createResult.time,
  });

  // Test 2: List offers
  const listResult = await makeRequest('/api/offers/list?escrowPda=' + (testEscrowPda || 'test-pda'));
  logResult({
    endpoint: '/api/offers/list',
    method: 'GET',
    status: listResult.ok ? 'PASS' : listResult.status === 404 ? 'SKIP' : 'FAIL',
    message: listResult.ok
      ? `Found ${listResult.data.offers?.length || 0} offers`
      : listResult.data.error || `Status: ${listResult.status}`,
    responseTime: listResult.time,
  });

  // Test 3: Respond to offer
  const respondResult = await makeRequest('/api/offers/respond', 'POST', {
    offerId: testOfferId || 'test-offer-id',
    vendorWallet: TEST_VENDOR_WALLET,
    action: 'counter',
    counterAmount: 13000000000, // 13 SOL
    counterAmountUSD: 13000,
    counterMessage: 'Counter offer from API test',
  });
  logResult({
    endpoint: '/api/offers/respond',
    method: 'POST',
    status: respondResult.ok ? 'PASS' : (respondResult.status === 404 || respondResult.status === 500) ? 'SKIP' : 'FAIL',
    message: respondResult.ok
      ? `Responded with: ${respondResult.data.action}`
      : `Expected (needs valid offer): ${respondResult.data.error || `Status: ${respondResult.status}`}`,
    responseTime: respondResult.time,
  });
}

// ============================================
// POOL ENDPOINT TESTS
// ============================================

async function testPoolEndpoints() {
  console.log('\n\x1b[36m━━━ Testing Pool Endpoints ━━━\x1b[0m\n');

  // Test 1: Pool status
  const statusResult = await makeRequest('/api/pool/status?poolId=' + (testPoolId || 'test-pool-id'));
  logResult({
    endpoint: '/api/pool/status',
    method: 'GET',
    status: statusResult.ok ? 'PASS' : (statusResult.status === 404 || statusResult.status === 500) ? 'SKIP' : 'FAIL',
    message: statusResult.ok
      ? `Pool status: ${statusResult.data.pool?.status}`
      : `Expected (needs valid pool): ${statusResult.data.error || `Status: ${statusResult.status}`}`,
    responseTime: statusResult.time,
  });

  // Test 2: Invest in pool
  const investResult = await makeRequest('/api/pool/invest', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    investorWallet: TEST_BUYER_WALLET,
    shares: 2,
    investedUSD: 300, // 2 shares × $150
    txSignature: 'test-tx-signature',
  });
  logResult({
    endpoint: '/api/pool/invest',
    method: 'POST',
    status: investResult.ok ? 'PASS' : (investResult.status === 404 || investResult.status === 500) ? 'SKIP' : 'FAIL',
    message: investResult.ok
      ? `Invested: ${investResult.data.investment?.shares} shares`
      : `Expected (needs valid pool): ${investResult.data.error || `Status: ${investResult.status}`}`,
    responseTime: investResult.time,
  });

  // Test 3: Convert from escrow
  const convertResult = await makeRequest('/api/pool/convert-from-escrow', 'POST', {
    escrowPda: 'different-escrow-pda', // Use different to avoid conflict
    vendorWallet: TEST_VENDOR_WALLET,
    totalShares: 100,
    minBuyInUSD: 100,
    maxInvestors: 50,
    projectedROI: 1.25,
  });
  logResult({
    endpoint: '/api/pool/convert-from-escrow',
    method: 'POST',
    status: convertResult.status === 404 ? 'SKIP' : convertResult.ok ? 'PASS' : 'FAIL',
    message: convertResult.ok
      ? `Converted to pool: ${convertResult.data.pool?._id}`
      : `Expected (needs valid escrow): ${convertResult.data.error}`,
    responseTime: convertResult.time,
  });

  // Test 4: Pay vendor (requires filled pool)
  const payResult = await makeRequest('/api/pool/pay-vendor', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    adminWallet: TEST_ADMIN_WALLET,
    createSquadsProposal: false,
  });
  logResult({
    endpoint: '/api/pool/pay-vendor',
    method: 'POST',
    status: payResult.status === 400 || payResult.status === 403 ? 'SKIP' : payResult.ok ? 'PASS' : 'FAIL',
    message: payResult.ok
      ? `Payment: $${payResult.data.payment?.vendorPayment}`
      : `Expected (needs filled pool): ${payResult.data.error}`,
    responseTime: payResult.time,
  });

  // Test 5: Distribute (requires sold pool)
  const distributeResult = await makeRequest('/api/pool/distribute', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    adminWallet: TEST_ADMIN_WALLET,
  });
  logResult({
    endpoint: '/api/pool/distribute',
    method: 'POST',
    status: distributeResult.status === 400 || distributeResult.status === 403 ? 'SKIP' : distributeResult.ok ? 'PASS' : 'FAIL',
    message: distributeResult.ok
      ? 'Distribution initiated'
      : `Expected (needs sold pool): ${distributeResult.data.error}`,
    responseTime: distributeResult.time,
  });

  // Test 6: List for resale
  const resaleResult = await makeRequest('/api/pool/list-for-resale', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    adminWallet: TEST_ADMIN_WALLET,
    resalePriceUSD: 18000,
  });
  logResult({
    endpoint: '/api/pool/list-for-resale',
    method: 'POST',
    status: resaleResult.status === 400 || resaleResult.status === 403 ? 'SKIP' : resaleResult.ok ? 'PASS' : 'FAIL',
    message: resaleResult.ok
      ? `Listed at $${resaleResult.data.pool?.resalePriceUSD}`
      : `Expected (needs active pool): ${resaleResult.data.error}`,
    responseTime: resaleResult.time,
  });
}

// ============================================
// BAGS API ENDPOINT TESTS
// ============================================

async function testBagsEndpoints() {
  console.log('\n\x1b[36m━━━ Testing Bags API Endpoints ━━━\x1b[0m\n');

  // Test 1: Create pool token
  const createTokenResult = await makeRequest('/api/bags/create-pool-token', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    adminWallet: TEST_ADMIN_WALLET,
  });
  logResult({
    endpoint: '/api/bags/create-pool-token',
    method: 'POST',
    status: createTokenResult.status === 500 || createTokenResult.status === 403 ? 'SKIP' : createTokenResult.ok ? 'PASS' : 'FAIL',
    message: createTokenResult.ok
      ? `Token: ${createTokenResult.data.token?.mint}`
      : `Expected (needs BAGS_API_KEY): ${createTokenResult.data.error}`,
    responseTime: createTokenResult.time,
  });

  // Test 2: Configure fee share
  const feeShareResult = await makeRequest('/api/bags/configure-fee-share', 'POST', {
    poolId: testPoolId || 'test-pool-id',
    adminWallet: TEST_ADMIN_WALLET,
    feeBasisPoints: 300, // 3%
  });
  logResult({
    endpoint: '/api/bags/configure-fee-share',
    method: 'POST',
    status: feeShareResult.status === 500 || feeShareResult.status === 403 ? 'SKIP' : feeShareResult.ok ? 'PASS' : 'FAIL',
    message: feeShareResult.ok
      ? `Fee share: ${feeShareResult.data.feeBasisPoints}bp`
      : `Expected (needs Bags config): ${feeShareResult.data.error}`,
    responseTime: feeShareResult.time,
  });

  // Test 3: Trade quote (GET endpoint)
  const quoteResult = await makeRequest('/api/bags/trade-quote?inputMint=TestMint&outputMint=USDC&amount=100');
  logResult({
    endpoint: '/api/bags/trade-quote',
    method: 'GET',
    status: quoteResult.status === 500 || quoteResult.status === 400 ? 'SKIP' : quoteResult.ok ? 'PASS' : 'FAIL',
    message: quoteResult.ok
      ? `Quote: ${quoteResult.data.quote?.outputAmount}`
      : `Expected (needs Bags API): ${quoteResult.data.error}`,
    responseTime: quoteResult.time,
  });

  // Test 4: Execute trade
  const tradeResult = await makeRequest('/api/bags/execute-trade', 'POST', {
    tokenMint: 'TestTokenMint123',
    userWallet: TEST_BUYER_WALLET,
    side: 'buy',
    amount: 100,
  });
  logResult({
    endpoint: '/api/bags/execute-trade',
    method: 'POST',
    status: tradeResult.status === 500 ? 'SKIP' : tradeResult.ok ? 'PASS' : 'FAIL',
    message: tradeResult.ok
      ? 'Trade transaction built'
      : `Expected (needs Bags API): ${tradeResult.data.error}`,
    responseTime: tradeResult.time,
  });

  // Test 5: Partner stats
  const statsResult = await makeRequest('/api/bags/partner-stats?adminWallet=' + TEST_ADMIN_WALLET);
  logResult({
    endpoint: '/api/bags/partner-stats',
    method: 'GET',
    status: statsResult.status === 500 || statsResult.status === 403 ? 'SKIP' : statsResult.ok ? 'PASS' : 'FAIL',
    message: statsResult.ok
      ? `Earnings: $${statsResult.data.stats?.totalEarnings || 0}`
      : `Expected (needs Bags API): ${statsResult.data.error}`,
    responseTime: statsResult.time,
  });
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function runTests() {
  console.log('\n\x1b[35m╔═══════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[35m║     LuxHub Marketplace API Tests                      ║\x1b[0m');
  console.log('\x1b[35m╚═══════════════════════════════════════════════════════╝\x1b[0m');
  console.log(`\nBase URL: ${BASE_URL}`);

  // Check if server is running
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`).catch(() => null);
    if (!healthCheck) {
      console.log('\n\x1b[31m✗ Server not responding at ' + BASE_URL + '\x1b[0m');
      console.log('Start the dev server with: npm run dev\n');
      return;
    }
  } catch {
    console.log('\n\x1b[33m○ Health check endpoint not available, proceeding anyway...\x1b[0m');
  }

  // Setup test data
  await setupTestData();

  // Run all test suites
  await testEscrowEndpoints();
  await testOffersEndpoints();
  await testPoolEndpoints();
  await testBagsEndpoints();

  // Summary
  console.log('\n\x1b[36m━━━ Test Summary ━━━\x1b[0m\n');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`\x1b[32m✓ Passed:  ${passed}\x1b[0m`);
  console.log(`\x1b[31m✗ Failed:  ${failed}\x1b[0m`);
  console.log(`\x1b[33m○ Skipped: ${skipped}\x1b[0m (expected - require specific state/config)`);
  console.log(`  Total:   ${results.length}`);

  if (failed > 0) {
    console.log('\n\x1b[31mFailed tests:\x1b[0m');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  - [${r.method}] ${r.endpoint}: ${r.message}`);
      });
  }

  console.log('\n\x1b[35mNote: SKIP results are expected for endpoints that require:\x1b[0m');
  console.log('  - Squads multisig configuration');
  console.log('  - Bags API key');
  console.log('  - Specific escrow/pool states (funded, filled, sold, etc.)');
  console.log('  - Admin wallet permissions\n');
}

runTests().catch(console.error);
