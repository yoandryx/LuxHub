// scripts/updateVaultPda.mjs
// Updates the vault config with the NFT vault PDA (index 1)

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const MONGODB_URI = process.env.MONGODB_URI;
const NEW_VAULT_PDA = '2j9P1LAwCdgr7Ti7e2PLxg3KuApPg7heD28WXQG958zo';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found');
  process.exit(1);
}

async function updateVaultPda() {
  console.log('🔄 Updating Vault Config with NFT Vault PDA...\n');

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const result = await mongoose.connection.db.collection('vaultconfigs').updateOne(
      { isActive: true },
      {
        $set: {
          vaultPda: NEW_VAULT_PDA,
          vaultIndex: 1,  // Track which vault index we're using
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      console.error('❌ No active vault config found');
      process.exit(1);
    }

    console.log('✅ Vault config updated!');
    console.log(`   Vault PDA: ${NEW_VAULT_PDA}`);
    console.log(`   Vault Index: 1 (NFT Vault)`);

    // Verify
    const config = await mongoose.connection.db.collection('vaultconfigs').findOne({ isActive: true });
    console.log('\n📋 Updated Config:');
    console.log(`   ID: ${config._id}`);
    console.log(`   Multisig: ${config.multisigAddress}`);
    console.log(`   Vault PDA: ${config.vaultPda}`);

  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Done');
  }
}

updateVaultPda();
