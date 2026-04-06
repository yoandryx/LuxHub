// Mark an escrow as released after Squads confirm_delivery executes
// Usage: node scripts/mark-escrow-released.cjs <escrowPda> <executeTxSig>
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const [escrowPda, execSig] = process.argv.slice(2);
  if (!escrowPda || !execSig) {
    console.error('Usage: node scripts/mark-escrow-released.cjs <escrowPda> <executeTxSig>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const escrow = await db.collection('escrows').findOne({ escrowPda });
  if (!escrow) {
    console.error(`✗ Escrow ${escrowPda} not found`);
    process.exit(1);
  }
  console.log(`Escrow ${escrow._id} current status: ${escrow.status}`);

  const now = new Date();
  await db.collection('escrows').updateOne(
    { _id: escrow._id },
    {
      $set: {
        status: 'released',
        releasedAt: now,
        squadsExecutionSignature: execSig,
        squadsExecutedAt: now,
        confirmDeliveryExecutedAt: now,
        updatedAt: now,
      },
    }
  );
  console.log(`✓ Escrow marked released`);

  // Record the release tx
  await db.collection('transactions').insertOne({
    type: 'release',
    escrow: escrow._id,
    asset: escrow.asset,
    fromWallet: escrowPda,
    toWallet: escrow.sellerWallet,
    amountUSD: (escrow.listingPriceUSD || 0) * 0.97,
    txSignature: execSig,
    status: 'success',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✓ Release transaction recorded`);

  // Notify buyer + vendor
  await db.collection('notifications').insertMany([
    {
      userWallet: escrow.sellerWallet,
      type: 'payment_released',
      title: 'Payment Released',
      message: `Delivery confirmed. You received $${((escrow.listingPriceUSD || 0) * 0.97).toFixed(2)} USDC.`,
      read: false,
      metadata: { escrowId: escrow._id.toString(), escrowPda, txSignature: execSig },
      createdAt: now,
      updatedAt: now,
    },
    {
      userWallet: escrow.buyerWallet,
      type: 'delivery_confirmed',
      title: 'Delivery Confirmed',
      message: `Your purchase has been finalized. The NFT is in your wallet.`,
      read: false,
      metadata: { escrowId: escrow._id.toString(), escrowPda, txSignature: execSig },
      createdAt: now,
      updatedAt: now,
    },
  ]);
  console.log(`✓ Notifications queued`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
