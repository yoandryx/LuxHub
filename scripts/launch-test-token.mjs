#!/usr/bin/env node
// scripts/launch-test-token.mjs
// Full end-to-end Bags token launch — creates, signs, and sends on mainnet
//
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const API_KEY = process.env.BAGS_API_KEY;
const TREASURY = process.env.NEXT_PUBLIC_LUXHUB_WALLET;
const VENDOR_WALLET = '5FqmUoj9ZszHztsqr8abSapeNcAvzDSR7jcVjAeK3AkD';

// Load vendor keypair
const vendorKeypair = Keypair.fromSecretKey(bs58.decode(process.env.VENDOR_PRIVATE_KEY));
console.log('Vendor wallet:', vendorKeypair.publicKey.toString());

// Mainnet connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

async function signAndSend(label, txBase58) {
  console.log(`  Signing ${label}...`);
  const txBytes = bs58.decode(txBase58);
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([vendorKeypair]);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`  Sent: ${sig}`);

  console.log(`  Waiting for confirmation...`);
  const confirmation = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmation.value.err) {
    throw new Error(`TX failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  console.log(`  ✅ Confirmed!`);
  return sig;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  LuxHub × Bags — LIVE Token Launch Test                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const balance = await connection.getBalance(vendorKeypair.publicKey);
  console.log(`Vendor balance: ${balance / 1e9} SOL\n`);

  // ══════════════════════════════════════════════════════════════
  // STEP 1: Create token info
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 1: Create token info...');
  const formData = new FormData();
  formData.append('name', 'LuxHub Test Launch');
  formData.append('symbol', 'LUX-TST');
  formData.append('description', 'LuxHub integration test token — NOT a real asset. Testing Bags API v2 token launch flow.');
  formData.append('imageUrl', 'https://gateway.irys.xyz/zVwkgyDSWgDghtgGEkuf9yK1cLhnd3EoKDuUoVGGKNd');
  formData.append('website', 'https://luxhub.gold');
  formData.append('twitter', 'https://x.com/LuxHubStudio');

  const infoRes = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY },
    body: formData,
  });

  if (!infoRes.ok) {
    const err = await infoRes.json().catch(() => ({}));
    console.error('❌ Token info failed:', err);
    process.exit(1);
  }

  const infoData = (await infoRes.json()).response;
  const tokenMint = infoData.tokenMint;
  const tokenMetadata = infoData.tokenMetadata;
  console.log(`  ✅ Token Mint: ${tokenMint}`);
  console.log(`  ✅ Metadata:   ${tokenMetadata}\n`);

  // ══════════════════════════════════════════════════════════════
  // STEP 2: Create fee share config
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 2: Create fee share config...');
  console.log(`  Treasury (83.33%): ${TREASURY}`);
  console.log(`  Vendor (16.67%):   ${VENDOR_WALLET}`);

  const feeRes = await fetch(`${BAGS_API_BASE}/fee-share/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      baseMint: tokenMint,
      payer: VENDOR_WALLET,
      claimersArray: [TREASURY, VENDOR_WALLET],
      basisPointsArray: [8333, 1667],
    }),
  });

  if (!feeRes.ok) {
    const err = await feeRes.json().catch(() => ({}));
    console.error('❌ Fee share config failed:', err);
    process.exit(1);
  }

  const feeData = (await feeRes.json()).response;
  const meteoraConfigKey = feeData.meteoraConfigKey;
  const feeShareTxs = feeData.transactions || [];
  console.log(`  ✅ Config Key:     ${meteoraConfigKey}`);
  console.log(`  ✅ Needs Creation: ${feeData.needsCreation}`);
  console.log(`  ✅ TXs to sign:    ${feeShareTxs.length}\n`);

  // ══════════════════════════════════════════════════════════════
  // STEP 3: Sign + send fee share transactions
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 3: Sign + send fee share transactions...');
  const feeShareSigs = [];
  for (let i = 0; i < feeShareTxs.length; i++) {
    const txData = feeShareTxs[i];
    const txBase58 = txData.transaction || txData;
    const sig = await signAndSend(`fee-share tx ${i + 1}/${feeShareTxs.length}`, txBase58);
    feeShareSigs.push(sig);

    // Small delay between txs to ensure ordering
    if (i < feeShareTxs.length - 1) {
      console.log('  Waiting 2s before next tx...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  console.log(`  ✅ All fee share txs confirmed!\n`);

  // Wait for config to propagate
  console.log('  Waiting 5s for on-chain propagation...');
  await new Promise(r => setTimeout(r, 5000));

  // ══════════════════════════════════════════════════════════════
  // STEP 4: Create launch transaction
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 4: Create launch transaction...');
  const launchRes = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
    body: JSON.stringify({
      ipfs: tokenMetadata,
      tokenMint: tokenMint,
      wallet: VENDOR_WALLET,
      initialBuyLamports: 0,
      configKey: meteoraConfigKey,
    }),
  });

  if (!launchRes.ok) {
    const err = await launchRes.json().catch(() => ({}));
    console.error('❌ Launch tx failed:', JSON.stringify(err));
    console.log('  Retrying in 5s...');
    await new Promise(r => setTimeout(r, 5000));

    const retryRes = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        ipfs: tokenMetadata,
        tokenMint: tokenMint,
        wallet: VENDOR_WALLET,
        initialBuyLamports: 0,
        configKey: meteoraConfigKey,
      }),
    });

    if (!retryRes.ok) {
      const retryErr = await retryRes.json().catch(() => ({}));
      console.error('❌ Retry also failed:', JSON.stringify(retryErr));
      process.exit(1);
    }

    var launchData = (await retryRes.json()).response;
  } else {
    var launchData = (await launchRes.json()).response;
  }

  const launchTxBase58 = typeof launchData === 'string' ? launchData : launchData.transaction;
  console.log(`  ✅ Launch TX received (${launchTxBase58.length} chars)\n`);

  // ══════════════════════════════════════════════════════════════
  // STEP 5: Sign + send launch transaction
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 5: Sign + send launch transaction...');
  const launchSig = await signAndSend('launch tx', launchTxBase58);
  console.log('');

  // ══════════════════════════════════════════════════════════════
  // STEP 6: Verify on Bags
  // ══════════════════════════════════════════════════════════════
  console.log('STEP 6: Verify token on Bags...');
  await new Promise(r => setTimeout(r, 3000));

  // Check trade quote to verify token is live
  const quoteRes = await fetch(
    `${BAGS_API_BASE}/trade/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}&amount=10000000`,
    { headers: { 'x-api-key': API_KEY } }
  );

  if (quoteRes.ok) {
    const quote = (await quoteRes.json()).response;
    console.log(`  ✅ Token is LIVE and tradeable!`);
    console.log(`  Quote: 0.01 SOL → ${quote.outAmount} ${tokenMint.slice(0, 8)}... tokens`);
  } else {
    console.log(`  ⚠️  Quote not available yet (may take a moment to index)`);
  }

  // ══════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════
  const finalBalance = await connection.getBalance(vendorKeypair.publicKey);
  const spent = (balance - finalBalance) / 1e9;

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  🎉 TOKEN LAUNCH COMPLETE                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Token Mint:        ${tokenMint}`);
  console.log(`  Metadata:          ${tokenMetadata}`);
  console.log(`  Config Key:        ${meteoraConfigKey}`);
  console.log(`  Fee Share TXs:     ${feeShareSigs.map(s => s.slice(0, 12) + '...').join(', ')}`);
  console.log(`  Launch TX:         ${launchSig}`);
  console.log(`  SOL Spent:         ${spent.toFixed(6)} SOL`);
  console.log(`  Remaining Balance: ${(finalBalance / 1e9).toFixed(6)} SOL`);
  console.log('');
  console.log(`  View on Bags:      https://bags.fm/token/${tokenMint}`);
  console.log(`  View on Solscan:   https://solscan.io/token/${tokenMint}`);
  console.log(`  View on Solana FM: https://solana.fm/address/${tokenMint}`);
  console.log('');
  console.log('  Fee Distribution:');
  console.log(`    Treasury (83.33%): ${TREASURY}`);
  console.log(`    Vendor (16.67%):   ${VENDOR_WALLET}`);
  console.log('');
}

main().catch(e => {
  console.error('\n❌ FATAL:', e.message);
  if (e.logs) console.error('Logs:', e.logs);
  process.exit(1);
});
