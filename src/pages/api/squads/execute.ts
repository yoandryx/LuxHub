// src/pages/api/squads/execute.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { readFileSync } from 'fs';

export const config = {
  runtime: 'nodejs',
};

interface ExecuteResponse {
  ok: boolean;
  signature?: string;
  transactionIndex: string;
  multisigPda: string;
  vaultIndex: number;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      transactionIndex,
      vaultIndex = 0,
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.body as {
      transactionIndex?: string;
      vaultIndex?: number;
      rpc?: string;
      multisigPda?: string;
    };

    if (!transactionIndex) {
      return res.status(400).json({ error: 'Missing transactionIndex' });
    }
    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }
    if (!process.env.SQUADS_MEMBER_KEYPAIR_PATH && !process.env.SQUADS_MEMBER_KEYPAIR_JSON) {
      return res
        .status(500)
        .json({ error: 'Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env' });
    }

    // Load a Squads member keypair
    const payer = (() => {
      const path = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
      const json = process.env.SQUADS_MEMBER_KEYPAIR_JSON;
      const secret = path ? JSON.parse(readFileSync(path, 'utf-8')) : JSON.parse(json!);
      return Keypair.fromSecretKey(Uint8Array.from(secret));
    })();

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);
    const txIndexBig = BigInt(transactionIndex);

    // Check if proposal has met threshold before executing
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex: txIndexBig,
    });

    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const threshold = multisigAccount.threshold;

    let proposal;
    try {
      proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
    } catch (e: any) {
      return res.status(400).json({
        error: 'Proposal not found. It may not exist or has already been executed.',
      });
    }

    const approvals = proposal.approved?.length ?? 0;
    const proposalStatus = proposal.status;

    // Check if already executed
    if ('executed' in proposalStatus) {
      return res.status(400).json({
        error: 'Proposal has already been executed',
      });
    }

    // Check if rejected or cancelled
    if ('rejected' in proposalStatus) {
      return res.status(400).json({
        error: 'Proposal was rejected and cannot be executed',
      });
    }
    if ('cancelled' in proposalStatus) {
      return res.status(400).json({
        error: 'Proposal was cancelled and cannot be executed',
      });
    }

    // Check threshold
    if (approvals < threshold) {
      return res.status(400).json({
        error: `Proposal has not met threshold. Approvals: ${approvals}/${threshold}`,
        approvals,
        threshold,
      });
    }

    // Execute the vault transaction
    const signature = await multisig.rpc.vaultTransactionExecute({
      connection,
      feePayer: payer,
      multisigPda: msigPk,
      transactionIndex: txIndexBig,
      member: payer.publicKey,
    });

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed');

    return res.status(200).json({
      ok: true,
      signature,
      transactionIndex,
      multisigPda,
      vaultIndex,
    } as ExecuteResponse);
  } catch (e: any) {
    console.error('[/api/squads/execute] error:', e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
