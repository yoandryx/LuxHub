/**
 * Fund Irys node with SOL for mainnet uploads.
 *
 * Usage:
 *   node scripts/fund-irys.cjs [amount_in_sol]
 *
 * Defaults to 0.05 SOL which covers ~50 mints.
 * Uses the deploy wallet (keys/mainnet/deploy.json).
 */
require('dotenv').config({ path: '.env.local' });

const { Keypair, Connection, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');

async function main() {
  const amountSOL = parseFloat(process.argv[2] || '0.05');
  const amountLamports = Math.round(amountSOL * LAMPORTS_PER_SOL);

  // Load deploy keypair
  const keypairPath = path.resolve(__dirname, '..', 'keys', 'mainnet', 'deploy.json');
  if (!fs.existsSync(keypairPath)) {
    console.error('Deploy keypair not found at:', keypairPath);
    process.exit(1);
  }

  const secret = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

  console.log('=== Irys Node Funding ===');
  console.log('Wallet:  ', keypair.publicKey.toBase58());
  console.log('Amount:  ', amountSOL, 'SOL');
  console.log('');

  // Check wallet balance first
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const balance = await connection.getBalance(keypair.publicKey);
  console.log('Wallet balance:', (balance / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  if (balance < amountLamports + 10000) {
    console.error(`Insufficient balance. Need ${amountSOL} SOL + fees.`);
    process.exit(1);
  }

  // Dynamic import for Irys (ESM modules)
  const { Uploader } = await import('@irys/upload');
  const { Solana } = await import('@irys/upload-solana');

  console.log('\nInitializing Irys (mainnet)...');
  const irys = await Uploader(Solana)
    .withWallet(keypair.secretKey)
    .withRpc(rpcUrl);

  // Check current balance
  const currentBalance = await irys.getLoadedBalance();
  console.log('Current Irys balance:', currentBalance.toString(), 'lamports');
  console.log('                     ', (Number(currentBalance) / LAMPORTS_PER_SOL).toFixed(6), 'SOL');

  // Fund
  console.log(`\nFunding ${amountSOL} SOL (${amountLamports} lamports)...`);
  const fundTx = await irys.fund(amountLamports);
  console.log('Fund TX:', fundTx.id);

  // Check new balance
  const newBalance = await irys.getLoadedBalance();
  console.log('\nNew Irys balance:', newBalance.toString(), 'lamports');
  console.log('                 ', (Number(newBalance) / LAMPORTS_PER_SOL).toFixed(6), 'SOL');
  console.log('\nIrys funded successfully!');
  console.log(`Estimated mints remaining: ~${Math.floor(Number(newBalance) / 3000000)}`);
}

main().catch(err => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
