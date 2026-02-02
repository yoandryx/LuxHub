// scripts/seedLuxHubVault.ts
// Run with: npx ts-node --transpile-only scripts/seedLuxHubVault.ts

/* eslint-disable @typescript-eslint/no-var-requires */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Import models using require for CommonJS compatibility
const { Vendor } = require('../src/lib/models/Vendor');
const { VaultConfig } = require('../src/lib/models/LuxHubVault');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}

async function seedLuxHubVault() {
  console.log('🚀 Starting LuxHub Vault seed...\n');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // 1. Create or update LuxHub Official Vendor
    const luxhubVendorData = {
      businessName: 'LuxHub Official Vault',
      username: 'luxhub-vault',
      bio: 'Official LuxHub vault for verified luxury asset NFTs. All NFTs minted here are authenticity-verified by the LuxHub team.',
      walletAddress: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
      socials: {
        twitter: 'https://twitter.com/luxhub',
        website: 'https://luxhub.io',
      },
      verified: true,
      isOfficial: true, // Special flag for LuxHub
      multisigPda: process.env.NEXT_PUBLIC_SQUADS_MSIG || '',
    };

    let luxhubVendor = await Vendor.findOne({ username: 'luxhub-vault' });

    if (luxhubVendor) {
      console.log('📝 Updating existing LuxHub Official vendor...');
      await Vendor.updateOne({ _id: luxhubVendor._id }, luxhubVendorData);
      console.log(`✅ Updated vendor: ${luxhubVendor._id}`);
    } else {
      console.log('📝 Creating LuxHub Official vendor...');
      luxhubVendor = await Vendor.create(luxhubVendorData);
      console.log(`✅ Created vendor: ${luxhubVendor._id}`);
    }

    console.log('\n📋 LuxHub Vendor Details:');
    console.log(`   ID: ${luxhubVendor._id}`);
    console.log(`   Name: ${luxhubVendor.businessName}`);
    console.log(`   Username: ${luxhubVendor.username}`);
    console.log(`   Wallet: ${luxhubVendor.walletAddress || 'Not set'}`);
    console.log(`   Official: ${luxhubVendor.isOfficial}`);

    // 2. Create or update Vault Config
    const multisigAddress = process.env.NEXT_PUBLIC_SQUADS_MSIG || '';
    const vaultPda = process.env.LUXHUB_VAULT_PDA || process.env.NEXT_PUBLIC_LUXHUB_WALLET || '';

    const vaultConfigData = {
      multisigAddress,
      vaultPda,
      collectionMint: process.env.LUXHUB_COLLECTION_MINT || '',
      collectionAuthority: multisigAddress,
      authorizedAdmins: [],
      mintApprovalThreshold: 1,
      transferApprovalThreshold: 2,
      totalMinted: 0,
      totalDistributed: 0,
      currentHoldings: 0,
      isActive: true,
    };

    // Add initial admin if ADMIN_WALLET is set
    if (process.env.ADMIN_WALLET) {
      vaultConfigData.authorizedAdmins.push({
        walletAddress: process.env.ADMIN_WALLET,
        name: 'Primary Admin',
        role: 'super_admin',
        addedAt: new Date(),
        addedBy: 'system',
      });
    }

    let vaultConfig = await VaultConfig.findOne({ multisigAddress });

    if (vaultConfig) {
      console.log('\n📝 Updating existing Vault Config...');
      await VaultConfig.updateOne({ _id: vaultConfig._id }, { $set: vaultConfigData });
      console.log(`✅ Updated vault config: ${vaultConfig._id}`);
    } else {
      console.log('\n📝 Creating Vault Config...');
      vaultConfig = await VaultConfig.create(vaultConfigData);
      console.log(`✅ Created vault config: ${vaultConfig._id}`);
    }

    console.log('\n📋 Vault Config Details:');
    console.log(`   ID: ${vaultConfig._id}`);
    console.log(`   Multisig: ${vaultConfig.multisigAddress || 'Not set'}`);
    console.log(`   Vault PDA: ${vaultConfig.vaultPda || 'Not set'}`);
    console.log(`   Admins: ${vaultConfigData.authorizedAdmins.length}`);

    // Output environment variables to add
    console.log('\n' + '='.repeat(60));
    console.log('📌 Add these to your .env.local file:');
    console.log('='.repeat(60));
    console.log(`LUXHUB_VENDOR_ID=${luxhubVendor._id}`);
    console.log(`LUXHUB_VAULT_CONFIG_ID=${vaultConfig._id}`);
    console.log('='.repeat(60));

    console.log('\n✅ LuxHub Vault seed completed successfully!\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

seedLuxHubVault();
