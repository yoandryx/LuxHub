#!/usr/bin/env node
/**
 * Update EscrowConfig authority from admin wallet to Squads vault PDA.
 * This is a one-time operation — after this, only Squads can call confirm_delivery.
 *
 * Usage: node scripts/update-config-authority.cjs
 * Requires: ADMIN_SECRET in .env.local (admin wallet keypair as JSON array)
 */

require('dotenv').config({ path: '.env.local' });
const anchor = require('@coral-xyz/anchor');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const multisig = require('@sqds/multisig');
const fs = require('fs');
const path = require('path');

async function main() {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  const programId = new PublicKey(process.env.PROGRAM_ID);
  const msigPda = new PublicKey(process.env.NEXT_PUBLIC_SQUADS_MSIG);

  // Load admin keypair
  const adminSecret = JSON.parse(process.env.ADMIN_SECRET);
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminSecret));
  console.log('Admin wallet:', adminKeypair.publicKey.toBase58());

  // Derive vault PDA (new authority)
  const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPda, index: 0 });
  console.log('Squads vault PDA:', vaultPda.toBase58());
  console.log('Multisig account:', msigPda.toBase58());

  // Connect
  const connection = new Connection(endpoint, 'confirmed');
  const wallet = new anchor.Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/idl/luxhub_marketplace.json'), 'utf-8'));
  const program = new anchor.Program(idl, provider);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('luxhub-config')], programId);
  console.log('Config PDA:', configPda.toBase58());

  // Read current config
  const configBefore = await program.account.escrowConfig.fetch(configPda);
  console.log('\n--- Current Config ---');
  console.log('Authority:', configBefore.authority.toBase58());
  console.log('Treasury:', configBefore.treasury.toBase58());
  console.log('Fee BPS:', configBefore.feeBps);
  console.log('Paused:', configBefore.paused);

  if (configBefore.authority.toBase58() === vaultPda.toBase58()) {
    console.log('\n✅ Authority is already set to vault PDA. Nothing to do.');
    return;
  }

  console.log(`\n🔄 Updating authority: ${configBefore.authority.toBase58()} → ${vaultPda.toBase58()}`);

  // Call update_config with new_authority = vault PDA
  const tx = await program.methods
    .updateConfig(
      vaultPda,   // new_authority
      null,       // new_treasury (unchanged)
      null,       // new_fee_bps (unchanged)
      null,       // new_paused (unchanged)
    )
    .accounts({
      admin: adminKeypair.publicKey,
      config: configPda,
    })
    .signers([adminKeypair])
    .rpc();

  console.log('TX signature:', tx);

  // Verify
  const configAfter = await program.account.escrowConfig.fetch(configPda);
  console.log('\n--- Updated Config ---');
  console.log('Authority:', configAfter.authority.toBase58());
  console.log('Treasury:', configAfter.treasury.toBase58());
  console.log('Fee BPS:', configAfter.feeBps);
  console.log('Paused:', configAfter.paused);

  if (configAfter.authority.toBase58() === vaultPda.toBase58()) {
    console.log('\n✅ Authority successfully updated to Squads vault PDA!');
    console.log('⚠️  From now on, only Squads vault can execute confirm_delivery and refund_buyer.');
  } else {
    console.log('\n❌ Authority update failed!');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
