// scripts/test-escrow-squads.ts
// Test the full escrow flow with Squads multisig integration
// Run with: npx ts-node --esm --skipProject scripts/test-escrow-squads.ts

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import * as multisig from '@sqds/multisig';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT!;
const KEYPAIR_PATH = process.env.SQUADS_MEMBER_KEYPAIR_PATH!;
const SQUADS_MSIG = process.env.NEXT_PUBLIC_SQUADS_MSIG!;
const PROGRAM_ID = new PublicKey('kW2w2pHhAP8hFGRLganziunchKu6tjaXyomvF6jxNpj');

// Load IDL
const idl = JSON.parse(fs.readFileSync('./src/idl/anchor_escrow.json', 'utf-8'));

async function main() {
  console.log('=== Testing Escrow + Squads Integration ===\n');

  // Load keypair
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Payer:', payer.publicKey.toBase58());
  console.log('Squads Multisig:', SQUADS_MSIG);

  const connection = new Connection(RPC_URL, 'confirmed');

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL\n');

  // Create Anchor provider and program
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(idl, provider);

  // Derive PDAs
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('luxhub-config')],
    PROGRAM_ID
  );
  console.log('Config PDA:', configPda.toBase58());

  // Get Squads vault PDA
  const msigPk = new PublicKey(SQUADS_MSIG);
  const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });
  console.log('Squads Vault PDA:', vaultPda.toBase58());

  // Step 1: Initialize Config (if not exists)
  console.log('\n--- Step 1: Initialize Escrow Config ---');
  const configInfo = await connection.getAccountInfo(configPda);

  if (!configInfo) {
    console.log('Initializing config with Squads multisig...');
    try {
      const tx = await program.methods
        .initializeConfig(msigPk, payer.publicKey) // squads_multisig, squads_authority
        .accounts({
          payer: payer.publicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([payer])
        .rpc();
      console.log('Config initialized! Tx:', tx);
    } catch (e: any) {
      console.log('Config init error (may already exist):', e.message);
    }
  } else {
    console.log('Config already exists');
    // Decode and show config
    try {
      const config = await (program.account as any).escrowConfig.fetch(configPda);
      console.log('  squads_multisig:', (config as any).squadsMultisig?.toBase58());
      console.log('  squads_authority:', (config as any).squadsAuthority?.toBase58());
    } catch (e) {
      console.log('Could not decode config');
    }
  }

  // Step 2: Check for existing escrows or create a mock one
  console.log('\n--- Step 2: Check/Create Test Escrow ---');

  // For testing, we'll create a simple escrow scenario
  // In reality, escrows are created when sellers list NFTs
  const testSeed = Date.now(); // unique seed
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('state'),
      new BN(testSeed).toArrayLike(Buffer, 'le', 8),
    ],
    PROGRAM_ID
  );
  console.log('Test Escrow PDA (seed=' + testSeed + '):', escrowPda.toBase58());

  // Step 3: Build confirm_delivery instruction for Squads proposal
  console.log('\n--- Step 3: Build confirm_delivery Instruction ---');

  // The confirm_delivery instruction requires:
  // - escrow account
  // - buyer (who receives NFT)
  // - seller (who receives payment)
  // - luxhub_wallet (treasury - Squads vault)
  // - token accounts, etc.

  // For this test, we'll show how to build the instruction
  // In production, you'd use real escrow data from MongoDB

  console.log('\nTo test with a real escrow:');
  console.log('1. Create an NFT listing via the frontend');
  console.log('2. Have a buyer purchase (funds deposited to escrow)');
  console.log('3. Admin creates Squads proposal for confirm_delivery');
  console.log('4. Multisig members approve in Squads UI');
  console.log('5. Execute proposal to release funds\n');

  // Show the instruction format that would be sent to /api/squads/propose
  console.log('Example API call to /api/squads/propose:');
  console.log(JSON.stringify({
    programId: PROGRAM_ID.toBase58(),
    keys: [
      { pubkey: '<escrow_pda>', isSigner: false, isWritable: true },
      { pubkey: '<buyer_pubkey>', isSigner: false, isWritable: true },
      { pubkey: '<seller_pubkey>', isSigner: false, isWritable: true },
      { pubkey: vaultPda.toBase58(), isSigner: false, isWritable: true }, // treasury
      { pubkey: '<nft_vault_ata>', isSigner: false, isWritable: true },
      { pubkey: '<buyer_nft_ata>', isSigner: false, isWritable: true },
      { pubkey: '<escrow_sol_vault>', isSigner: false, isWritable: true },
      { pubkey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', isSigner: false, isWritable: false },
      { pubkey: '11111111111111111111111111111111', isSigner: false, isWritable: false },
    ],
    dataBase64: '<confirm_delivery_discriminator_base64>',
    vaultIndex: 0,
    autoApprove: true,
  }, null, 2));

  // Get the instruction discriminator for confirm_delivery
  console.log('\n--- confirm_delivery Discriminator ---');
  const confirmDeliveryDiscriminator = Buffer.from([
    // Anchor uses first 8 bytes of sha256("global:confirm_delivery")
    0x5f, 0x55, 0x39, 0xeb, 0x60, 0x9f, 0x0e, 0x00
  ]);
  console.log('Discriminator (hex):', confirmDeliveryDiscriminator.toString('hex'));
  console.log('Discriminator (base64):', confirmDeliveryDiscriminator.toString('base64'));

  console.log('\n=== Setup Complete ===');
  console.log('Squads Multisig:', SQUADS_MSIG);
  console.log('Squads Vault (Treasury):', vaultPda.toBase58());
  console.log('Escrow Program:', PROGRAM_ID.toBase58());
}

main().catch(console.error);
