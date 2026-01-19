// src/pages/api/squads/approve.ts
// Endpoint for multisig members to approve or reject proposals
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

type VoteAction = 'approve' | 'reject';

interface ApproveRequest {
  transactionIndex: string;
  action?: VoteAction; // 'approve' (default) or 'reject'
  rpc?: string;
  multisigPda?: string;
}

interface ApproveResponse {
  ok: boolean;
  signature?: string;
  action: VoteAction;
  transactionIndex: string;
  multisigPda: string;
  member: string;
  approvals?: number;
  rejections?: number;
  threshold?: number;
  status?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApproveResponse>) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' } as ApproveResponse);
    }

    const {
      transactionIndex,
      action = 'approve',
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.body as ApproveRequest;

    if (!transactionIndex) {
      return res
        .status(400)
        .json({ ok: false, error: 'Missing transactionIndex' } as ApproveResponse);
    }
    if (!['approve', 'reject'].includes(action)) {
      return res
        .status(400)
        .json({
          ok: false,
          error: 'Invalid action. Must be "approve" or "reject"',
        } as ApproveResponse);
    }
    if (!rpc || !multisigPda) {
      return res
        .status(500)
        .json({ ok: false, error: 'RPC or MULTISIG env is not set' } as ApproveResponse);
    }
    if (!process.env.SQUADS_MEMBER_KEYPAIR_PATH && !process.env.SQUADS_MEMBER_KEYPAIR_JSON) {
      return res.status(500).json({
        ok: false,
        error: 'Missing SQUADS_MEMBER_KEYPAIR_PATH or SQUADS_MEMBER_KEYPAIR_JSON env',
      } as ApproveResponse);
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

    // Check proposal status first
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex: txIndexBig,
    });

    let proposal;
    let proposalStatus = 'None';
    try {
      proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      // Squads SDK returns status as { __kind: "Active" | "Executed" | ... }
      const statusObj = proposal.status as any;
      proposalStatus = statusObj?.__kind || Object.keys(statusObj)[0] || 'None';
    } catch {
      // Proposal doesn't exist yet - need to create it first
      proposalStatus = 'None';
    }

    // Validate status for voting
    const validStatusForVoting = ['None', 'Active', 'Draft'];
    const statusKey =
      proposalStatus.charAt(0).toUpperCase() + proposalStatus.slice(1).toLowerCase();

    if (!validStatusForVoting.includes(statusKey) && proposalStatus.toLowerCase() !== 'none') {
      return res.status(400).json({
        ok: false,
        error: `Cannot ${action} proposal with status: ${proposalStatus}`,
        status: proposalStatus,
      } as ApproveResponse);
    }

    const instructions = [];
    const { blockhash } = await connection.getLatestBlockhash();

    // If proposal doesn't exist, create it first
    if (statusKey === 'None' || proposalStatus === 'none') {
      const createProposalIx = multisig.instructions.proposalCreate({
        multisigPda: msigPk,
        creator: member.publicKey,
        transactionIndex: txIndexBig,
        isDraft: false,
        rentPayer: member.publicKey,
      });
      instructions.push(createProposalIx);
    }

    // If proposal is Draft, activate it first
    if (statusKey === 'Draft') {
      const activateIx = multisig.instructions.proposalActivate({
        multisigPda: msigPk,
        member: member.publicKey,
        transactionIndex: txIndexBig,
      });
      instructions.push(activateIx);
    }

    // Add the vote instruction
    if (action === 'approve') {
      const approveIx = multisig.instructions.proposalApprove({
        multisigPda: msigPk,
        member: member.publicKey,
        transactionIndex: txIndexBig,
      });
      instructions.push(approveIx);
    } else {
      const rejectIx = multisig.instructions.proposalReject({
        multisigPda: msigPk,
        member: member.publicKey,
        transactionIndex: txIndexBig,
      });
      instructions.push(rejectIx);
    }

    // Build and send transaction
    const txMessage = new TransactionMessage({
      payerKey: member.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(txMessage);
    transaction.sign([member]);

    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: true,
    });
    await connection.confirmTransaction(signature, 'confirmed');

    // Fetch updated proposal state
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    let updatedProposal;
    try {
      updatedProposal = await multisig.accounts.Proposal.fromAccountAddress(
        connection,
        proposalPda
      );
    } catch {
      // May fail if executed already
    }

    const approvals = updatedProposal?.approved?.length ?? 0;
    const rejections = updatedProposal?.rejected?.length ?? 0;
    const updatedStatusObj = updatedProposal?.status as any;
    const newStatus =
      updatedStatusObj?.__kind?.toLowerCase() ||
      (updatedProposal ? Object.keys(updatedStatusObj)[0] : 'unknown');

    return res.status(200).json({
      ok: true,
      signature,
      action,
      transactionIndex,
      multisigPda,
      member: member.publicKey.toBase58(),
      approvals,
      rejections,
      threshold: multisigAccount.threshold,
      status: newStatus,
    });
  } catch (e: any) {
    console.error('[/api/squads/approve] error:', e);
    return res.status(500).json({
      ok: false,
      error: e?.message ?? 'Unknown error',
    } as ApproveResponse);
  }
}
