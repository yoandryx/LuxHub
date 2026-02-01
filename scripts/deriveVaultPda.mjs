// scripts/deriveVaultPda.mjs
// Derives the Squads vault PDA from multisig address

import { PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

const MULTISIG_ADDRESS = process.argv[2] || 'H79uqVEoKc9yCzr49ndoq6114DFiRifM7DqoqnUWbef7';

async function deriveVaultPda() {
  console.log('🔐 Deriving Squads Vault PDA\n');
  console.log('Multisig Address:', MULTISIG_ADDRESS);

  try {
    const multisigPk = new PublicKey(MULTISIG_ADDRESS);

    // Derive vault PDA (index 1 for dedicated NFT vault)
    const [vaultPda, bump] = multisig.getVaultPda({
      multisigPda: multisigPk,
      index: 1,  // NFT Vault
    });

    console.log('\n✅ Vault PDA derived successfully!\n');
    console.log('='.repeat(60));
    console.log('Vault PDA:', vaultPda.toBase58());
    console.log('Bump:', bump);
    console.log('='.repeat(60));

    console.log('\n📌 Add this to your .env.local:');
    console.log(`LUXHUB_VAULT_PDA=${vaultPda.toBase58()}`);

    // Also derive vault PDAs for other indexes (in case needed)
    console.log('\n📋 Other vault indexes (for reference):');
    for (let i = 1; i <= 3; i++) {
      const [otherVault] = multisig.getVaultPda({
        multisigPda: multisigPk,
        index: i,
      });
      console.log(`  Vault ${i}: ${otherVault.toBase58()}`);
    }

    return vaultPda.toBase58();
  } catch (error) {
    console.error('❌ Error deriving vault PDA:', error.message);
    process.exit(1);
  }
}

deriveVaultPda();
