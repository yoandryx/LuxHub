// scripts/create-squads-multisig.ts
// Creates a new Squads v4 multisig on devnet
// Run with: npx ts-node scripts/create-squads-multisig.ts

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: '.env.local' });

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com';
const KEYPAIR_PATH = process.env.SQUADS_MEMBER_KEYPAIR_PATH || '/home/ycstudio/luxhub-squads-member.json';

async function main() {
  console.log('=== Creating Squads v4 Multisig on Devnet ===\n');

  // Load keypair
  const secretKey = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const creator = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Creator/Member:', creator.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(creator.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  if (balance < 0.01 * 1e9) {
    console.log('\n⚠️  Low balance! Requesting airdrop...');
    try {
      const sig = await connection.requestAirdrop(creator.publicKey, 1 * 1e9);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Airdrop successful!');
    } catch (e: any) {
      console.log('Airdrop failed (may be rate limited):', e.message);
    }
  }

  // Generate a unique create key for this multisig
  const createKey = Keypair.generate();
  console.log('\nCreate Key:', createKey.publicKey.toBase58());

  // Derive multisig PDA
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  console.log('Multisig PDA:', multisigPda.toBase58());

  // Check if already exists
  const existing = await connection.getAccountInfo(multisigPda);
  if (existing) {
    console.log('\n✅ Multisig already exists at this PDA!');
    return;
  }

  // Get program config for treasury
  const [programConfigPda] = multisig.getProgramConfigPda({});
  let configTreasury: PublicKey;
  try {
    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda
    );
    configTreasury = programConfig.treasury;
  } catch {
    // Use default if config doesn't exist
    configTreasury = new PublicKey('9gZa62kLiPLND6d57nTm5yx5bKN7qjNBjdDGqMi6aVZd');
  }

  // Define members - single member with all permissions for testing
  const members = [
    {
      key: creator.publicKey,
      permissions: multisig.types.Permissions.all(), // Initiate, Vote, Execute
    },
  ];

  // Threshold = 1 for single-member testing (change for production!)
  const threshold = 1;

  console.log('\nCreating multisig with:');
  console.log('  - Members:', members.length);
  console.log('  - Threshold:', threshold);
  console.log('  - Permissions: Initiate, Vote, Execute');

  // Create multisig instruction
  const createMultisigIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: creator.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    threshold,
    members,
    rentCollector: null,
    treasury: configTreasury,
  });

  // Build and send transaction
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: creator.publicKey,
    recentBlockhash: blockhash,
    instructions: [createMultisigIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([creator, createKey]);

  console.log('\nSending transaction...');
  const signature = await connection.sendTransaction(transaction);
  console.log('Signature:', signature);

  await connection.confirmTransaction(signature, 'confirmed');
  console.log('\n✅ Multisig created successfully!');

  // Get vault PDA
  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: 0,
  });

  console.log('\n=== IMPORTANT: Update your .env.local ===');
  console.log(`NEXT_PUBLIC_SQUADS_MSIG="${multisigPda.toBase58()}"`);
  console.log(`\nVault PDA (index 0): ${vaultPda.toBase58()}`);
  console.log('\nSquads UI: https://v4.squads.so/squads/' + multisigPda.toBase58() + '?cluster=devnet');
}

main().catch(console.error);
