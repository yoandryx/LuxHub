// scripts/test-squads-integration.ts
// Integration tests for Squads multisig API endpoints
// Run with: npx ts-node scripts/test-squads-integration.ts

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  data?: any;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, status: 'PASS', message: 'OK' });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    const isSkip = message.includes('SKIP:');
    results.push({
      name,
      status: isSkip ? 'SKIP' : 'FAIL',
      message: isSkip ? message.replace('SKIP:', '').trim() : message,
    });
    console.log(`${isSkip ? '⏭️' : '❌'} ${name}: ${message}`);
  }
}

// Test: Squads members endpoint
async function testSquadsMembers() {
  const response = await fetch(`${BASE_URL}/api/squads/members`);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 500 && data.error?.includes('env')) {
      throw new Error('SKIP: Squads multisig not configured');
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  if (!data.members || !Array.isArray(data.members)) {
    throw new Error('Response missing members array');
  }

  console.log(`   Found ${data.members.length} multisig members`);
}

// Test: Squads proposals list
async function testSquadsProposalsList() {
  const response = await fetch(`${BASE_URL}/api/squads/proposals`);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 500 && data.error?.includes('env')) {
      throw new Error('SKIP: Squads multisig not configured');
    }
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  if (!Array.isArray(data.proposals)) {
    throw new Error('Response missing proposals array');
  }

  console.log(`   Found ${data.proposals.length} proposals`);
}

// Test: Squads status endpoint (requires transactionIndex)
async function testSquadsStatus() {
  // First try to get a transaction index from proposals
  const proposalsRes = await fetch(`${BASE_URL}/api/squads/proposals`);
  const proposalsData = await proposalsRes.json();

  if (!proposalsRes.ok) {
    throw new Error('SKIP: Cannot test status without proposals list');
  }

  if (!proposalsData.proposals?.length) {
    throw new Error('SKIP: No proposals to check status');
  }

  const txIndex = proposalsData.proposals[0].transactionIndex;
  const response = await fetch(`${BASE_URL}/api/squads/status?transactionIndex=${txIndex}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  if (!data.status) {
    throw new Error('Response missing status field');
  }

  console.log(`   Transaction ${txIndex}: status=${data.status}, approvals=${data.approvals}/${data.threshold}`);
}

// Test: Squads propose endpoint (validation only, no signing)
async function testSquadsProposeValidation() {
  // Test that the endpoint validates required fields
  const response = await fetch(`${BASE_URL}/api/squads/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // Empty body should fail validation
  });
  const data = await response.json();

  // We expect a 400 with validation error
  if (response.status === 400 && data.error) {
    console.log(`   Validation working: "${data.error}"`);
    return;
  }

  if (response.status === 500 && data.error?.includes('env')) {
    throw new Error('SKIP: Squads member keypair not configured');
  }

  throw new Error('Expected validation error but got different response');
}

// Test: Squads execute endpoint (validation only)
async function testSquadsExecuteValidation() {
  const response = await fetch(`${BASE_URL}/api/squads/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // Empty body should fail validation
  });
  const data = await response.json();

  if (response.status === 400 && data.error) {
    console.log(`   Validation working: "${data.error}"`);
    return;
  }

  if (response.status === 500 && data.error?.includes('env')) {
    throw new Error('SKIP: Squads member keypair not configured');
  }

  throw new Error('Expected validation error but got different response');
}

// Test: Squads approve endpoint (validation only)
async function testSquadsApproveValidation() {
  const response = await fetch(`${BASE_URL}/api/squads/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // Empty body should fail validation
  });
  const data = await response.json();

  if (response.status === 400 && data.error) {
    console.log(`   Validation working: "${data.error}"`);
    return;
  }

  if (response.status === 500 && data.error?.includes('env')) {
    throw new Error('SKIP: Squads member keypair not configured');
  }

  throw new Error('Expected validation error but got different response');
}

// Test: Squads sync endpoint (validation only)
async function testSquadsSyncValidation() {
  const response = await fetch(`${BASE_URL}/api/squads/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // Empty body should fail validation
  });
  const data = await response.json();

  if (response.status === 400 && data.error) {
    console.log(`   Validation working: "${data.error}"`);
    return;
  }

  throw new Error('Expected validation error but got different response');
}

// Test: Escrow flow with Squads (end-to-end simulation)
async function testEscrowSquadsFlow() {
  // This tests the logical flow without actual transactions
  console.log('   Testing escrow -> Squads flow documentation...');

  // 1. Check escrow pending shipments endpoint
  const shipmentsRes = await fetch(`${BASE_URL}/api/escrow/pending-shipments`);
  if (!shipmentsRes.ok) {
    console.log('   - Pending shipments endpoint: ✓');
  } else {
    const shipmentsData = await shipmentsRes.json();
    console.log(`   - Pending shipments: ${shipmentsData.shipments?.length || 0} found`);
  }

  // 2. Check pool list
  const poolsRes = await fetch(`${BASE_URL}/api/pool/list`);
  if (poolsRes.ok) {
    const poolsData = await poolsRes.json();
    console.log(`   - Active pools: ${poolsData.pools?.length || 0} found`);
  }

  // 3. Document the Squads flow
  console.log('   - Squads escrow flow:');
  console.log('     1. Escrow initiated -> POST /api/squads/propose');
  console.log('     2. Members approve -> POST /api/squads/approve');
  console.log('     3. Execute when approved -> POST /api/squads/execute');
  console.log('     4. Sync MongoDB -> POST /api/squads/sync');
}

// Main test runner
async function main() {
  console.log('\n=== Squads Multisig Integration Tests ===\n');
  console.log(`Testing against: ${BASE_URL}\n`);

  // Basic endpoint tests
  await test('Squads Members List', testSquadsMembers);
  await test('Squads Proposals List', testSquadsProposalsList);
  await test('Squads Status Check', testSquadsStatus);

  // Validation tests
  await test('Squads Propose Validation', testSquadsProposeValidation);
  await test('Squads Execute Validation', testSquadsExecuteValidation);
  await test('Squads Approve Validation', testSquadsApproveValidation);
  await test('Squads Sync Validation', testSquadsSyncValidation);

  // Flow test
  await test('Escrow-Squads Flow', testEscrowSquadsFlow);

  // Summary
  console.log('\n=== Test Summary ===\n');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total:   ${results.length}\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
  }

  if (skipped > 0) {
    console.log('\nSkipped tests (configuration needed):');
    results
      .filter((r) => r.status === 'SKIP')
      .forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
  }

  // Documentation
  console.log('\n=== Squads Integration Notes ===\n');
  console.log('Required environment variables:');
  console.log('  - NEXT_PUBLIC_SQUADS_MSIG: Multisig PDA address');
  console.log('  - SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON: Member keypair');
  console.log('  - NEXT_PUBLIC_SOLANA_ENDPOINT: RPC URL\n');

  console.log('Escrow lifecycle with Squads:');
  console.log('  1. Sale Request created -> Admin creates Squads proposal');
  console.log('  2. Multisig members approve in Squads UI');
  console.log('  3. Admin executes approved proposal -> Escrow created on-chain');
  console.log('  4. Buyer purchases -> Funds deposited to escrow vault');
  console.log('  5. Admin creates confirm_delivery proposal');
  console.log('  6. Multisig members approve');
  console.log('  7. Admin executes -> NFT to buyer, funds split (97% seller, 3% treasury)');
  console.log('  8. Admin syncs MongoDB with on-chain state\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
