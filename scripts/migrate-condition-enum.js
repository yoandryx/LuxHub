// Run: node scripts/migrate-condition-enum.js
// Or via mongo shell: mongosh $MONGODB_URI --file scripts/migrate-condition-enum.js

const { MongoClient } = require('mongodb');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const assets = db.collection('assets');

  // Migrate "New" -> "Unworn"
  const r1 = await assets.updateMany({ condition: 'New' }, { $set: { condition: 'Unworn' } });
  console.log(`Migrated ${r1.modifiedCount} documents: "New" -> "Unworn"`);

  // Migrate "Poor" -> "Fair"
  const r2 = await assets.updateMany({ condition: 'Poor' }, { $set: { condition: 'Fair' } });
  console.log(`Migrated ${r2.modifiedCount} documents: "Poor" -> "Fair"`);

  // Migrate "Non-functional" -> "Fair"
  const r3 = await assets.updateMany({ condition: 'Non-functional' }, { $set: { condition: 'Fair' } });
  console.log(`Migrated ${r3.modifiedCount} documents: "Non-functional" -> "Fair"`);

  // Migrate AI conditionGrade: "mint" -> "unworn", "poor" -> "fair"
  const r4 = await assets.updateMany(
    { 'aiVerification.conditionGrade': 'mint' },
    { $set: { 'aiVerification.conditionGrade': 'unworn' } }
  );
  console.log(`Migrated ${r4.modifiedCount} AI grades: "mint" -> "unworn"`);

  const r5 = await assets.updateMany(
    { 'aiVerification.conditionGrade': 'poor' },
    { $set: { 'aiVerification.conditionGrade': 'fair' } }
  );
  console.log(`Migrated ${r5.modifiedCount} AI grades: "poor" -> "fair"`);

  await client.close();
  console.log('Migration complete.');
}

migrate().catch(console.error);
