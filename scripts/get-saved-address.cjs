// Look up saved addresses for a wallet
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const wallet = process.argv[2];
  if (!wallet) {
    console.error('Usage: node scripts/get-saved-address.cjs <wallet>');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // Try both possible collection names
  for (const name of ['savedaddresses', 'addresses', 'shippingaddresses', 'useraddresses']) {
    const exists = await db.listCollections({ name }).toArray();
    if (exists.length) {
      const docs = await db.collection(name).find({ wallet }).toArray();
      console.log(`\n--- ${name} (${docs.length} doc(s)) ---`);
      docs.forEach((d) => console.log(JSON.stringify(d, null, 2)));
    }
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
