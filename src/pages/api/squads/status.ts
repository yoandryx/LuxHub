// src/pages/api/squads/status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

export const config = {
  runtime: 'nodejs',
};

interface StatusResponse {
  status: 'active' | 'executed' | 'rejected' | 'cancelled' | 'draft' | 'approved';
  approvals: number;
  rejections: number;
  threshold: number;
  transactionIndex: string;
  multisigPda: string;
  vaultIndex: number;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      transactionIndex,
      vaultIndex = '0',
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.query as {
      transactionIndex?: string;
      vaultIndex?: string;
      rpc?: string;
      multisigPda?: string;
    };

    if (!transactionIndex) {
      return res.status(400).json({ error: 'Missing transactionIndex query parameter' });
    }
    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);
    const vaultIdx = parseInt(vaultIndex, 10);
    const txIndexBig = BigInt(transactionIndex);

    // Fetch the multisig account to get threshold
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const threshold = multisigAccount.threshold;

    // Derive the proposal PDA
    const [proposalPda] = multisig.getProposalPda({
      multisigPda: msigPk,
      transactionIndex: txIndexBig,
    });

    // Fetch the proposal account
    let proposal;
    try {
      proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
    } catch (e: any) {
      // Proposal might not exist yet (draft state) or already executed
      return res.status(200).json({
        status: 'draft',
        approvals: 0,
        rejections: 0,
        threshold,
        transactionIndex,
        multisigPda,
        vaultIndex: vaultIdx,
        error: 'Proposal not found - may be draft or already cleaned up',
      } as StatusResponse);
    }

    // Count approvals and rejections
    const approvals = proposal.approved?.length ?? 0;
    const rejections = proposal.rejected?.length ?? 0;

    // Determine status from proposal state
    let status: StatusResponse['status'] = 'active';
    const proposalStatus = proposal.status as any;

    // Squads SDK returns status as { __kind: "Active" | "Executed" | ... }
    const statusKind = proposalStatus?.__kind?.toLowerCase() || '';

    if (statusKind === 'executed') {
      status = 'executed';
    } else if (statusKind === 'rejected') {
      status = 'rejected';
    } else if (statusKind === 'cancelled') {
      status = 'cancelled';
    } else if (statusKind === 'approved' || (statusKind === 'active' && approvals >= threshold)) {
      status = 'approved';
    } else if (statusKind === 'active') {
      status = 'active';
    } else if (statusKind === 'draft') {
      status = 'draft';
    }

    // Fallback: check for object-key style (older SDK versions)
    if (!statusKind) {
      if ('executed' in proposalStatus) {
        status = 'executed';
      } else if ('rejected' in proposalStatus) {
        status = 'rejected';
      } else if ('cancelled' in proposalStatus) {
        status = 'cancelled';
      } else if (
        'approved' in proposalStatus ||
        ('active' in proposalStatus && approvals >= threshold)
      ) {
        status = 'approved';
      } else if ('active' in proposalStatus) {
        status = 'active';
      }
    }

    return res.status(200).json({
      status,
      approvals,
      rejections,
      threshold,
      transactionIndex,
      multisigPda,
      vaultIndex: vaultIdx,
    } as StatusResponse);
  } catch (e: any) {
    console.error('[/api/squads/status] error:', e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
