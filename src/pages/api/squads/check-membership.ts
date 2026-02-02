// /pages/api/squads/check-membership.ts
// Check if a wallet is a member of the LuxHub Squads multisig
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.query;

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'wallet query parameter required' });
  }

  // Validate wallet address
  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  // Get multisig address from env
  const multisigAddress = process.env.NEXT_PUBLIC_SQUADS_MSIG;
  if (!multisigAddress) {
    return res.status(200).json({
      isMember: false,
      reason: 'Squads multisig not configured',
      squadsConfigured: false,
    });
  }

  try {
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
    );

    const msigPk = new PublicKey(multisigAddress);
    const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, msigPk);

    // Check if wallet is in members list
    const members = multisigAccount.members;
    const memberInfo = members.find((m) => m.key.toBase58() === wallet);

    if (!memberInfo) {
      return res.status(200).json({
        isMember: false,
        reason: 'Wallet is not a member of LuxHub multisig',
        squadsConfigured: true,
        multisigAddress,
        totalMembers: members.length,
        threshold: multisigAccount.threshold,
      });
    }

    // Parse permissions from the permission mask
    const permissions = memberInfo.permissions;
    const permissionMask =
      typeof permissions === 'object' && 'mask' in permissions
        ? (permissions as { mask: number }).mask
        : typeof permissions === 'number'
          ? permissions
          : 0;

    // Permission bits (from Squads SDK):
    // Initiate = 1, Vote = 2, Execute = 4
    const canInitiate = (permissionMask & 1) !== 0;
    const canVote = (permissionMask & 2) !== 0;
    const canExecute = (permissionMask & 4) !== 0;

    return res.status(200).json({
      isMember: true,
      squadsConfigured: true,
      multisigAddress,
      wallet,
      permissions: {
        mask: permissionMask,
        canInitiate,
        canVote,
        canExecute,
      },
      threshold: multisigAccount.threshold,
      totalMembers: members.length,
      // For minting, member needs at least initiate permission
      canMint: canInitiate || canExecute,
    });
  } catch (error) {
    console.error('Error checking Squads membership:', error);

    // If multisig doesn't exist or can't be fetched, return not configured
    return res.status(200).json({
      isMember: false,
      reason: 'Could not fetch multisig account',
      squadsConfigured: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
