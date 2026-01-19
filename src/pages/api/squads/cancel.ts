// src/pages/api/squads/cancel.ts
// Endpoint for proposal creators to cancel their proposals
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

export const config = {
  runtime: 'nodejs',
};

interface CancelResponse {
  ok: boolean;
  signature?: string;
  transactionIndex: string;
  multisigPda: string;
  cancelledBy: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<CancelResponse>) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' } as CancelResponse);
    }

    const {
      transactionIndex,
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.body as {
      transactionIndex?: string;
      rpc?: string;
      multisigPda?: string;
    };

    if (!transactionIndex) {
      return res
        .status(400)
        .json({ ok: false, error: 'Missing transactionIndex' } as CancelResponse);
    }
    if (!rpc || !multisigPda) {
      return res
        .status(500)
        .json({ ok: false, error: 'RPC or MULTISIG env is not set' } as CancelResponse);
    }
    if (!process.env.SQUADS_MEMBER_KEYPAIR_PATH && !process.env.SQUADS_MEMBER_KEYPAIR_JSON) {
      return res.status(500).json({
        ok: false,
        error: 'Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env',
      } as CancelResponse);
    }

    // Load member keypair
    const member = (() => {
      const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
      const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
      const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    })();

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);
    const txIndexBig = BigInt(transactionIndex);

    // Check proposal exists and can be cancelled
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex: txIndexBig,
    });

    let proposal;
    try {
      proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
    } catch {
      return res.status(400).json({
        ok: false,
        error: 'Proposal not found',
      } as CancelResponse);
    }

    // Squads SDK returns status as { __kind: "Active" | "Executed" | ... }
    const statusObj = proposal.status as any;
    const proposalStatus = statusObj?.__kind || Object.keys(statusObj)[0];

    // Can only cancel Active or Draft proposals
    if (!['active', 'draft', 'Active', 'Draft'].includes(proposalStatus)) {
      return res.status(400).json({
        ok: false,
        error: `Cannot cancel proposal with status: ${proposalStatus}`,
      } as CancelResponse);
    }

    const { blockhash } = await connection.getLatestBlockhash();

    // Cancel instruction
    const cancelIx = multisig.instructions.proposalCancel({
      multisigPda: msigPk,
      member: member.publicKey,
      transactionIndex: txIndexBig,
    });

    const txMessage = new TransactionMessage({
      payerKey: member.publicKey,
      recentBlockhash: blockhash,
      instructions: [cancelIx],
    }).compileToV0Message();

    const transaction = new VersionedTransaction(txMessage);
    transaction.sign([member]);

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: true,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    return res.status(200).json({
      ok: true,
      signature,
      transactionIndex,
      multisigPda,
      cancelledBy: member.publicKey.toBase58(),
    });
  } catch (e: any) {
    console.error('[/api/squads/cancel] error:', e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? 'Unknown error',
    } as CancelResponse);
  }
}
