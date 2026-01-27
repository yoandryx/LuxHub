// src/lib/services/squadService.ts
// Service for Squads Protocol v4 DAO management
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

// Default configuration
const DEFAULT_THRESHOLD_PERCENT = 60; // 60% approval threshold
const DEFAULT_TIME_LOCK = 0; // No time lock by default
const MIN_HOLDER_BALANCE = parseInt(process.env.MIN_HOLDER_BALANCE_FOR_MEMBERSHIP || '1000', 10);
const TOP_HOLDERS_COUNT = parseInt(process.env.TOP_HOLDERS_COUNT || '100', 10);

interface SquadMember {
  wallet: string;
  tokenBalance: number;
  ownershipPercent: number;
  permissions: number;
}

interface CreateSquadResult {
  multisigPda: string;
  vaultPda: string;
  createKey: string;
  signature: string;
  threshold: number;
  members: SquadMember[];
}

interface TransferNftResult {
  signature: string;
  fromWallet: string;
  toVault: string;
  nftMint: string;
}

interface ProposalResult {
  transactionIndex: string;
  proposalPda: string;
  vaultTransactionPda: string;
  signature: string;
  squadsDeepLink: string;
}

/**
 * Load the Squads member keypair from environment
 */
function loadPayerKeypair(): Keypair {
  const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
  const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;

  if (!path && !json) {
    throw new Error('Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env');
  }

  const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/**
 * Get connection to Solana
 */
function getConnection(): Connection {
  const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!rpc) {
    throw new Error('NEXT_PUBLIC_SOLANA_ENDPOINT not configured');
  }
  return new Connection(rpc, 'confirmed');
}

/**
 * Create a new Squad multisig from pool token holders
 * Top holders become members with voting power based on ownership
 *
 * @param poolId - Pool ID for reference
 * @param holders - Array of token holders (should be sorted by balance desc)
 * @param thresholdPercent - Approval threshold percentage (default 60)
 */
export async function createPoolSquad(
  poolId: string,
  holders: SquadMember[],
  thresholdPercent: number = DEFAULT_THRESHOLD_PERCENT
): Promise<CreateSquadResult> {
  const connection = getConnection();
  const payer = loadPayerKeypair();

  // Filter holders meeting minimum balance and take top N
  const eligibleHolders = holders
    .filter((h) => h.tokenBalance >= MIN_HOLDER_BALANCE)
    .slice(0, TOP_HOLDERS_COUNT);

  if (eligibleHolders.length < 2) {
    throw new Error('Need at least 2 eligible holders to create a Squad');
  }

  // Create a unique key for this multisig
  const createKey = Keypair.generate();

  // Calculate threshold (minimum 1, at least 60% of members by default)
  const threshold = Math.max(1, Math.ceil(eligibleHolders.length * (thresholdPercent / 100)));

  // Build members config - all members get basic permissions (vote, execute)
  const members = eligibleHolders.map((holder) => ({
    key: new PublicKey(holder.wallet),
    permissions: multisig.types.Permissions.all(), // Full permissions for governance
  }));

  // Create the multisig
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });

  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: 0,
  });

  const { blockhash } = await connection.getLatestBlockhash();

  // Build create instruction
  const createIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: payer.publicKey,
    multisigPda,
    configAuthority: null, // No external authority
    threshold,
    members,
    timeLock: DEFAULT_TIME_LOCK,
    rentCollector: null,
    treasury: vaultPda, // Use vault as treasury
    memo: `LuxHub Pool Squad: ${poolId}`,
  });

  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [createIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, createKey]);

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, 'confirmed');

  // Return results with member data
  const squadMembers: SquadMember[] = eligibleHolders.map((h) => ({
    wallet: h.wallet,
    tokenBalance: h.tokenBalance,
    ownershipPercent: h.ownershipPercent,
    permissions: 1, // Basic member
  }));

  return {
    multisigPda: multisigPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    createKey: createKey.publicKey.toBase58(),
    signature,
    threshold,
    members: squadMembers,
  };
}

/**
 * Get Squad members for an existing multisig
 *
 * @param multisigPda - The multisig PDA address
 */
export async function getSquadMembers(multisigPda: string): Promise<{
  members: { wallet: string; permissions: number }[];
  threshold: number;
}> {
  const connection = getConnection();
  const msigPk = new PublicKey(multisigPda);

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

  const members = multisigAccount.members.map((m) => ({
    wallet: m.key.toBase58(),
    permissions: m.permissions.mask,
  }));

  return {
    members,
    threshold: multisigAccount.threshold,
  };
}

/**
 * Create a governance proposal in the Squad
 *
 * @param multisigPda - The multisig PDA address
 * @param proposalType - Type of proposal (relist_for_sale, accept_offer, etc.)
 * @param instructionData - The instruction data for the proposal
 */
export async function createGovernanceProposal(
  multisigPda: string,
  proposalType: 'relist_for_sale' | 'accept_offer' | 'custom',
  instructionData: {
    programId: string;
    keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
    dataBase64: string;
  }
): Promise<ProposalResult> {
  const connection = getConnection();
  const payer = loadPayerKeypair();
  const msigPk = new PublicKey(multisigPda);

  // Get current transaction index
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
  const currentIndex = Number(multisigAccount.transactionIndex);
  const transactionIndex = BigInt(currentIndex + 1);

  const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: 0 });

  // Build the instruction from data
  const ix = {
    programId: new PublicKey(instructionData.programId),
    keys: instructionData.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(instructionData.dataBase64, 'base64'),
  };

  const { blockhash } = await connection.getLatestBlockhash();

  // Build transaction message for vault
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [ix],
  });

  // Create vault transaction
  const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
    multisigPda: msigPk,
    creator: payer.publicKey,
    transactionIndex,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    rentPayer: payer.publicKey,
  });

  // Create proposal
  const proposalCreateIx = multisig.instructions.proposalCreate({
    multisigPda: msigPk,
    creator: payer.publicKey,
    transactionIndex,
    isDraft: false,
    rentPayer: payer.publicKey,
  });

  // Auto-approve by creator
  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: msigPk,
    member: payer.publicKey,
    transactionIndex,
  });

  // Build and sign transaction
  const txMessage = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [vaultTxCreateIx, proposalCreateIx, approveIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(txMessage);
  transaction.sign([payer]);

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, 'confirmed');

  // Compute PDAs
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: msigPk,
    transactionIndex,
  });

  const [vaultTxPda] = multisig.getTransactionPda({
    multisigPda: msigPk,
    index: transactionIndex,
  });

  const squadsDeepLink = `https://v4.squads.so/squads/${msigPk.toBase58()}/tx/${transactionIndex.toString()}`;

  return {
    transactionIndex: transactionIndex.toString(),
    proposalPda: proposalPda.toBase58(),
    vaultTransactionPda: vaultTxPda.toBase58(),
    signature,
    squadsDeepLink,
  };
}

/**
 * Transfer an NFT to the Squad vault
 * This should be called after Squad creation to custody the pool's NFT
 *
 * @param nftMint - The NFT mint address
 * @param fromWallet - Current NFT holder wallet
 * @param vaultPda - Squad vault PDA to receive the NFT
 */
export async function transferNftToSquadVault(
  nftMint: string,
  fromWallet: string,
  vaultPda: string
): Promise<TransferNftResult> {
  // Note: This requires the NFT owner to sign the transaction
  // In practice, this would be initiated by the admin/platform when
  // the pool graduates and the NFT should be transferred to the DAO

  const connection = getConnection();
  const payer = loadPayerKeypair();

  // For now, return the parameters needed for the transfer
  // The actual transfer would need to be done via a signed transaction
  // from the current NFT owner (likely LuxHub custody wallet)

  return {
    signature: 'pending', // Would be filled after actual transfer
    fromWallet,
    toVault: vaultPda,
    nftMint,
  };
}

/**
 * Approve a proposal (vote yes)
 *
 * @param multisigPda - The multisig PDA address
 * @param transactionIndex - The proposal transaction index
 * @param memberKeypair - The voting member's keypair (optional, uses default if not provided)
 */
export async function approveProposal(
  multisigPda: string,
  transactionIndex: string,
  memberKeypair?: Keypair
): Promise<{ signature: string; approvals: number; threshold: number }> {
  const connection = getConnection();
  const member = memberKeypair || loadPayerKeypair();
  const msigPk = new PublicKey(multisigPda);
  const txIndexBig = BigInt(transactionIndex);

  const { blockhash } = await connection.getLatestBlockhash();

  const approveIx = multisig.instructions.proposalApprove({
    multisigPda: msigPk,
    member: member.publicKey,
    transactionIndex: txIndexBig,
  });

  const message = new TransactionMessage({
    payerKey: member.publicKey,
    recentBlockhash: blockhash,
    instructions: [approveIx],
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  transaction.sign([member]);

  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, 'confirmed');

  // Get updated approval count
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: msigPk,
    transactionIndex: txIndexBig,
  });

  const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

  return {
    signature,
    approvals: proposal.approved?.length ?? 0,
    threshold: multisigAccount.threshold,
  };
}

/**
 * Execute an approved proposal
 *
 * @param multisigPda - The multisig PDA address
 * @param transactionIndex - The proposal transaction index
 */
export async function executeProposal(
  multisigPda: string,
  transactionIndex: string
): Promise<{ signature: string; executed: boolean }> {
  const connection = getConnection();
  const payer = loadPayerKeypair();
  const msigPk = new PublicKey(multisigPda);
  const txIndexBig = BigInt(transactionIndex);

  // Check if proposal has met threshold
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: msigPk,
    transactionIndex: txIndexBig,
  });

  const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

  const approvals = proposal.approved?.length ?? 0;
  const threshold = multisigAccount.threshold;

  if (approvals < threshold) {
    throw new Error(`Proposal has not met threshold. Approvals: ${approvals}/${threshold}`);
  }

  // Execute the transaction
  const signature = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: payer,
    multisigPda: msigPk,
    transactionIndex: txIndexBig,
    member: payer.publicKey,
  });

  await connection.confirmTransaction(signature, 'confirmed');

  return {
    signature,
    executed: true,
  };
}

/**
 * Get proposal status
 *
 * @param multisigPda - The multisig PDA address
 * @param transactionIndex - The proposal transaction index
 */
export async function getProposalStatus(
  multisigPda: string,
  transactionIndex: string
): Promise<{
  status: string;
  approvals: number;
  rejections: number;
  threshold: number;
  approved: string[];
  rejected: string[];
}> {
  const connection = getConnection();
  const msigPk = new PublicKey(multisigPda);
  const txIndexBig = BigInt(transactionIndex);

  const [proposalPda] = multisig.getProposalPda({
    multisigPda: msigPk,
    transactionIndex: txIndexBig,
  });

  const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

  // Determine status string
  let status = 'unknown';
  if ('draft' in proposal.status) status = 'draft';
  else if ('active' in proposal.status) status = 'active';
  else if ('approved' in proposal.status) status = 'approved';
  else if ('rejected' in proposal.status) status = 'rejected';
  else if ('executed' in proposal.status) status = 'executed';
  else if ('cancelled' in proposal.status) status = 'cancelled';

  return {
    status,
    approvals: proposal.approved?.length ?? 0,
    rejections: proposal.rejected?.length ?? 0,
    threshold: multisigAccount.threshold,
    approved: proposal.approved?.map((pk) => pk.toBase58()) ?? [],
    rejected: proposal.rejected?.map((pk) => pk.toBase58()) ?? [],
  };
}
