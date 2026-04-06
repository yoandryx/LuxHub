// Diagnose a "floating" escrow — read-only query by NFT mint
// Usage: node scripts/diagnose-escrow.cjs <nftMint>
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const mint = process.argv[2];
  if (!mint) {
    console.error('Usage: node scripts/diagnose-escrow.cjs <nftMint>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  console.log('\n=== ESCROW lookup by nftMint ===');
  const escrows = await db
    .collection('escrows')
    .find({ nftMint: mint })
    .toArray();
  console.log(`Found ${escrows.length} escrow doc(s)`);
  for (const e of escrows) {
    console.log({
      _id: e._id.toString(),
      escrowPda: e.escrowPda,
      status: e.status,
      saleMode: e.saleMode,
      sellerWallet: e.sellerWallet,
      buyerWallet: e.buyerWallet,
      listingPrice: e.listingPrice,
      listingPriceUSD: e.listingPriceUSD,
      fundedAt: e.fundedAt,
      fundedAmount: e.fundedAmount,
      txSignature: e.txSignature,
      lastTxSignature: e.lastTxSignature,
      swapTxSignature: e.swapTxSignature,
      paymentMint: e.paymentMint,
      hasBuyerShipping: !!e.buyerShippingAddress,
      deleted: e.deleted,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    });
  }

  console.log('\n=== Same escrow visible to admin dashboard filter? ===');
  const adminVisible = await db.collection('escrows').findOne({
    nftMint: mint,
    deleted: { $ne: true },
    status: { $in: ['funded', 'shipped', 'listed', 'initiated'] },
    escrowPda: { $not: /^listing-/ },
  });
  console.log(adminVisible ? 'YES — would show in admin dashboard' : 'NO — filtered out');

  console.log('\n=== ASSET lookup ===');
  const asset = await db.collection('assets').findOne({ nftMint: mint });
  console.log(
    asset
      ? {
          _id: asset._id.toString(),
          title: asset.title,
          brand: asset.brand,
          model: asset.model,
          escrowId: asset.escrowId?.toString(),
        }
      : 'Not found'
  );

  console.log('\n=== TRANSACTIONS for this asset ===');
  if (asset) {
    const txs = await db
      .collection('transactions')
      .find({ asset: asset._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    console.log(`Found ${txs.length} tx(s)`);
    txs.forEach((t) =>
      console.log({
        type: t.type,
        fromWallet: t.fromWallet,
        toWallet: t.toWallet,
        amountUSD: t.amountUSD,
        status: t.status,
        txSignature: t.txSignature,
        createdAt: t.createdAt,
      })
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
