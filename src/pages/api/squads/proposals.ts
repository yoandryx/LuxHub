// src/pages/api/squads/proposals.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

export const config = {
  runtime: 'nodejs',
};

interface ProposalInfo {
  transactionIndex: string;
  status: 'active' | 'executed' | 'rejected' | 'cancelled' | 'approved' | 'draft';
  approvals: number;
  rejections: number;
  threshold: number;
  proposalPda: string;
  vaultTransactionPda: string;
  createdAt?: number;
}

interface ProposalsResponse {
  proposals: ProposalInfo[];
  multisigPda: string;
  transactionIndex: string; // Current transaction index of the multisig
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      status: filterStatus,
      limit = '20',
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
    } = req.query as {
      status?: string;
      limit?: string;
      rpc?: string;
      multisigPda?: string;
    };

    if (!rpc || !multisigPda) {
      return res.status(500).json({ error: 'RPC or MULTISIG env is not set' });
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);
    const maxProposals = parseInt(limit, 10);

    // Fetch the multisig account to get current transaction index and threshold
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    const threshold = multisigAccount.threshold;
    // Convert to bigint to ensure consistent handling
    const currentTxIndex = BigInt(multisigAccount.transactionIndex.toString());

    const proposals: ProposalInfo[] = [];

    // Iterate backwards from current transaction index to find proposals
    // Start from the latest and go back
    for (let i = currentTxIndex; i >= BigInt(1) && proposals.length < maxProposals; i--) {
      try {
        const txIndex = i;
        const [proposalPda] = multisig.getProposalPda({
          multisigPda: msigPk,
          transactionIndex: txIndex,
        });

        const [vaultTxPda] = multisig.getTransactionPda({
          multisigPda: msigPk,
          index: txIndex,
        });

        let proposal;
        try {
          proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
        } catch {
          // Proposal doesn't exist for this index, skip
          continue;
        }

        const approvals = proposal.approved?.length ?? 0;
        const rejections = proposal.rejected?.length ?? 0;
        const proposalStatus = proposal.status as any;

        // Squads SDK returns status as { __kind: "Active" | "Executed" | ... }
        const statusKind = proposalStatus?.__kind?.toLowerCase() || '';

        // Determine status
        let status: ProposalInfo['status'] = 'active';
        if (statusKind === 'executed') {
          status = 'executed';
        } else if (statusKind === 'rejected') {
          status = 'rejected';
        } else if (statusKind === 'cancelled') {
          status = 'cancelled';
        } else if (
          statusKind === 'approved' ||
          (statusKind === 'active' && approvals >= threshold)
        ) {
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

        // Filter by status if specified
        if (filterStatus && filterStatus !== 'all') {
          if (filterStatus === 'pending') {
            // Pending means active or approved but not executed
            if (status !== 'active' && status !== 'approved') continue;
          } else if (status !== filterStatus) {
            continue;
          }
        }

        proposals.push({
          transactionIndex: i.toString(),
          status,
          approvals,
          rejections,
          threshold,
          proposalPda: proposalPda.toBase58(),
          vaultTransactionPda: vaultTxPda.toBase58(),
        });
      } catch (e) {
        // Skip any errors for individual proposals
        console.warn(`[/api/squads/proposals] Error fetching proposal ${i}:`, e);
      }
    }

    return res.status(200).json({
      proposals,
      multisigPda,
      transactionIndex: currentTxIndex.toString(),
    } as ProposalsResponse);
  } catch (e: any) {
    console.error('[/api/squads/proposals] error:', e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
