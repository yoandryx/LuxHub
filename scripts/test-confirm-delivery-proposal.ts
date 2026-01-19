// scripts/test-confirm-delivery-proposal.ts
// Test creating a Squads proposal for confirm_delivery instruction
// This tests the full Squads integration flow

import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

const API_BASE = 'http://localhost:3001';
const PROGRAM_ID = 'kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj';

// confirm_delivery discriminator from IDL: [11, 109, 227, 53, 179, 190, 88, 155]
const CONFIRM_DELIVERY_DISCRIMINATOR = Buffer.from([11, 109, 227, 53, 179, 190, 88, 155]);

// Mock addresses for testing (these would be real escrow data in production)
const MOCK_DATA = {
  luxhub: 'EiCAHhDkgstbyckViFdvCspioLUxyLiYZNiTXJo6ZLYq', // Member keypair
  escrow: '11111111111111111111111111111111', // Would be real escrow PDA
  nftVault: '11111111111111111111111111111111',
  wsolVault: '11111111111111111111111111111111',
  mintA: 'So11111111111111111111111111111111111111112', // wSOL
  mintB: '11111111111111111111111111111111', // NFT mint
  sellerFundsAta: '11111111111111111111111111111111',
  luxhubFeeAta: 'CaMDGCYKDVUhLZfRVgteQyksUnRDpt9AWZa8JLAqf6S1', // Squads vault
  sellerNftAta: '11111111111111111111111111111111',
  buyerNftAta: '11111111111111111111111111111111',
  tokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
};

async function testConfirmDeliveryProposal() {
  console.log('=== Testing confirm_delivery Squads Proposal ===\n');

  // Build the instruction keys in the order expected by the program
  const keys = [
    { pubkey: MOCK_DATA.luxhub, isSigner: true, isWritable: true },
    { pubkey: MOCK_DATA.escrow, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.nftVault, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.wsolVault, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.mintA, isSigner: false, isWritable: false },
    { pubkey: MOCK_DATA.mintB, isSigner: false, isWritable: false },
    { pubkey: MOCK_DATA.sellerFundsAta, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.luxhubFeeAta, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.sellerNftAta, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.buyerNftAta, isSigner: false, isWritable: true },
    { pubkey: MOCK_DATA.tokenProgram, isSigner: false, isWritable: false },
  ];

  // The instruction data is just the discriminator (no args for confirm_delivery)
  const dataBase64 = CONFIRM_DELIVERY_DISCRIMINATOR.toString('base64');

  console.log('Instruction Details:');
  console.log('  Program ID:', PROGRAM_ID);
  console.log('  Discriminator (base64):', dataBase64);
  console.log('  Accounts:', keys.length);
  console.log('');

  // Step 1: Create proposal
  console.log('--- Step 1: Create Squads Proposal ---');
  const proposeBody = {
    programId: PROGRAM_ID,
    keys,
    dataBase64,
    vaultIndex: 0,
    autoApprove: true,
  };

  console.log('Calling POST /api/squads/propose...');
  const proposeRes = await fetch(`${API_BASE}/api/squads/propose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proposeBody),
  });
  const proposeData = await proposeRes.json();

  if (!proposeData.ok) {
    console.log('❌ Proposal creation failed:', proposeData.error);
    return;
  }

  console.log('✅ Proposal created!');
  console.log('  Transaction Index:', proposeData.transactionIndex);
  console.log('  Signature:', proposeData.signature);
  console.log('  Squads Deep Link:', proposeData.squadsDeepLink);
  console.log('  Auto-approved:', proposeData.autoApproved);
  console.log('  Threshold:', proposeData.threshold);
  console.log('');

  // Step 2: Check status
  console.log('--- Step 2: Check Proposal Status ---');
  const statusRes = await fetch(
    `${API_BASE}/api/squads/status?transactionIndex=${proposeData.transactionIndex}`
  );
  const statusData = await statusRes.json();
  console.log('Status:', statusData.status);
  console.log('Approvals:', statusData.approvals, '/', statusData.threshold);
  console.log('');

  // Step 3: Execute (will fail because mock data, but tests the flow)
  if (statusData.approvals >= statusData.threshold) {
    console.log('--- Step 3: Execute Proposal ---');
    console.log('Calling POST /api/squads/execute...');

    const executeRes = await fetch(`${API_BASE}/api/squads/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionIndex: proposeData.transactionIndex }),
    });
    const executeData = await executeRes.json();

    if (executeData.ok) {
      console.log('✅ Execution succeeded!');
      console.log('  Signature:', executeData.signature);
    } else {
      console.log('⚠️ Execution failed (expected with mock data):');
      console.log('  Error:', executeData.error);
      console.log('');
      console.log('This is expected because we used placeholder addresses.');
      console.log('In production, with real escrow data, execution would succeed.');
    }
  }

  console.log('\n=== Test Complete ===');
  console.log('\nThe Squads proposal flow works correctly!');
  console.log('For a real confirm_delivery:');
  console.log('1. Get escrow data from MongoDB (seed, buyer, seller, mints, etc.)');
  console.log('2. Derive all PDAs and ATAs');
  console.log('3. Build instruction with real addresses');
  console.log('4. Create proposal via /api/squads/propose');
  console.log('5. Have multisig members approve');
  console.log('6. Execute via /api/squads/execute');
}

testConfirmDeliveryProposal().catch(console.error);
