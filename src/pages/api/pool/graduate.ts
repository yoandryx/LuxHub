// src/pages/api/pool/graduate.ts
// Graduate a pool: create Squad DAO from top token holders, transfer NFT to vault
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
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import AdminRole from '../../../lib/models/AdminRole';
import { getTopTokenHolders } from '../../../lib/services/squadsTransferService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { poolId, wallet, threshold, maxMembers } = req.body;

    if (!poolId) {
      return res.status(400).json({ error: 'Missing poolId' });
    }

    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet address' });
    }

    // Verify admin access via wallet config or database role
    const adminConfig = getAdminConfig();
    const isWalletAdmin = adminConfig.isAdmin(wallet);

    if (!isWalletAdmin) {
      const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });
      const isDbAdmin = !!(dbAdmin?.permissions?.canManagePools || dbAdmin?.role === 'super_admin');
      if (!isDbAdmin) {
        return res.status(403).json({ error: 'Unauthorized: admin access required' });
      }
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    if (pool.graduated) {
      return res.status(400).json({
        error: 'Pool already graduated',
        squadMultisigPda: pool.squadMultisigPda,
      });
    }

    // Graduate the pool — set basic fields
    const graduationMarketCap = pool.sharesSold * pool.sharePriceUSD;
    const graduationPrice = pool.lastPriceUSD || pool.currentBondingPrice || pool.sharePriceUSD;

    // Fetch top token holders for DAO membership
    const memberLimit = maxMembers || 100;
    let squadMembers: { wallet: string; tokenBalance: number; ownershipPercent: number }[] = [];

    if (pool.bagsTokenMint) {
      try {
        const holders = await getTopTokenHolders(pool.bagsTokenMint, memberLimit);
        squadMembers = holders.map((h) => ({
          wallet: h.wallet,
          tokenBalance: h.balance,
          ownershipPercent: h.ownershipPercent,
        }));
      } catch (err) {
        console.warn('[graduate] Failed to fetch token holders:', err);
      }
    }

    // Fallback to MongoDB participants if no on-chain holders found
    if (squadMembers.length === 0 && pool.participants?.length > 0) {
      squadMembers = pool.participants.map((p: any) => ({
        wallet: p.wallet,
        tokenBalance: p.shares || 0,
        ownershipPercent: p.ownershipPercent || 0,
      }));
    }

    // Create Squads multisig for DAO governance
    let squadResult: {
      multisigPda?: string;
      vaultPda?: string;
      signature?: string;
      error?: string;
    } = {};

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
    const keypairPath = process.env.SQUADS_MEMBER_KEYPAIR_PATH;
    const keypairJson = process.env.SQUADS_MEMBER_KEYPAIR_JSON;

    if (rpcUrl && (keypairPath || keypairJson) && squadMembers.length >= 2) {
      try {
        const connection = new Connection(rpcUrl, 'confirmed');
        const secret = keypairPath
          ? JSON.parse(readFileSync(keypairPath, 'utf-8'))
          : JSON.parse(keypairJson!);
        const creator = Keypair.fromSecretKey(Uint8Array.from(secret));

        // Generate a unique create key for this multisig
        const createKey = Keypair.generate();
        const approvalThreshold = threshold || pool.squadThreshold || 60;

        // Build member list — top holders + LuxHub admin as member
        const members = squadMembers.slice(0, 10).map((m) => ({
          key: new PublicKey(m.wallet),
          permissions: multisig.types.Permissions.fromPermissions([multisig.types.Permission.Vote]),
        }));

        // Add creator as proposer if not already in members
        const creatorInMembers = members.some((m) => m.key.equals(creator.publicKey));
        if (!creatorInMembers) {
          members.push({
            key: creator.publicKey,
            permissions: multisig.types.Permissions.fromPermissions([
              multisig.types.Permission.Vote,
              multisig.types.Permission.Initiate,
              multisig.types.Permission.Execute,
            ]),
          });
        }

        // Calculate threshold (percentage of total members)
        const thresholdCount = Math.max(2, Math.ceil(members.length * (approvalThreshold / 100)));

        const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

        const [vaultPdaForTreasury] = multisig.getVaultPda({ multisigPda, index: 0 });

        const createIx = multisig.instructions.multisigCreateV2({
          createKey: createKey.publicKey,
          creator: creator.publicKey,
          multisigPda,
          configAuthority: null,
          threshold: thresholdCount,
          members,
          timeLock: 0,
          treasury: vaultPdaForTreasury,
          rentCollector: null,
        });

        const { blockhash } = await connection.getLatestBlockhash();
        const txMessage = new TransactionMessage({
          payerKey: creator.publicKey,
          recentBlockhash: blockhash,
          instructions: [createIx],
        }).compileToV0Message();

        const tx = new VersionedTransaction(txMessage);
        tx.sign([creator, createKey]);

        const signature = await connection.sendTransaction(tx, { skipPreflight: false });
        await connection.confirmTransaction(signature, 'confirmed');

        squadResult = {
          multisigPda: multisigPda.toBase58(),
          vaultPda: vaultPdaForTreasury.toBase58(),
          signature,
        };
      } catch (err: any) {
        console.error('[graduate] Squads creation failed:', err);
        squadResult = { error: err?.message || 'Squads multisig creation failed' };
      }
    }

    // Update pool
    const updateFields: Record<string, unknown> = {
      graduated: true,
      status: 'graduated',
      graduatedAt: new Date(),
      graduationMarketCap,
      graduationPriceUSD: graduationPrice,
      squadMembers: squadMembers.map((m) => ({
        wallet: m.wallet,
        tokenBalance: m.tokenBalance,
        ownershipPercent: m.ownershipPercent,
        joinedAt: new Date(),
        permissions: 1,
      })),
    };

    if (squadResult.multisigPda) {
      updateFields.squadMultisigPda = squadResult.multisigPda;
      updateFields.squadVaultPda = squadResult.vaultPda;
      updateFields.squadCreatedAt = new Date();
    }

    await Pool.findByIdAndUpdate(poolId, { $set: updateFields });

    return res.status(200).json({
      success: true,
      pool: {
        _id: pool._id,
        graduated: true,
        status: 'graduated',
        graduatedAt: new Date(),
        graduationMarketCap,
        graduationPriceUSD: graduationPrice,
      },
      squad: squadResult.multisigPda
        ? {
            created: true,
            multisigPda: squadResult.multisigPda,
            vaultPda: squadResult.vaultPda,
            signature: squadResult.signature,
            memberCount: squadMembers.length,
            squadsUrl: `https://v4.squads.so/squads/${squadResult.multisigPda}`,
          }
        : {
            created: false,
            reason: squadResult.error || 'Squads config missing or insufficient members',
          },
      members: squadMembers.slice(0, 10).map((m) => ({
        wallet: m.wallet,
        tokenBalance: m.tokenBalance,
        ownershipPercent: `${m.ownershipPercent.toFixed(2)}%`,
      })),
      totalMembers: squadMembers.length,
      nextSteps: squadResult.multisigPda
        ? [
            'Squad DAO created — members can vote on governance proposals',
            'Transfer pool NFT to Squad vault for collective custody',
            'Members propose and vote on resale decisions',
          ]
        : [
            'Pool graduated but Squad DAO not created',
            'Configure SQUADS_MEMBER_KEYPAIR to enable DAO creation',
            'Ensure at least 2 token holders exist',
          ],
    });
  } catch (error: any) {
    console.error('Graduate pool error:', error);
    return res.status(500).json({ error: error.message || 'Failed to graduate pool' });
  }
}
