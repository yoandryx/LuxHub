// pages/api/vault/derive-pda.ts
// Derive Squads vault PDA from multisig address

import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';

// Squads v4 vault PDA derivation
function getVaultPda(multisigPda: PublicKey, vaultIndex: number): [PublicKey, number] {
  const SQUADS_V4_PROGRAM_ID = new PublicKey('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('multisig'),
      multisigPda.toBuffer(),
      Buffer.from('vault'),
      Buffer.from([vaultIndex]),
    ],
    SQUADS_V4_PROGRAM_ID
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { multisigAddress, vaultIndex = 1 } = req.body;

  if (!multisigAddress) {
    return res.status(400).json({ error: 'Missing multisigAddress' });
  }

  try {
    // Validate the multisig address
    let multisigPk: PublicKey;
    try {
      multisigPk = new PublicKey(multisigAddress);
    } catch {
      return res.status(400).json({ error: 'Invalid multisig address format' });
    }

    // Derive the vault PDA
    const index = typeof vaultIndex === 'number' ? vaultIndex : parseInt(vaultIndex, 10);
    const [vaultPda, bump] = getVaultPda(multisigPk, index);

    return res.status(200).json({
      success: true,
      multisigAddress: multisigPk.toBase58(),
      vaultIndex: index,
      vaultPda: vaultPda.toBase58(),
      bump,
    });
  } catch (error) {
    console.error('[VAULT-DERIVE-PDA] Error:', error);
    return res.status(500).json({ error: 'Failed to derive vault PDA' });
  }
}
