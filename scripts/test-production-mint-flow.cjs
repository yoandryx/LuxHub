#!/usr/bin/env node
// scripts/test-production-mint-flow.cjs
// Simulates the EXACT production flow from createPoolTokenInternal.
// Uses the same asset lookup + image download + FormData construction.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const POOL_ID = '69d1b633ff66f909fcd3da6e'; // Last pool created

async function main() {
  const { MongoClient, ObjectId } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  // Fetch pool (same as createPoolTokenInternal)
  const pool = await db.collection('pools').findOne({ _id: new ObjectId(POOL_ID) });
  console.log('Pool poolNumber:', pool.poolNumber);
  console.log('Pool selectedAssetId:', pool.selectedAssetId.toString());

  // Same asset lookup as production (with my fix)
  const assetIdStr = pool.selectedAssetId.toString();
  const [assetDoc, mintReq] = await Promise.all([
    db.collection('assets').findOne({ _id: new ObjectId(assetIdStr) }),
    db.collection('mintrequests').findOne({ _id: new ObjectId(assetIdStr) }),
  ]);
  const source = assetDoc || mintReq;
  console.log('\nAsset source:', assetDoc ? 'Asset' : mintReq ? 'MintRequest' : 'NONE');
  console.log('Asset brand:', source?.brand);
  console.log('Asset model:', source?.model);
  console.log('Asset imageUrl:', source?.imageUrl);

  // Resolve URL (simplified)
  const rawImage = source.imageUrl || source.imageIpfsUrls?.[0] || source.images?.[0] || '';
  const assetImage = rawImage.startsWith('http') ? rawImage : `https://gateway.irys.xyz/${rawImage}`;
  console.log('\nDownloading:', assetImage.slice(0, 100));

  const imgRes = await fetch(assetImage);
  console.log('Download status:', imgRes.status);
  if (!imgRes.ok) { await client.close(); return; }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') || 'image/png';
  console.log('Image:', imgBuf.length, 'bytes,', contentType);

  // Build FormData same as production
  const poolNumber = pool.poolNumber;
  const rawName = `${source.brand} ${source.model}`;
  const tokenName = rawName.slice(0, 32);
  const tokenSymbol = poolNumber.slice(0, 10);

  const descParts = [
    `Tokenized ownership pool for an authenticated ${source.brand} ${source.model}.`,
    `Backing NFT: ${source.mintAddress}.`,
    `Pool: ${poolNumber}. Custody verified via LuxHub marketplace.`,
  ].join(' ');
  const tokenDescription = descParts.slice(0, 1000);

  console.log('\nFormData values:');
  console.log('  name:', tokenName, `(${tokenName.length} chars)`);
  console.log('  symbol:', tokenSymbol, `(${tokenSymbol.length} chars)`);
  console.log('  description:', tokenDescription.slice(0, 80) + '...');

  const formData = new FormData();
  formData.append('name', tokenName);
  formData.append('symbol', tokenSymbol);
  formData.append('description', tokenDescription);
  formData.append('twitter', 'https://x.com/LuxHubStudio');
  formData.append('website', 'https://luxhub.gold');
  const blob = new Blob([imgBuf], { type: contentType });
  formData.append('image', blob, 'pool-token.png');
  console.log('  image: blob', blob.size, 'bytes\n');

  console.log('Calling Bags create-token-info...');
  const res = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
    method: 'POST',
    headers: { 'x-api-key': process.env.BAGS_API_KEY },
    body: formData,
  });
  console.log('Status:', res.status);
  const body = await res.text();
  console.log('\nResponse:', body.slice(0, 2000));

  await client.close();
}

main().catch(console.error);
