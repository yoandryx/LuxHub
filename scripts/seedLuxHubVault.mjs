// scripts/seedLuxHubVault.mjs
// Run with: node scripts/seedLuxHubVault.mjs

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}

// Define schemas inline to avoid import issues
const VendorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    businessName: { type: String, required: true },
    username: { type: String, unique: true, index: true, required: true },
    bio: String,
    socials: {
      instagram: String,
      twitter: String,
      website: String,
    },
    verified: { type: Boolean, default: false },
    isOfficial: { type: Boolean, default: false, index: true },
    walletAddress: { type: String, index: true },
    multisigPda: String,
    multisigType: { type: String, enum: ['none', 'personal', 'team_treasury'], default: 'none' },
    multisigMembers: [String],
    fedexApiKey: { type: String },
    backpackWalletLinked: { type: Boolean, default: false },
    analytics: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorAnalytics' },
    salesSummary: {
      totalSales: { type: Number, default: 0 },
      totalRoyaltiesEarned: { type: Number, default: 0 },
    },
    listingsCount: { type: Number, default: 0 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const VaultConfigSchema = new mongoose.Schema(
  {
    multisigAddress: { type: String, required: true, unique: true },
    vaultPda: { type: String, required: true, index: true },
    collectionMint: { type: String, index: true },
    collectionAuthority: { type: String },
    authorizedAdmins: [{
      walletAddress: { type: String, required: true },
      name: { type: String },
      role: { type: String, enum: ['super_admin', 'admin', 'minter'], default: 'minter' },
      addedAt: { type: Date, default: Date.now },
      addedBy: { type: String },
    }],
    mintApprovalThreshold: { type: Number, default: 1 },
    transferApprovalThreshold: { type: Number, default: 2 },
    totalMinted: { type: Number, default: 0 },
    totalDistributed: { type: Number, default: 0 },
    currentHoldings: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema);
const VaultConfig = mongoose.models.VaultConfig || mongoose.model('VaultConfig', VaultConfigSchema);

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
      isOfficial: true,
      multisigPda: process.env.NEXT_PUBLIC_SQUADS_MSIG || '',
    };

    let luxhubVendor = await Vendor.findOne({ username: 'luxhub-vault' });

    if (luxhubVendor) {
      console.log('📝 Updating existing LuxHub Official vendor...');
      await Vendor.updateOne({ _id: luxhubVendor._id }, luxhubVendorData);
      luxhubVendor = await Vendor.findOne({ username: 'luxhub-vault' });
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
    const multisigAddress = process.env.NEXT_PUBLIC_SQUADS_MSIG || process.env.NEXT_PUBLIC_LUXHUB_WALLET || 'default-multisig';
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

    // Also add NEXT_PUBLIC_LUXHUB_WALLET as admin if set
    if (process.env.NEXT_PUBLIC_LUXHUB_WALLET && process.env.NEXT_PUBLIC_LUXHUB_WALLET !== process.env.ADMIN_WALLET) {
      vaultConfigData.authorizedAdmins.push({
        walletAddress: process.env.NEXT_PUBLIC_LUXHUB_WALLET,
        name: 'LuxHub Wallet',
        role: 'super_admin',
        addedAt: new Date(),
        addedBy: 'system',
      });
    }

    let vaultConfig = await VaultConfig.findOne({ multisigAddress });

    if (vaultConfig) {
      console.log('\n📝 Updating existing Vault Config...');
      // Don't reset stats on update
      delete vaultConfigData.totalMinted;
      delete vaultConfigData.totalDistributed;
      delete vaultConfigData.currentHoldings;
      await VaultConfig.updateOne({ _id: vaultConfig._id }, { $set: vaultConfigData });
      vaultConfig = await VaultConfig.findOne({ multisigAddress });
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
    console.log(`   Admins: ${vaultConfig.authorizedAdmins?.length || 0}`);
    console.log(`   Stats: ${vaultConfig.totalMinted} minted, ${vaultConfig.currentHoldings} held`);

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
