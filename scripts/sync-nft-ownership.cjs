const { Connection, PublicKey } = require('@solana/web3.js');
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function syncOwnership() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  await mongoose.connect(process.env.MONGODB_URI);

  const targetWallet = 'CsEbhhe4PtC5pumcJoe8RWnzLgtojioqFdXFWJGJDHCZ';

  // Get all assets with mint addresses
  const assets = await mongoose.connection.db.collection('assets').find({
    nftMint: { $exists: true, $ne: null }
  }).toArray();

  console.log('Checking', assets.length, 'assets with mint addresses...');
  console.log('Target wallet:', targetWallet);
  console.log('');

  const updates = [];

  for (const asset of assets) {
    const mint = asset.nftMint;
    if (!mint || mint.startsWith('Test')) continue;

    try {
      const mintPk = new PublicKey(mint);
      const largestAccounts = await connection.getTokenLargestAccounts(mintPk);

      if (largestAccounts.value.length > 0 && largestAccounts.value[0].amount === '1') {
        const holderAta = largestAccounts.value[0].address;
        const ataInfo = await connection.getParsedAccountInfo(holderAta);
        const onChainOwner = ataInfo.value?.data?.parsed?.info?.owner;

        const dbOwner = asset.nftOwnerWallet;
        const needsUpdate = onChainOwner && onChainOwner !== dbOwner;

        if (onChainOwner === targetWallet) {
          console.log('FOUND:', asset.model || asset.title);
          console.log('  Mint:', mint);
          console.log('  DB Owner:', dbOwner || 'NOT SET');
          console.log('  On-chain Owner:', onChainOwner);
          console.log('  Needs update:', needsUpdate ? 'YES' : 'No');
          console.log('');

          if (needsUpdate) {
            updates.push({ mint, title: asset.model || asset.title, onChainOwner });
          }
        }
      }
    } catch (e) {
      // Skip invalid mints
    }
  }

  console.log('\n=== NFTs to update ===');
  console.log('Found', updates.length, 'NFTs owned by', targetWallet, 'that need DB update');

  if (updates.length > 0) {
    console.log('\nUpdating database...');
    for (const u of updates) {
      await mongoose.connection.db.collection('assets').updateOne(
        { nftMint: u.mint },
        { $set: { nftOwnerWallet: u.onChainOwner } }
      );
      console.log('  Updated:', u.title, '->', u.onChainOwner.slice(0, 8) + '...');
    }
    console.log('Done!');
  }

  await mongoose.disconnect();
}

syncOwnership().catch(console.error);
