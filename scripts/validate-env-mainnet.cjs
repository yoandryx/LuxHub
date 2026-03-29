#!/usr/bin/env node
/**
 * Pre-flight env validation for Phase 07-02: Squads confirm_delivery
 * Tests every dependency we'll hit during development.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const results = [];
let failures = 0;

function check(name, test, detail) {
  const pass = test();
  if (!pass) failures++;
  results.push({ name, pass, detail: detail || '' });
}

function header(section) {
  results.push({ header: section });
}

// ── 1. Core Env Vars ──
header('Core Environment Variables');

check('NEXT_PUBLIC_SOLANA_NETWORK = mainnet-beta', () => {
  const v = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  return v === 'mainnet-beta';
}, `Got: "${process.env.NEXT_PUBLIC_SOLANA_NETWORK}"`);

check('NEXT_PUBLIC_SOLANA_ENDPOINT is mainnet Helius', () => {
  const v = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || '';
  return v.includes('mainnet.helius-rpc.com');
}, `Got: "${(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || '').substring(0, 50)}..."`);

check('PROGRAM_ID set', () => {
  return !!process.env.PROGRAM_ID && process.env.PROGRAM_ID.length > 30;
}, `Got: "${process.env.PROGRAM_ID}"`);

check('ESCROW_CONFIG_PDA set', () => {
  return !!process.env.ESCROW_CONFIG_PDA && process.env.ESCROW_CONFIG_PDA.length > 30;
}, `Got: "${process.env.ESCROW_CONFIG_PDA}"`);

check('MONGODB_URI points to luxhub-mainnet', () => {
  const v = process.env.MONGODB_URI || '';
  return v.includes('luxhub-mainnet');
}, `Got DB: "${(process.env.MONGODB_URI || '').match(/\/([^?]+)/)?.[1] || 'unknown'}"`);

// ── 2. Squads Config ──
header('Squads Multisig (confirm_delivery)');

check('NEXT_PUBLIC_SQUADS_MSIG set', () => {
  return !!process.env.NEXT_PUBLIC_SQUADS_MSIG && process.env.NEXT_PUBLIC_SQUADS_MSIG.length > 30;
}, `Got: "${process.env.NEXT_PUBLIC_SQUADS_MSIG}"`);

check('SQUADS_AUTO_APPROVE set', () => {
  return process.env.SQUADS_AUTO_APPROVE !== undefined;
}, `Got: "${process.env.SQUADS_AUTO_APPROVE}"`);

const keypairPath = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
const keypairJson = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
check('Squads member keypair available (PATH or JSON)', () => {
  if (keypairJson) return true;
  if (keypairPath && fs.existsSync(keypairPath)) return true;
  return false;
}, keypairJson ? 'Using SQUADS_MEMBER_KEYPAIR_JSON' : `PATH: "${keypairPath}" exists: ${keypairPath ? fs.existsSync(keypairPath) : 'not set'}`);

// ── 3. Wallet & Treasury ──
header('Wallets & Treasury');

check('NEXT_PUBLIC_LUXHUB_WALLET set', () => {
  return !!process.env.NEXT_PUBLIC_LUXHUB_WALLET;
}, `Got: "${process.env.NEXT_PUBLIC_LUXHUB_WALLET}"`);

check('ADMIN_WALLETS set', () => {
  return !!process.env.ADMIN_WALLETS;
}, `Count: ${(process.env.ADMIN_WALLETS || '').split(',').filter(Boolean).length}`);

// ── 4. Storage & Services ──
header('Storage & Services');

check('IRYS_NETWORK = mainnet', () => {
  return process.env.IRYS_NETWORK === 'mainnet';
}, `Got: "${process.env.IRYS_NETWORK}"`);

check('IRYS_PRIVATE_KEY set', () => {
  return !!process.env.IRYS_PRIVATE_KEY && process.env.IRYS_PRIVATE_KEY.length > 30;
}, 'Present: ' + (!!process.env.IRYS_PRIVATE_KEY));

check('RESEND_API_KEY set (notifications)', () => {
  return !!process.env.RESEND_API_KEY;
}, 'Present: ' + (!!process.env.RESEND_API_KEY));

check('JWT_SECRET set', () => {
  return !!process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32;
}, `Length: ${(process.env.JWT_SECRET || '').length}`);

check('PII_ENCRYPTION_KEY set', () => {
  return !!process.env.PII_ENCRYPTION_KEY && process.env.PII_ENCRYPTION_KEY.length === 64;
}, `Length: ${(process.env.PII_ENCRYPTION_KEY || '').length}`);

// ── 5. Connectivity Tests ──
header('Connectivity (live checks)');

async function testRpc() {
  try {
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
    });
    const data = await res.json();
    return { pass: data.result === 'ok', detail: `Health: ${data.result || JSON.stringify(data.error)}` };
  } catch (e) {
    return { pass: false, detail: `Error: ${e.message}` };
  }
}

async function testMongo() {
  try {
    const mongoose = require('mongoose');
    const uri = process.env.MONGODB_URI;
    const conn = await mongoose.createConnection(uri).asPromise();
    const collections = await conn.db.listCollections().toArray();
    const names = collections.map(c => c.name);
    const hasEscrows = names.includes('escrows');
    const hasAssets = names.includes('assets');
    const hasUsers = names.includes('users');
    await conn.close();
    return {
      pass: hasEscrows && hasAssets && hasUsers,
      detail: `${collections.length} collections. escrows:${hasEscrows} assets:${hasAssets} users:${hasUsers}`
    };
  } catch (e) {
    return { pass: false, detail: `Error: ${e.message}` };
  }
}

async function testSquadsPda() {
  try {
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const msig = process.env.NEXT_PUBLIC_SQUADS_MSIG;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [msig, { encoding: 'base64' }]
      }),
    });
    const data = await res.json();
    const exists = !!data.result?.value;
    const size = data.result?.value?.data?.[0]?.length || 0;
    return { pass: exists, detail: exists ? `Account exists (data size: ${size} bytes)` : 'Account NOT found on-chain' };
  } catch (e) {
    return { pass: false, detail: `Error: ${e.message}` };
  }
}

async function testEscrowConfig() {
  try {
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const pda = process.env.ESCROW_CONFIG_PDA;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [pda, { encoding: 'base64' }]
      }),
    });
    const data = await res.json();
    const exists = !!data.result?.value;
    return { pass: exists, detail: exists ? 'EscrowConfig PDA exists on-chain' : 'EscrowConfig PDA NOT found' };
  } catch (e) {
    return { pass: false, detail: `Error: ${e.message}` };
  }
}

async function testProgramDeployed() {
  try {
    const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const pid = process.env.PROGRAM_ID;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getAccountInfo',
        params: [pid, { encoding: 'base64' }]
      }),
    });
    const data = await res.json();
    const exists = !!data.result?.value;
    const executable = data.result?.value?.executable || false;
    return { pass: exists && executable, detail: exists ? `Exists, executable: ${executable}` : 'Program NOT found on-chain' };
  } catch (e) {
    return { pass: false, detail: `Error: ${e.message}` };
  }
}

// ── Run all checks ──
async function main() {
  const rpc = await testRpc();
  check('Solana RPC responds (mainnet)', () => rpc.pass, rpc.detail);

  const mongo = await testMongo();
  check('MongoDB connects (luxhub-mainnet)', () => mongo.pass, mongo.detail);

  const squads = await testSquadsPda();
  check('Squads multisig account exists on-chain', () => squads.pass, squads.detail);

  const escrow = await testEscrowConfig();
  check('EscrowConfig PDA exists on-chain', () => escrow.pass, escrow.detail);

  const program = await testProgramDeployed();
  check('Anchor program deployed & executable', () => program.pass, program.detail);

  // ── Print results ──
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  PRE-FLIGHT: Phase 07-02 Environment Validation            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const r of results) {
    if (r.header) {
      console.log(`\n  ── ${r.header} ──`);
      continue;
    }
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (r.detail && !r.pass) {
      console.log(`     └─ ${r.detail}`);
    }
  }

  console.log('\n' + '─'.repeat(62));
  const total = results.filter(r => !r.header).length;
  const passed = results.filter(r => !r.header && r.pass).length;
  if (failures === 0) {
    console.log(`  ✅ ALL ${total} CHECKS PASSED — ready to develop`);
  } else {
    console.log(`  ❌ ${failures}/${total} FAILED — fix before proceeding`);
  }
  console.log('─'.repeat(62));
  console.log('');

  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Validation script error:', e);
  process.exit(1);
});
