/**
 * scripts/initialize-escrow-config.ts
 *
 * Initializes the EscrowConfig PDA on Solana (devnet or mainnet-beta).
 * This creates the protocol-level configuration that controls:
 *   - authority: The admin/multisig that can update config
 *   - treasury: Where marketplace fees (3%) are sent
 *   - fee_bps: Fee in basis points (300 = 3%)
 *   - paused: Emergency pause flag
 *
 * Usage:
 *   npx ts-node scripts/initialize-escrow-config.ts \
 *     --programId <PROGRAM_ID> \
 *     --keypair keys/mainnet/deploy.json \
 *     --authority <ADMIN_OR_MULTISIG_PUBKEY> \
 *     --treasury <TREASURY_WALLET_PUBKEY> \
 *     --feeBps 300 \
 *     --cluster mainnet-beta
 *
 * The keypair provided must have enough SOL to pay for the PDA rent (~0.002 SOL).
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { Program, AnchorProvider, Wallet } = pkg;
type Idl = any;
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI arguments
function parseArgs(): {
  programId: string;
  keypairPath: string;
  authority: string;
  treasury: string;
  feeBps: number;
  cluster: string;
} {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    parsed[key] = args[i + 1];
  }

  if (!parsed.programId || !parsed.keypair || !parsed.authority || !parsed.treasury) {
    console.error('Usage:');
    console.error('  npx ts-node scripts/initialize-escrow-config.ts \\');
    console.error('    --programId <PROGRAM_ID> \\');
    console.error('    --keypair <KEYPAIR_PATH> \\');
    console.error('    --authority <AUTHORITY_PUBKEY> \\');
    console.error('    --treasury <TREASURY_PUBKEY> \\');
    console.error('    --feeBps 300 \\');
    console.error('    --cluster mainnet-beta');
    process.exit(1);
  }

  return {
    programId: parsed.programId,
    keypairPath: parsed.keypair,
    authority: parsed.authority,
    treasury: parsed.treasury,
    feeBps: parseInt(parsed.feeBps || '300', 10),
    cluster: parsed.cluster || 'devnet',
  };
}

async function main() {
  const config = parseArgs();

  // RPC endpoint
  const rpcUrls: Record<string, string> = {
    devnet: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com',
    'mainnet-beta':
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com',
    mainnet: process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com',
  };

  const rpcUrl = rpcUrls[config.cluster] || rpcUrls['devnet'];
  const connection = new Connection(rpcUrl, 'confirmed');

  console.log('=== LuxHub EscrowConfig Initialization ===\n');
  console.log('Cluster:    ', config.cluster);
  console.log('RPC:        ', rpcUrl);
  console.log('Program ID: ', config.programId);
  console.log('Authority:  ', config.authority);
  console.log('Treasury:   ', config.treasury);
  console.log('Fee BPS:    ', config.feeBps, `(${config.feeBps / 100}%)`);

  // Load keypair
  const keypairPath = path.resolve(config.keypairPath);
  if (!fs.existsSync(keypairPath)) {
    console.error(`\nKeypair file not found: ${keypairPath}`);
    process.exit(1);
  }

  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  console.log('Payer:      ', payer.publicKey.toBase58());

  // Check payer balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:    ', (balance / 1e9).toFixed(4), 'SOL\n');

  if (balance < 0.01 * 1e9) {
    console.error('Insufficient balance. Need at least 0.01 SOL for rent.');
    process.exit(1);
  }

  // Load IDL
  const idlPath = path.resolve(__dirname, '..', 'src', 'idl', 'luxhub_marketplace.json');
  if (!fs.existsSync(idlPath)) {
    console.error(`IDL file not found: ${idlPath}`);
    process.exit(1);
  }
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

  // Create provider and program
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });

  // Override the IDL address with the target program ID
  const programId = new PublicKey(config.programId);
  const modifiedIdl = { ...idl, address: config.programId };
  const program = new Program(modifiedIdl as Idl, provider);

  // Derive config PDA
  const CONFIG_SEED = Buffer.from('luxhub-config');
  const [configPda, bump] = PublicKey.findProgramAddressSync([CONFIG_SEED], programId);

  console.log('Config PDA: ', configPda.toBase58());
  console.log('Config bump:', bump);

  // Check if config already exists
  const existingAccount = await connection.getAccountInfo(configPda);
  if (existingAccount) {
    console.log('\nConfig PDA already exists on-chain!');
    console.log('Account owner:', existingAccount.owner.toBase58());
    console.log('Data length:  ', existingAccount.data.length, 'bytes');
    console.log('\nTo reinitialize, first close the existing config with close_config.');
    process.exit(0);
  }

  console.log('\nConfig PDA does not exist yet. Proceeding with initialization...\n');

  // Call initialize_config
  try {
    const tx = await program.methods
      .initializeConfig(
        new PublicKey(config.authority),
        new PublicKey(config.treasury),
        config.feeBps
      )
      .accounts({
        payer: payer.publicKey,
        config: configPda,
        systemProgram: PublicKey.default,
      })
      .signers([payer])
      .rpc();

    console.log('Transaction confirmed:', tx);
    console.log('\n=== EscrowConfig Initialized Successfully ===\n');
    console.log('Config PDA:     ', configPda.toBase58());
    console.log('Authority:      ', config.authority);
    console.log('Treasury:       ', config.treasury);
    console.log('Fee BPS:        ', config.feeBps);
    console.log('TX Signature:   ', tx);
    console.log('\nExplorer URL:');

    if (config.cluster === 'mainnet-beta' || config.cluster === 'mainnet') {
      console.log(`  https://solscan.io/tx/${tx}`);
    } else {
      console.log(`  https://solscan.io/tx/${tx}?cluster=devnet`);
    }

    console.log('\nAdd to .env.local:');
    console.log(`  ESCROW_CONFIG_PDA=${configPda.toBase58()}`);
  } catch (error: any) {
    console.error('\nFailed to initialize config:', error.message);
    if (error.logs) {
      console.error('\nProgram logs:');
      error.logs.forEach((log: string) => console.error('  ', log));
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
