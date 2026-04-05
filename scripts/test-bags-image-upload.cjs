#!/usr/bin/env node
// scripts/test-bags-image-upload.cjs
// Tests creating a token-info via Bags API with image attached.
// This WILL create a real throwaway token — costs ~0.005 SOL.
// Use only to diagnose image upload issues.

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';
const IMAGE_URL = 'https://gateway.irys.xyz/FCunLBiW66TrrbzC1sK16Xk5yERFZpYwzN4QX8FVbSRG';

async function main() {
  console.log('=== Bags Image Upload Test ===\n');

  const bagsApiKey = process.env.BAGS_API_KEY;
  if (!bagsApiKey) {
    console.error('BAGS_API_KEY not set');
    process.exit(1);
  }

  console.log('Step 1: Downloading image from Irys...');
  const imgRes = await fetch(IMAGE_URL);
  if (!imgRes.ok) {
    console.error(`Image download failed: ${imgRes.status}`);
    process.exit(1);
  }
  const imgBuf = Buffer.from(await imgRes.arrayBuffer());
  console.log(`  Downloaded: ${imgBuf.length} bytes, content-type: ${imgRes.headers.get('content-type')}\n`);

  console.log('Step 2: Building FormData...');
  const formData = new FormData();
  formData.append('name', 'Test Rolex Submariner');
  formData.append('symbol', 'TESTXX');
  formData.append('description', 'Test token — verifying Bags image upload pipeline.');
  formData.append('twitter', 'https://x.com/LuxHubStudio');
  formData.append('website', 'https://luxhub.gold');

  const blob = new Blob([imgBuf], { type: 'image/png' });
  formData.append('image', blob, 'test-watch.png');
  console.log(`  Image blob: ${blob.size} bytes, type: ${blob.type}`);
  console.log(`  Fields: name, symbol, description, twitter, website, image\n`);

  console.log('Step 3: Calling Bags create-token-info...');
  const res = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
    method: 'POST',
    headers: { 'x-api-key': bagsApiKey },
    body: formData,
  });

  console.log(`  Response status: ${res.status} ${res.statusText}`);
  console.log(`  Response content-type: ${res.headers.get('content-type')}`);

  const responseText = await res.text();
  console.log(`\nResponse body:\n${responseText}\n`);

  try {
    const json = JSON.parse(responseText);
    if (json.response?.tokenMetadata || json.tokenMetadata) {
      const metadataUrl = json.response?.tokenMetadata || json.tokenMetadata;
      console.log(`Bags returned metadata URL: ${metadataUrl}`);
      console.log('\nStep 4: Fetching metadata JSON to verify image is included...');
      const metaRes = await fetch(metadataUrl);
      if (metaRes.ok) {
        const meta = await metaRes.json();
        console.log('Metadata JSON:', JSON.stringify(meta, null, 2));
        if (meta.image) {
          console.log(`\n✓ IMAGE URL IN METADATA: ${meta.image}`);
        } else {
          console.log('\n✗ NO IMAGE FIELD IN METADATA');
        }
      } else {
        console.log(`Metadata fetch failed: ${metaRes.status}`);
      }
    }
  } catch {
    console.log('Response was not JSON');
  }
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
