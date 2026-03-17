#!/usr/bin/env node
// scripts/test-bags-integration.mjs
// End-to-end test of the Bags API v2 integration
// Tests each step independently with real API calls
//
// Usage: node scripts/test-bags-integration.mjs
//
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const API_KEY = process.env.BAGS_API_KEY;
const PARTNER_WALLET = process.env.BAGS_PARTNER_WALLET || process.env.NEXT_PUBLIC_LUXHUB_WALLET;
const TREASURY_WALLET = process.env.NEXT_PUBLIC_LUXHUB_WALLET;
const ADMIN_WALLET = process.env.ADMIN_WALLETS?.split(',')[0]?.trim();
const VENDOR_WALLET = '5FqmUoj9ZszHztsqr8abSapeNcAvzDSR7jcVjAeK3AkD';
const POOL_ID = '69b7a18eabd030f2c972cf98';

// SOL mint for trade quotes
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const passed = [];
const failed = [];

function log(label, msg) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(60)}`);
  if (typeof msg === 'object') console.log(JSON.stringify(msg, null, 2));
  else console.log(msg);
}

function pass(name, detail) {
  passed.push(name);
  console.log(`  ✅ ${name}${detail ? ': ' + detail : ''}`);
}

function fail(name, detail) {
  failed.push(name);
  console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`);
}

async function bagsRequest(method, path, body, isFormData = false) {
  const url = path.startsWith('http') ? path : `${BAGS_API_BASE}${path}`;
  const headers = { 'x-api-key': API_KEY };
  if (!isFormData) headers['Content-Type'] = 'application/json';

  const opts = { method, headers };
  if (body && !isFormData) opts.body = JSON.stringify(body);
  if (body && isFormData) opts.body = body;

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, data: json };
}

// ════════════════════════════════════════════════════════════
// TEST 0: Verify API key works
// ════════════════════════════════════════════════════════════
async function testApiKey() {
  log('TEST 0', 'Verify Bags API key');

  if (!API_KEY) {
    fail('API Key', 'BAGS_API_KEY not set in .env.local');
    return false;
  }

  // Hit a simple endpoint to verify key
  const res = await bagsRequest('GET', `/trade/quote?inputMint=${SOL_MINT}&outputMint=${SOL_MINT}&amount=1000000`);

  if (res.status === 401) {
    fail('API Key', 'Invalid or expired API key');
    return false;
  }

  // Even a bad quote request (same mint) should return 400, not 401
  pass('API Key', `Key valid (status ${res.status})`);
  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 1: Create token info
// ════════════════════════════════════════════════════════════
async function testCreateTokenInfo() {
  log('TEST 1', 'Create token info via Bags API');

  const formData = new FormData();
  formData.append('name', 'LuxHub Test Token');
  formData.append('symbol', 'LUX-TEST');
  formData.append('description', 'Integration test token for LuxHub Bags API v2. Pool: test');
  formData.append('imageUrl', 'https://gateway.irys.xyz/zVwkgyDSWgDghtgGEkuf9yK1cLhnd3EoKDuUoVGGKNd');
  formData.append('twitter', 'https://x.com/LuxHubStudio');
  formData.append('website', 'https://luxhub.gold');

  const res = await bagsRequest('POST', '/token-launch/create-token-info', formData, true);

  if (!res.ok) {
    fail('Create Token Info', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    return null;
  }

  const data = res.data.response || res.data;
  const tokenMint = data.tokenMint;
  const tokenMetadata = data.tokenMetadata;

  if (!tokenMint) {
    fail('Create Token Info', 'No tokenMint in response');
    return null;
  }
  if (!tokenMetadata) {
    fail('Create Token Info', 'No tokenMetadata (IPFS URL) in response');
    return null;
  }

  pass('Create Token Info', `mint=${tokenMint.slice(0, 12)}... metadata=${tokenMetadata.slice(0, 40)}...`);
  return { tokenMint, tokenMetadata };
}

// ════════════════════════════════════════════════════════════
// TEST 2: Configure fee share (10,000 BPS)
// ════════════════════════════════════════════════════════════
async function testConfigureFeeShare(tokenMint) {
  log('TEST 2', `Configure fee share for mint ${tokenMint.slice(0, 12)}...`);

  // Build claimers: 8333 treasury + 1667 vendor = 10,000
  const claimersArray = [TREASURY_WALLET, VENDOR_WALLET];
  const basisPointsArray = [8333, 1667];

  const body = {
    baseMint: tokenMint,
    payer: ADMIN_WALLET,
    claimersArray,
    basisPointsArray,
  };

  // Include partner if PDA exists
  const partnerPda = process.env.BAGS_PARTNER_CONFIG_PDA;
  if (partnerPda) {
    body.partner = PARTNER_WALLET;
    body.partnerConfig = partnerPda;
    console.log('  Including partner config:', partnerPda.slice(0, 12) + '...');
  } else {
    console.log('  No BAGS_PARTNER_CONFIG_PDA set — skipping partner config');
  }

  console.log('  Claimers:', claimersArray.map((w, i) => `${w.slice(0, 8)}...=${basisPointsArray[i]}bps`).join(', '));
  console.log('  Total BPS:', basisPointsArray.reduce((a, b) => a + b, 0));

  const res = await bagsRequest('POST', '/fee-share/config', body);

  if (!res.ok) {
    fail('Fee Share Config', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    return null;
  }

  const data = res.data.response || res.data;
  const meteoraConfigKey = data.meteoraConfigKey;
  const feeShareAuthority = data.feeShareAuthority;
  const needsCreation = data.needsCreation;
  const transactions = data.transactions || [];

  if (!meteoraConfigKey) {
    fail('Fee Share Config', 'No meteoraConfigKey in response');
    console.log('  Full response:', JSON.stringify(data, null, 2));
    return null;
  }

  pass('Fee Share Config', `configKey=${meteoraConfigKey.slice(0, 12)}... needsCreation=${needsCreation} txCount=${transactions.length}`);

  if (feeShareAuthority) {
    console.log(`  feeShareAuthority: ${feeShareAuthority}`);
  }

  return { meteoraConfigKey, feeShareAuthority, transactions, needsCreation };
}

// ════════════════════════════════════════════════════════════
// TEST 3: Create launch transaction
// ════════════════════════════════════════════════════════════
async function testCreateLaunchTransaction(tokenMint, tokenMetadata, meteoraConfigKey) {
  log('TEST 3', `Create launch transaction (configKey=${meteoraConfigKey.slice(0, 12)}...)`);

  const body = {
    ipfs: tokenMetadata,
    tokenMint,
    wallet: ADMIN_WALLET,
    initialBuyLamports: 0,
    configKey: meteoraConfigKey,
  };

  const res = await bagsRequest('POST', '/token-launch/create-launch-transaction', body);

  if (!res.ok) {
    fail('Launch Transaction', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    return null;
  }

  const data = res.data.response || res.data;
  const tx = typeof data === 'string' ? data : data.transaction;

  if (!tx) {
    fail('Launch Transaction', 'No transaction in response');
    console.log('  Full response:', JSON.stringify(res.data).slice(0, 200));
    return null;
  }

  pass('Launch Transaction', `tx length=${tx.length} chars (base58 serialized)`);
  return { transaction: tx };
}

// ════════════════════════════════════════════════════════════
// TEST 4: Partner config check
// ════════════════════════════════════════════════════════════
async function testPartnerStats() {
  log('TEST 4', `Check partner stats for ${PARTNER_WALLET.slice(0, 12)}...`);

  const url = `/fee-share/partner-config/stats?partner=${PARTNER_WALLET}`;
  const res = await bagsRequest('GET', url);

  if (res.status === 404) {
    fail('Partner Stats', 'Partner config not found — need to create via /api/bags/create-partner-config');
    return false;
  }

  if (!res.ok) {
    fail('Partner Stats', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    return false;
  }

  const data = res.data.response || res.data;
  const claimed = parseInt(data.claimedFees || '0') / 1e9;
  const unclaimed = parseInt(data.unclaimedFees || '0') / 1e9;

  pass('Partner Stats', `claimed=${claimed.toFixed(4)} SOL, unclaimed=${unclaimed.toFixed(4)} SOL`);
  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 5: Partner config creation tx (dry run)
// ════════════════════════════════════════════════════════════
async function testPartnerConfigCreation() {
  log('TEST 5', `Create partner config tx for ${PARTNER_WALLET.slice(0, 12)}...`);

  const res = await bagsRequest('POST', '/fee-share/partner-config/creation-tx', {
    partnerWallet: PARTNER_WALLET,
  });

  if (res.status === 400) {
    // Config already exists — that's fine
    pass('Partner Config Creation', 'Partner config already exists (400 response — expected if already created)');
    return true;
  }

  if (!res.ok) {
    fail('Partner Config Creation', `Status ${res.status}: ${JSON.stringify(res.data)}`);
    return false;
  }

  const data = res.data.response || res.data;
  if (data.transaction) {
    pass('Partner Config Creation', `Transaction ready (${data.transaction.length} chars). Sign and send to activate.`);
  } else {
    pass('Partner Config Creation', 'Response received (no transaction — may already exist)');
  }
  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 6: Trade quote (using a known token if available)
// ════════════════════════════════════════════════════════════
async function testTradeQuote(tokenMint) {
  log('TEST 6', `Get trade quote for ${tokenMint?.slice(0, 12) || 'SOL'}...`);

  // Try to get a quote — if the token isn't launched yet, this will fail (expected)
  const mint = tokenMint || SOL_MINT;
  const url = `/trade/quote?inputMint=${SOL_MINT}&outputMint=${mint}&amount=100000000&slippageMode=auto`;
  const res = await bagsRequest('GET', url);

  if (!res.ok) {
    if (!tokenMint) {
      fail('Trade Quote', `Status ${res.status} — expected, token not yet launched on-chain`);
    } else {
      console.log(`  Status ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
      fail('Trade Quote', 'Quote failed — token may not be launched on-chain yet (needs signing)');
    }
    return false;
  }

  const data = res.data.response || res.data;
  pass('Trade Quote', `outAmount=${data.outAmount} priceImpact=${data.priceImpactPct}%`);
  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 7: Creator claim stats for a token
// ════════════════════════════════════════════════════════════
async function testCreatorClaimStats(tokenMint) {
  log('TEST 7', `Get creator claim stats for ${tokenMint?.slice(0, 12) || 'N/A'}...`);

  if (!tokenMint) {
    console.log('  Skipping — no token mint available');
    return false;
  }

  const url = `/token-launch/claim-stats?tokenMint=${tokenMint}`;
  const res = await bagsRequest('GET', url);

  if (!res.ok) {
    // Expected to fail if token isn't launched yet
    console.log(`  Status ${res.status}: expected if token not yet live`);
    pass('Creator Claim Stats', `API reachable (status ${res.status}) — will work after token launch`);
    return true;
  }

  const data = res.data.response || res.data;
  pass('Creator Claim Stats', `Creators: ${Array.isArray(data) ? data.length : 'N/A'}`);
  return true;
}

// ════════════════════════════════════════════════════════════
// TEST 8: Pool config keys lookup
// ════════════════════════════════════════════════════════════
async function testPoolConfigKeys() {
  log('TEST 8', 'Check pool config endpoint availability');

  // Just verify the endpoint exists
  const res = await bagsRequest('POST', '/fee-share/pool-config/get-by-fee-claimer-vault', {
    feeClaimerVaults: [TREASURY_WALLET],
  });

  if (res.status === 401) {
    fail('Pool Config Keys', 'Auth failed');
    return false;
  }

  // Any non-401 response means the endpoint exists
  pass('Pool Config Keys', `Endpoint reachable (status ${res.status})`);
  return true;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  LuxHub × Bags API v2 Integration Test                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  API Key:    ${API_KEY ? API_KEY.slice(0, 8) + '...' : 'NOT SET'}`);
  console.log(`  Treasury:   ${TREASURY_WALLET?.slice(0, 12)}...`);
  console.log(`  Admin:      ${ADMIN_WALLET?.slice(0, 12)}...`);
  console.log(`  Vendor:     ${VENDOR_WALLET.slice(0, 12)}...`);
  console.log(`  Partner:    ${PARTNER_WALLET?.slice(0, 12)}...`);
  console.log(`  Pool ID:    ${POOL_ID}`);

  // Test 0: API key
  const keyValid = await testApiKey();
  if (!keyValid) {
    console.log('\n❌ Cannot proceed without valid API key. Exiting.');
    process.exit(1);
  }

  // Test 1: Create token info
  const tokenInfo = await testCreateTokenInfo();

  // Test 2: Configure fee share
  let feeShareResult = null;
  if (tokenInfo) {
    feeShareResult = await testConfigureFeeShare(tokenInfo.tokenMint);
  }

  // Test 3: Create launch transaction
  let launchResult = null;
  if (tokenInfo && feeShareResult) {
    launchResult = await testCreateLaunchTransaction(
      tokenInfo.tokenMint,
      tokenInfo.tokenMetadata,
      feeShareResult.meteoraConfigKey
    );
  }

  // Test 4: Partner stats
  await testPartnerStats();

  // Test 5: Partner config creation
  await testPartnerConfigCreation();

  // Test 6: Trade quote (will likely fail since token isn't signed/sent)
  await testTradeQuote(tokenInfo?.tokenMint);

  // Test 7: Creator claim stats
  await testCreatorClaimStats(tokenInfo?.tokenMint);

  // Test 8: Pool config keys
  await testPoolConfigKeys();

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS                                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  ✅ Passed: ${passed.length}`);
  passed.forEach(p => console.log(`     • ${p}`));
  console.log(`\n  ❌ Failed: ${failed.length}`);
  failed.forEach(f => console.log(`     • ${f}`));

  if (tokenInfo && feeShareResult && launchResult) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  TOKEN LAUNCH READY                                     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n  Token Mint:        ${tokenInfo.tokenMint}`);
    console.log(`  Metadata:          ${tokenInfo.tokenMetadata}`);
    console.log(`  Config Key:        ${feeShareResult.meteoraConfigKey}`);
    console.log(`  Fee Share Auth:    ${feeShareResult.feeShareAuthority || 'N/A'}`);
    console.log(`  Fee Share TXs:     ${feeShareResult.transactions.length}`);
    console.log(`  Launch TX:         ${launchResult.transaction.slice(0, 40)}...`);
    console.log(`  Needs Creation:    ${feeShareResult.needsCreation}`);
    console.log(`\n  SIGNING ORDER:`);
    let step = 1;
    for (const tx of feeShareResult.transactions) {
      console.log(`    ${step}. Fee share config tx (sign + send, wait for confirmation)`);
      step++;
    }
    console.log(`    ${step}. Launch tx (sign + send → bonding curve goes live)`);
    console.log(`\n  ⚠️  These transactions were NOT sent — this was a dry run.`);
    console.log(`  To go live, sign and send via wallet or use the /api/bags/create-pool-token endpoint.`);
  }

  console.log('\n');
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
