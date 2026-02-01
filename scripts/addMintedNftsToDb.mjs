// scripts/addMintedNftsToDb.mjs
// Add the 4 minted NFTs to the database and fix the serial index

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;
const LUXHUB_VENDOR_ID = '697f7ec977f00390b3ca4e59';
const VAULT_PDA = '2j9P1LAwCdgr7Ti7e2PLxg3KuApPg7heD28WXQG958zo';

// The 4 NFTs that were minted
const mintedNfts = [
  {
    nftMint: '7LJcbjnTmEU2HEJTEMY6UoB85LPKmPhGv6QJmqFnM1iY',
    model: 'Datejust 41',
    serial: '126333-001',
    description: 'Two-tone Datejust 41 in Oystersteel and 18K yellow gold. Silver sunburst dial with stick hour markers, fluted yellow gold bezel, and Oyster bracelet.',
    priceUSD: 15500,
    metadataIpfsUrl: 'https://gateway.irys.xyz/CVCkvXu7ZkHbi2thKoUEJ8fdz6LEZ8BUwe75tgH6HQwG',
    brand: 'Rolex',
    material: 'Oystersteel/18K Yellow Gold',
    dialColor: 'Silver',
    caseSize: '41mm',
    movement: 'Automatic Caliber 3235',
  },
  {
    nftMint: 'AFdE4qRBNn1XkrgC9iiC3hSf6oGvuH8TH6QMh9j4hqY2',
    model: 'GMT-Master II Root Beer',
    serial: '126711CHNR',
    description: 'Two-tone GMT-Master II in Oystersteel and 18K Everose gold. Black dial with brown and black Cerachrom ceramic bezel insert.',
    priceUSD: 21000,
    metadataIpfsUrl: 'https://gateway.irys.xyz/29uD3dLMUYQ25ppj2rx6h8A4Li5GvNQVSU8Je5McNw9g',
    brand: 'Rolex',
    material: 'Oystersteel/18K Everose Gold',
    dialColor: 'Black',
    caseSize: '40mm',
    movement: 'Automatic Caliber 3285',
  },
  {
    nftMint: 'ACGe73KtfkgWUzdjjgmKf3vZrHCqiVjuGqxY9MA2jjXr',
    model: 'Datejust 41',
    serial: '126333-002',
    description: 'Two-tone Datejust 41 in Oystersteel and 18K yellow gold. Champagne sunburst dial with stick hour markers, fluted yellow gold bezel, and Oyster bracelet.',
    priceUSD: 16500,
    metadataIpfsUrl: 'https://gateway.irys.xyz/5xMCFudDbkFeLyWAEU4GGh55XHgeQfeLx4kZ7DJQ4ZQx',
    brand: 'Rolex',
    material: 'Oystersteel/18K Yellow Gold',
    dialColor: 'Champagne',
    caseSize: '41mm',
    movement: 'Automatic Caliber 3235',
  },
  {
    nftMint: 'Bombf99n7x5QtuJhjRFbi3bXUM3WaeHcTS2uXD9GJ1qY',
    model: 'GMT-Master II Batman',
    serial: '126710BLNR',
    description: 'Full Oystersteel GMT-Master II with black dial and iconic blue/black Cerachrom ceramic bezel insert.',
    priceUSD: 18500,
    metadataIpfsUrl: 'https://gateway.irys.xyz/AGSQwaDugTGM6FQRn6wBCw58N5FG73zyqqQb59FJkDSN',
    brand: 'Rolex',
    material: 'Oystersteel',
    dialColor: 'Black',
    caseSize: '40mm',
    movement: 'Automatic Caliber 3285',
  },
];

async function addMintedNfts() {
  console.log('🚀 Adding minted NFTs to database...\n');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Drop the unique index on serial field if it exists
    console.log('📝 Checking for unique index on serial field...');
    try {
      await mongoose.connection.db.collection('assets').dropIndex('serial_1');
      console.log('✅ Dropped unique index on serial field');
    } catch (e) {
      console.log('ℹ️  No unique index to drop (already removed or never existed)');
    }

    // 2. Add each NFT to the database
    console.log('\n📝 Adding NFTs to database...\n');

    for (const nft of mintedNfts) {
      // Check if already exists
      const existing = await mongoose.connection.db.collection('assets').findOne({ nftMint: nft.nftMint });
      if (existing) {
        console.log(`⏭️  Skipping ${nft.model} - already exists`);
        continue;
      }

      const asset = {
        vendor: new mongoose.Types.ObjectId(LUXHUB_VENDOR_ID),
        model: nft.model,
        serial: nft.serial,
        description: nft.description,
        priceUSD: nft.priceUSD,
        imageIpfsUrls: [],
        metadataIpfsUrl: nft.metadataIpfsUrl,
        nftMint: nft.nftMint,
        nftOwnerWallet: VAULT_PDA,
        status: 'pending',
        poolEligible: true,
        deleted: false,
        conditionUpdatesOverdue: false,
        category: 'watches',
        luxScore: 0,
        authenticityProofs: [],
        images: [],
        priceHistory: [{ price: nft.priceUSD, updatedAt: new Date() }],
        metadataHistory: [],
        transferHistory: [],
        metaplexMetadata: {
          attributes: {
            brand: nft.brand,
            material: nft.material,
            dialColor: nft.dialColor,
            caseSize: nft.caseSize,
            movement: nft.movement,
            productionYear: '2024',
            condition: 'New',
            boxPapers: 'Yes',
            country: 'Switzerland',
            warrantyInfo: '5 Years',
          },
        },
        aiVerification: {
          verified: false,
          flags: [],
          recommendedActions: [],
          claimsVerified: { value: { marketRange: [] } },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await mongoose.connection.db.collection('assets').insertOne(asset);
      console.log(`✅ Added: ${nft.model} (${nft.nftMint.slice(0, 8)}...)`);
    }

    // 3. Also add to VaultInventory for tracking
    console.log('\n📝 Adding to VaultInventory...\n');

    for (const nft of mintedNfts) {
      const existing = await mongoose.connection.db.collection('vaultinventories').findOne({ nftMint: nft.nftMint });
      if (existing) {
        console.log(`⏭️  Skipping vault inventory for ${nft.model} - already exists`);
        continue;
      }

      const vaultItem = {
        nftMint: nft.nftMint,
        name: `Rolex ${nft.model}`,
        description: nft.description,
        imageUrl: '', // From Dropbox, not stored
        metadataUri: nft.metadataIpfsUrl,
        mintedBy: '6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X', // Admin wallet that minted
        mintedAt: new Date(),
        mintSignature: nft.nftMint,
        isVerifiedCreator: true,
        inVerifiedCollection: false,
        status: 'minted',
        tags: ['timepiece', 'rolex', 'bulk-mint'],
        notes: 'Bulk minted via CSV',
        history: [{
          action: 'minted_to_vault',
          performedBy: '6mst5P2CaiiAoQh426oxadGuksQgkHoUdQAWdeMQWE8X',
          performedAt: new Date(),
          details: { source: 'bulk-mint' },
        }],
        offers: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await mongoose.connection.db.collection('vaultinventories').insertOne(vaultItem);
      console.log(`✅ Added to vault: ${nft.model}`);
    }

    // 4. Update vault stats
    console.log('\n📝 Updating vault stats...');
    await mongoose.connection.db.collection('vaultconfigs').updateOne(
      { isActive: true },
      {
        $inc: { totalMinted: 4, currentHoldings: 4 },
      }
    );
    console.log('✅ Vault stats updated');

    // 5. Summary
    const assetCount = await mongoose.connection.db.collection('assets').countDocuments({ vendor: new mongoose.Types.ObjectId(LUXHUB_VENDOR_ID) });
    const vaultCount = await mongoose.connection.db.collection('vaultinventories').countDocuments({});

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   LuxHub Vault Assets: ${assetCount}`);
    console.log(`   Vault Inventory Items: ${vaultCount}`);
    console.log('='.repeat(60));

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

addMintedNfts();
