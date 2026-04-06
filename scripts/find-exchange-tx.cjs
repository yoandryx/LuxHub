// Find the buyer's exchange() tx for a given escrow PDA
// Usage: node scripts/find-exchange-tx.cjs <escrowPda>
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const pda = process.argv[2];
  if (!pda) {
    console.error('Usage: node scripts/find-exchange-tx.cjs <escrowPda>');
    process.exit(1);
  }

  const endpoint =
    process.env.HELIUS_ENDPOINT ||
    process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ||
    'https://api.mainnet-beta.solana.com';
  console.log(`Using RPC: ${endpoint.replace(/api-key=[^&]+/, 'api-key=***')}`);
  const connection = new Connection(endpoint, {
    commitment: 'confirmed',
    httpHeaders: { 'User-Agent': 'luxhub-diagnose' },
  });
  const pubkey = new PublicKey(pda);

  console.log(`Fetching signatures for escrow PDA ${pda}...`);
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 20 });
  console.log(`Found ${sigs.length} signatures:\n`);

  for (const s of sigs) {
    const dt = s.blockTime ? new Date(s.blockTime * 1000).toISOString() : 'unknown';
    console.log(`- ${s.signature}  (${dt})  err=${s.err ? 'YES' : 'no'}`);
  }

  console.log('\nFetching details for each tx to find buyer wallet...\n');
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await connection.getTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) continue;
    const signers = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys.slice(0, tx.transaction.message.header.numRequiredSignatures)
      .map((k) => k.toBase58());
    const logs = tx.meta?.logMessages || [];
    const isExchange = logs.some((l) => l.toLowerCase().includes('exchange'));
    const isInit = logs.some((l) => l.toLowerCase().includes('initialize'));
    console.log(`sig: ${s.signature}`);
    console.log(`  signers: ${signers.join(', ')}`);
    console.log(`  type: ${isExchange ? 'EXCHANGE' : isInit ? 'INITIALIZE' : 'other'}`);
    console.log(`  time: ${s.blockTime ? new Date(s.blockTime * 1000).toISOString() : 'n/a'}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
