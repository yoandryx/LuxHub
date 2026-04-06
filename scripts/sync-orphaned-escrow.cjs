// Reconcile a "floating" escrow — on-chain exchange() succeeded but DB never updated.
// Usage: edit the CONFIG block below with the buyer's shipping address, then run:
//   node scripts/sync-orphaned-escrow.cjs
//
// This script is idempotent: it only updates an escrow if status !== 'funded'.
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

// ============================================================
// CONFIG — fill in buyer's shipping address before running
// ============================================================
const CONFIG = {
  escrowPda: 'EdkcHhHU7bpZVkUewQ9bUsXzR4XN4cjmniBZTAPJXLY5',
  nftMint: 'h5kQzgeiGT6cKKduQgXZQB8362w9RvMufU46Ep8bKbo',
  buyerWallet: 'B6K5pZmZ7DLjYtTrVBkFpSwPqT5Vf93z9F5iAze1qHdu',
  txSignature:
    '2XBzAeN8tkTzoiv6LfENmDBXABPXrhMi48Y9gfs4nd4nBjWLSDxhKvx6P4BhSw3cvxkYhgNhHe9YfrMpmHQBvYG6',
  paymentMint: 'USDC',
  fundedAt: new Date('2026-04-05T00:33:41.000Z'),
  // ↓↓↓ FILL THESE IN FROM THE BUYER ↓↓↓
  shippingAddress: {
    fullName: 'Test Buyer',
    street1: '123 Test Ave',
    street2: '',
    city: 'Miami',
    state: 'FL',
    postalCode: '33101',
    country: 'United States',
    phone: '',
    email: 'test@luxhub.gold',
    deliveryInstructions: 'TEST PURCHASE — synced manually after client-side DB sync failed',
  },
};
// ============================================================

async function main() {
  const missing = ['fullName', 'street1', 'city', 'state', 'postalCode', 'country'].filter(
    (k) => !CONFIG.shippingAddress[k]
  );
  if (missing.length) {
    console.error(`✗ Missing required shipping fields: ${missing.join(', ')}`);
    console.error('  Fill them in at the top of scripts/sync-orphaned-escrow.cjs and rerun.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const escrow = await db.collection('escrows').findOne({ escrowPda: CONFIG.escrowPda });
  if (!escrow) {
    console.error(`✗ Escrow ${CONFIG.escrowPda} not found in DB`);
    process.exit(1);
  }
  console.log(`Escrow ${escrow._id} current status: ${escrow.status}`);
  if (escrow.status === 'funded' || escrow.status === 'shipped' || escrow.status === 'delivered') {
    console.log('✓ Already synced — nothing to do.');
    await mongoose.disconnect();
    return;
  }

  // Find or create buyer User
  let buyerUser = await db.collection('users').findOne({ wallet: CONFIG.buyerWallet });
  if (!buyerUser) {
    const result = await db.collection('users').insertOne({
      wallet: CONFIG.buyerWallet,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    buyerUser = { _id: result.insertedId, wallet: CONFIG.buyerWallet };
    console.log(`✓ Created buyer user ${buyerUser._id}`);
  } else {
    console.log(`✓ Buyer user exists: ${buyerUser._id}`);
  }

  // Update escrow
  const update = {
    status: 'funded',
    buyer: buyerUser._id,
    buyerWallet: CONFIG.buyerWallet,
    buyerShippingAddress: CONFIG.shippingAddress,
    fundedAt: CONFIG.fundedAt,
    fundedAmount: escrow.listingPrice,
    txSignature: CONFIG.txSignature,
    lastTxSignature: CONFIG.txSignature,
    paymentMint: CONFIG.paymentMint,
    updatedAt: new Date(),
  };
  await db.collection('escrows').updateOne({ _id: escrow._id }, { $set: update });
  console.log(`✓ Escrow updated → status=funded, buyer=${CONFIG.buyerWallet}`);

  // Fix asset.escrowId backref (was missing)
  if (escrow.asset) {
    await db
      .collection('assets')
      .updateOne({ _id: escrow.asset }, { $set: { escrowId: escrow._id } });
    console.log(`✓ Asset ${escrow.asset} escrowId backref set`);
  }

  // Record Transaction
  const asset = escrow.asset
    ? await db.collection('assets').findOne({ _id: escrow.asset })
    : null;
  await db.collection('transactions').insertOne({
    type: 'sale',
    escrow: escrow._id,
    asset: escrow.asset,
    fromWallet: CONFIG.buyerWallet,
    toWallet: CONFIG.escrowPda,
    amountUSD: escrow.listingPriceUSD || 0,
    txSignature: CONFIG.txSignature,
    status: 'success',
    createdAt: CONFIG.fundedAt,
    updatedAt: new Date(),
  });
  console.log('✓ Transaction record created');

  // Insert in-app notification for vendor
  await db.collection('notifications').insertOne({
    userWallet: escrow.sellerWallet,
    type: 'new_order',
    title: 'New Order Received',
    message: `${(asset && (asset.title || asset.model)) || 'Your item'} has been purchased for $${escrow.listingPriceUSD || 0} USDC. Please ship ASAP.`,
    read: false,
    metadata: {
      escrowId: escrow._id.toString(),
      escrowPda: CONFIG.escrowPda,
      buyerWallet: CONFIG.buyerWallet,
      amountUSD: escrow.listingPriceUSD,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`✓ In-app notification queued for vendor ${escrow.sellerWallet}`);

  // Insert in-app notification for buyer
  await db.collection('notifications').insertOne({
    userWallet: CONFIG.buyerWallet,
    type: 'order_funded',
    title: 'Purchase Confirmed',
    message: `Your purchase of "${(asset && (asset.title || asset.model)) || 'your item'}" has been confirmed. $${escrow.listingPriceUSD || 0} USDC is secured in escrow.`,
    read: false,
    metadata: {
      escrowId: escrow._id.toString(),
      escrowPda: CONFIG.escrowPda,
      amountUSD: escrow.listingPriceUSD,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`✓ In-app notification queued for buyer`);

  console.log('\n✓ SYNC COMPLETE. Verify with:');
  console.log(`  node scripts/diagnose-escrow.cjs ${CONFIG.nftMint}`);
  console.log(
    '\n⚠ Note: vendor email notification NOT sent by this script. If you use Resend,'
  );
  console.log('  trigger it manually or call notifyNewOrder() via a one-off endpoint.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
