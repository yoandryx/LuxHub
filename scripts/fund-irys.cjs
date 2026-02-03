// Script to fund Irys account with devnet SOL
require('dotenv').config({ path: '.env.local' });

const Irys = require('@irys/sdk').default;

async function main() {
  const privateKey = process.env.IRYS_PRIVATE_KEY;
  const network = process.env.IRYS_NETWORK || 'devnet';

  if (!privateKey) {
    console.error('❌ IRYS_PRIVATE_KEY not set in .env.local');
    process.exit(1);
  }

  console.log('🔗 Connecting to Irys', network, 'network...');

  const irys = new Irys({
    network,
    token: 'solana',
    key: privateKey,
    config: { providerUrl: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com' }
  });

  // Check current balance
  const balance = await irys.getLoadedBalance();
  const balanceInSol = Number(balance) / 1e9;
  console.log('💰 Current Irys balance:', balanceInSol.toFixed(6), 'SOL');

  // Fund with 0.1 SOL if balance is low
  const fundAmount = 100000000; // 0.1 SOL in lamports

  if (balance < 50000000) { // Less than 0.05 SOL
    console.log('📤 Funding Irys with 0.1 SOL...');
    try {
      const fundTx = await irys.fund(fundAmount);
      console.log('✅ Funded! Transaction ID:', fundTx.id);

      const newBalance = await irys.getLoadedBalance();
      console.log('💰 New balance:', (Number(newBalance) / 1e9).toFixed(6), 'SOL');
    } catch (err) {
      console.error('❌ Funding failed:', err.message);
      console.log('\n📋 Make sure your wallet has devnet SOL.');
      console.log('   Get free devnet SOL at: https://faucet.solana.com');
    }
  } else {
    console.log('✅ Balance is sufficient for uploads');
  }
}

main().catch(console.error);
