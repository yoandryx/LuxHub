// src/pages/api/squads/members.ts
// Endpoint to fetch multisig information: members, threshold, vaults
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

export const config = {
  runtime: 'nodejs',
};

interface MemberInfo {
  pubkey: string;
  permissions: {
    mask: number;
    initiate: boolean;
    vote: boolean;
    execute: boolean;
  };
}

interface VaultInfo {
  index: number;
  pda: string;
  balance?: number;
}

interface MultisigInfoResponse {
  ok: boolean;
  multisigPda?: string;
  createKey?: string;
  threshold?: number;
  transactionIndex?: number;
  staleTransactionIndex?: number;
  members?: MemberInfo[];
  vaults?: VaultInfo[];
  squadsUrl?: string;
  error?: string;
  notConfigured?: boolean;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MultisigInfoResponse>
) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const {
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
      multisigPda = process.env.NEXT_PUBLIC_SQUADS_MSIG,
      includeVaults = 'true',
      vaultCount = '3',
    } = req.query as {
      rpc?: string;
      multisigPda?: string;
      includeVaults?: string;
      vaultCount?: string;
    };

    if (!rpc || !multisigPda) {
      return res.status(200).json({
        ok: false,
        error: 'RPC or MULTISIG env is not set',
        notConfigured: true,
      });
    }

    const connection = new Connection(rpc, 'confirmed');
    const msigPk = new PublicKey(multisigPda);

    // Fetch multisig account
    let multisigAccount;
    try {
      multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);
    } catch {
      // Return 200 with error flag so frontend can handle gracefully
      console.warn('[/api/squads/members] Multisig not found:', multisigPda);
      return res.status(200).json({
        ok: false,
        multisigPda,
        error: 'Multisig not found on-chain. Create one at https://devnet.squads.so',
        notConfigured: true,
        members: [],
        vaults: [],
        threshold: 0,
      });
    }

    // Parse members with permissions
    const members: MemberInfo[] = multisigAccount.members.map((m: any) => {
      const permMask = m.permissions?.mask ?? 0;
      return {
        pubkey: m.key.toBase58(),
        permissions: {
          mask: permMask,
          initiate: (permMask & 1) !== 0, // Initiate permission bit
          vote: (permMask & 2) !== 0, // Vote permission bit
          execute: (permMask & 4) !== 0, // Execute permission bit
        },
      };
    });

    // Optionally fetch vault PDAs and balances
    const vaults: VaultInfo[] = [];
    if (includeVaults === 'true') {
      const numVaults = Math.min(parseInt(vaultCount, 10) || 3, 10);
      for (let i = 0; i < numVaults; i++) {
        const [vaultPda] = multisig.getVaultPda({
          multisigPda: msigPk,
          index: i,
        });
        let balance: number | undefined;
        try {
          balance = await connection.getBalance(vaultPda);
        } catch {
          // Vault may not exist
        }
        vaults.push({
          index: i,
          pda: vaultPda.toBase58(),
          balance,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      multisigPda: msigPk.toBase58(),
      createKey: multisigAccount.createKey?.toBase58(),
      threshold: multisigAccount.threshold,
      transactionIndex: Number(multisigAccount.transactionIndex),
      staleTransactionIndex: Number(multisigAccount.staleTransactionIndex),
      members,
      vaults,
      squadsUrl: `https://v4.squads.so/squads/${msigPk.toBase58()}`,
    });
  } catch (e: any) {
    console.error('[/api/squads/members] error:', e);
    return res.status(200).json({
      ok: false,
      error: e?.message ?? 'Unknown error',
      notConfigured: true,
      members: [],
      vaults: [],
    });
  }
}
