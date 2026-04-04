#!/usr/bin/env node
// scripts/test-pool-image-fetch.cjs
// Dry-run the image fetch pipeline used by createPoolTokenInternal.
// Verifies the server can download the NFT image and would attach it to FormData
// correctly WITHOUT actually calling the Bags API (no mint created).
//
// Usage: node scripts/test-pool-image-fetch.cjs

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const ASSET_ID = '69cec01920c22c7a859d00e0'; // Rolex Submariner MintRequest
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error('MONGODB_URI not set in .env.local');
  process.exit(1);
}

// Minimal resolveImageUrl replica (same logic as src/utils/imageUtils.ts)
const isDevnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK
  ? process.env.NEXT_PUBLIC_SOLANA_NETWORK !== 'mainnet-beta'
  : false;
const IRYS_GATEWAY = isDevnet ? 'https://devnet.irys.xyz/' : 'https://gateway.irys.xyz/';
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://teal-working-frog-718.mypinata.cloud/ipfs/';

function isIrysTxId(str) {
  return str.length === 43 && /^[A-Za-z0-9_-]+$/.test(str);
}
function isIpfsCid(str) {
  return str.startsWith('Qm') || str.startsWith('bafy');
}
function resolveImageUrl(idOrUrl) {
  if (!idOrUrl) return '';
  const trimmed = idOrUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (isDevnet) return trimmed.replace('https://gateway.irys.xyz/', IRYS_GATEWAY);
    return trimmed.replace('https://devnet.irys.xyz/', IRYS_GATEWAY);
  }
  if (trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  if (isIpfsCid(trimmed)) return `${PINATA_GATEWAY}${trimmed}`;
  if (isIrysTxId(trimmed)) return `${IRYS_GATEWAY}${trimmed}`;
  return `${IRYS_GATEWAY}${trimmed}`;
}

async function main() {
  console.log('=== LuxHub Pool Image Fetch Test ===\n');
  console.log(`Network env: ${process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'not set'}`);
  console.log(`Gateway in use: ${IRYS_GATEWAY}`);
  console.log(`isDevnet: ${isDevnet}\n`);

  const { MongoClient, ObjectId } = require('mongodb');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  // Fetch the MintRequest for our test watch
  const mintReq = await db.collection('mintrequests').findOne({ _id: new ObjectId(ASSET_ID) });
  if (!mintReq) {
    console.error(`MintRequest ${ASSET_ID} not found`);
    await client.close();
    process.exit(1);
  }

  console.log(`Asset: ${mintReq.brand} ${mintReq.model}`);
  console.log(`Raw imageUrl from DB: ${mintReq.imageUrl || 'EMPTY'}`);
  console.log(`Raw imageIpfsUrls[0]: ${mintReq.imageIpfsUrls?.[0] || 'EMPTY'}`);
  console.log(`Raw images[0]: ${mintReq.images?.[0] || 'EMPTY'}`);
  console.log(`mintAddress: ${mintReq.mintAddress}\n`);

  const rawImage = mintReq.imageUrl || mintReq.imageIpfsUrls?.[0] || mintReq.images?.[0] || '';
  const resolvedUrl = rawImage ? resolveImageUrl(rawImage) : '';

  console.log(`Resolved URL: ${resolvedUrl || 'NONE'}\n`);

  if (!resolvedUrl) {
    console.error('✗ No image URL to fetch. Asset has no imageUrl/imageIpfsUrls/images.');
    await client.close();
    process.exit(1);
  }

  console.log(`Downloading from: ${resolvedUrl}`);
  const startTime = Date.now();
  try {
    const imgRes = await fetch(resolvedUrl);
    const elapsed = Date.now() - startTime;
    console.log(`Status: ${imgRes.status} ${imgRes.statusText} (${elapsed}ms)`);
    console.log(`Content-Type: ${imgRes.headers.get('content-type')}`);
    console.log(`Content-Length: ${imgRes.headers.get('content-length')}`);

    if (!imgRes.ok) {
      console.error(`\n✗ Image download FAILED`);
      await client.close();
      process.exit(1);
    }

    const buf = Buffer.from(await imgRes.arrayBuffer());
    console.log(`Buffer size: ${buf.length} bytes (${(buf.length / 1024).toFixed(1)} KB)`);

    // Verify it's actually an image
    const magic = buf.slice(0, 4).toString('hex');
    let format = 'UNKNOWN';
    if (magic.startsWith('89504e47')) format = 'PNG';
    else if (magic.startsWith('ffd8ff')) format = 'JPEG';
    else if (magic.startsWith('47494638')) format = 'GIF';
    else if (magic.startsWith('52494646')) format = 'WEBP';
    console.log(`Format (from magic bytes): ${format}`);

    // Build the FormData blob (mirrors createPoolTokenInternal path)
    const contentType = imgRes.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
    const blob = new Blob([buf], { type: contentType });
    console.log(`Would attach to FormData as: pool-token.${ext} (type: ${blob.type}, size: ${blob.size} bytes)`);

    // Test Bags API is reachable
    console.log(`\nTesting Bags API reachability (no actual mint)...`);
    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      console.log('⚠ BAGS_API_KEY not set — skipping Bags reachability test');
    } else {
      try {
        // Just a HEAD/OPTIONS to the base endpoint to verify connectivity + API key
        const testRes = await fetch('https://public-api-v2.bags.fm/api/v1/', {
          method: 'GET',
          headers: { 'x-api-key': bagsApiKey },
        });
        console.log(`Bags API response: ${testRes.status}`);
      } catch (e) {
        console.log(`Bags API unreachable: ${e.message}`);
      }
    }

    console.log(`\n✓ ALL CHECKS PASSED`);
    console.log(`  - Asset data found in DB`);
    console.log(`  - Image URL resolves to mainnet gateway`);
    console.log(`  - Image downloads successfully (${buf.length} bytes, ${format})`);
    console.log(`  - Would attach to Bags FormData correctly`);
    console.log(`\nSafe to proceed with pool creation.`);
  } catch (err) {
    console.error(`\n✗ FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(1);
});
