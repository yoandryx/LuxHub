// src/pages/api/squads/propose.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

type IxKey = { pubkey: string; isSigner: boolean; isWritable: boolean };

export const config = {
  runtime: 'nodejs', // ensure we're not on Edge (fs needed)
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      programId,
      keys,
      dataBase64,
      vaultIndex = 0,
      autoApprove = true, // Auto-approve by the creator (recommended)
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.body as {
      programId?: string;
      keys?: IxKey[];
      dataBase64?: string;
      vaultIndex?: number;
      autoApprove?: boolean;
      rpc?: string;
      multisigPda?: string;
    };

    if (!programId || !keys || !dataBase64) {
      return res.status(400).json({ error: 'Missing programId, keys, or dataBase64' });
    }
    if (!Array.isArray(keys)) {
      return res.status(400).json({ error: 'keys must be an array' });
    }
    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }
    if (!process.env.SQUADS_MEMBER_KEYPAIR_PATH && !process.env.SQUADS_MEMBER_KEYPAIR_JSON) {
      return res
        .status(500)
        .json({ error: 'Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env' });
    }

    // Load a Squads member keypair (must be a member of the multisig)
    const payer = (() => {
      const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
      const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
      const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    })();

    const connection = new Connection(rpc, 'confirmed');
    const programPk = new PublicKey(programId);
    const msigPk = new PublicKey(multisigPda);

    // Fetch multisig account to get next transaction index
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

    const currentIndex = Number(multisigAccount.transactionIndex);
    const transactionIndex = BigInt(currentIndex + 1);

    const [vaultPda] = multisig.getVaultPda({ multisigPda: msigPk, index: vaultIndex });

    // Build the instruction from the client payload
    const ix = {
      programId: programPk,
      keys: keys.map((k) => ({
        pubkey: new PublicKey(k.pubkey),
        isSigner: k.isSigner,
        isWritable: k.isWritable,
      })),
      data: Buffer.from(dataBase64, 'base64'),
    };

    const { blockhash } = await connection.getLatestBlockhash();

    // Build the TransactionMessage for the vault transaction
    const message = new TransactionMessage({
      payerKey: vaultPda, // Squads vault pays fees when executed
      recentBlockhash: blockhash,
      instructions: [ix],
    });

    // Step 1: Create vault transaction instruction
    const vaultTxCreateIx = multisig.instructions.vaultTransactionCreate({
      multisigPda: msigPk,
      creator: payer.publicKey,
      transactionIndex,
      vaultIndex,
      ephemeralSigners: 0,
      transactionMessage: message,
      rentPayer: payer.publicKey,
    });

    // Step 2: Create proposal instruction (CRITICAL - was missing before!)
    const proposalCreateIx = multisig.instructions.proposalCreate({
      multisigPda: msigPk,
      creator: payer.publicKey,
      transactionIndex,
      isDraft: false, // Active proposal, ready for voting
      rentPayer: payer.publicKey,
    });

    // Build the transaction with both instructions
    const instructions = [vaultTxCreateIx, proposalCreateIx];

    // Step 3: Auto-approve if enabled (creator votes yes)
    if (autoApprove) {
      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: msigPk,
        member: payer.publicKey,
        transactionIndex,
      });
      instructions.push(approveIx);
    }

    // Create and sign the transaction
    const txMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(txMessage);
    transaction.sign([payer]);

    // Send and confirm
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    // Compute PDAs for response
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex,
    });

    const [vaultTxPda] = multisig.getTransactionPda({
      multisigPda: msigPk,
      index: transactionIndex,
    });

    // Generate deep link to Squads UI for additional approvals
    const squadsDeepLink = `https://v4.squads.so/squads/${msigPk.toBase58()}/tx/${transactionIndex.toString()}`;

    return res.status(200).json({
      ok: true,
      signature,
      multisigPda: msigPk.toBase58(),
      vaultPda: vaultPda.toBase58(),
      vaultIndex,
      transactionIndex: transactionIndex.toString(),
      proposalPda: proposalPda.toBase58(),
      vaultTransactionPda: vaultTxPda.toBase58(),
      autoApproved: autoApprove,
      threshold: multisigAccount.threshold,
      squadsDeepLink,
    });
  } catch (e: any) {
    console.error('[/api/squads/propose] error:', e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
