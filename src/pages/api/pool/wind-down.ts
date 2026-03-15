// src/pages/api/pool/wind-down.ts
// Admin-only: announce wind-down and take snapshot
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import AdminRole from '../../../lib/models/AdminRole';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { notifyUser } from '../../../lib/services/notificationService';

const WIND_DOWN_PERIOD_DAYS = 7;
const CLAIM_DEADLINE_DAYS = 14;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poolId, adminWallet, action } = req.body;

  if (!poolId || !adminWallet || !action) {
    return res.status(400).json({ error: 'Missing poolId, adminWallet, or action' });
  }

  try {
    await dbConnect();

    // Admin auth
    const adminConfig = getAdminConfig();
    const isEnvAdmin = adminConfig.isAdmin(adminWallet);
    const dbAdmin = await AdminRole.findOne({ wallet: adminWallet, isActive: true });
    const isAuthorized =
      isEnvAdmin || dbAdmin?.permissions?.canManagePools || dbAdmin?.role === 'super_admin';
    if (!isAuthorized) {
      return res
        .status(403)
        .json({ error: 'Admin authorization required', code: 'ADMIN_REQUIRED' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    if (action === 'announce') {
      // Validate pool can be wound down
      const windDownableStatuses = ['active', 'graduated', 'listed', 'sold'];
      if (!windDownableStatuses.includes(pool.status)) {
        return res.status(400).json({
          error: `Cannot wind down pool with status: ${pool.status}`,
        });
      }

      if (pool.windDownStatus !== 'none') {
        return res.status(400).json({ error: `Wind-down already ${pool.windDownStatus}` });
      }

      const now = new Date();
      const deadline = new Date(now.getTime() + WIND_DOWN_PERIOD_DAYS * 24 * 60 * 60 * 1000);

      pool.status = 'winding_down';
      pool.windDownStatus = 'announced';
      pool.windDownAnnouncedAt = now;
      pool.windDownDeadline = deadline;
      await pool.save();

      // Notify all participants
      if (pool.participants?.length) {
        const notifyPromises = pool.participants.map((p: any) =>
          notifyUser({
            userWallet: p.wallet,
            type: 'pool_wind_down_announced',
            title: 'Pool Wind-Down Announced',
            message: `The pool you invested in is winding down. You have until ${deadline.toLocaleDateString()} to continue trading. After that, a snapshot will be taken and you can choose to cash out or rollover.`,
            metadata: {
              poolId: pool._id.toString(),
              actionUrl: `/pools`,
            },
          }).catch((e: any) => console.error('Notification error:', e))
        );
        await Promise.allSettled(notifyPromises);
      }

      return res.status(200).json({
        success: true,
        message: 'Wind-down announced',
        deadline: deadline.toISOString(),
        windDownStatus: 'announced',
      });
    } else if (action === 'snapshot') {
      if (pool.windDownStatus !== 'announced') {
        return res.status(400).json({ error: 'Pool must be in announced state to take snapshot' });
      }

      // Check if deadline has passed
      if (pool.windDownDeadline && new Date() < pool.windDownDeadline) {
        return res.status(400).json({
          error: 'Wind-down deadline has not passed yet',
          deadline: pool.windDownDeadline.toISOString(),
        });
      }

      // Try to get on-chain holders if token mint exists
      let snapshotHolders: any[] = [];

      if (pool.bagsTokenMint) {
        try {
          // Use Helius DAS API for token holders
          const rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
          if (rpc) {
            const response = await fetch(rpc, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'getTokenAccounts',
                method: 'getTokenAccounts',
                params: { mint: pool.bagsTokenMint, limit: 1000 },
              }),
            });
            const data = await response.json();
            const accounts = data?.result?.token_accounts || [];

            const totalSupply = accounts.reduce(
              (sum: number, a: any) => sum + (Number(a.amount) || 0),
              0
            );

            snapshotHolders = accounts
              .filter((a: any) => Number(a.amount) > 0)
              .map((a: any) => ({
                wallet: a.owner,
                balance: Number(a.amount),
                ownershipPercent: totalSupply > 0 ? (Number(a.amount) / totalSupply) * 100 : 0,
                choice: 'pending',
              }));
          }
        } catch (e) {
          console.error('[wind-down] DAS snapshot error:', e);
        }
      }

      // Fallback to participant data if no on-chain data
      if (snapshotHolders.length === 0 && pool.participants?.length) {
        snapshotHolders = pool.participants.map((p: any) => ({
          wallet: p.wallet,
          balance: p.shares || 0,
          ownershipPercent: p.ownershipPercent || 0,
          choice: 'pending',
        }));
      }

      const claimDeadline = new Date(Date.now() + CLAIM_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

      pool.windDownStatus = 'snapshot_taken';
      pool.windDownSnapshotAt = new Date();
      pool.windDownSnapshotHolders = snapshotHolders;
      pool.windDownClaimDeadline = claimDeadline;
      pool.accumulatedTradingFees = pool.totalDividendsDistributed || 0;
      pool.tokenStatus = 'redeemable';
      await pool.save();

      // Notify holders
      const notifyPromises = snapshotHolders.map((h: any) =>
        notifyUser({
          userWallet: h.wallet,
          type: 'pool_snapshot_taken',
          title: 'Pool Snapshot Taken - Choose Your Option',
          message: `A snapshot has been taken of your pool holdings. You own ${h.ownershipPercent.toFixed(2)}% of the pool. Choose to cash out or rollover to another pool by ${claimDeadline.toLocaleDateString()}.`,
          metadata: {
            poolId: pool._id.toString(),
            actionUrl: `/pools`,
          },
        }).catch((e: any) => console.error('Notification error:', e))
      );
      await Promise.allSettled(notifyPromises);

      return res.status(200).json({
        success: true,
        message: 'Snapshot taken',
        holdersCount: snapshotHolders.length,
        claimDeadline: claimDeadline.toISOString(),
        windDownStatus: 'snapshot_taken',
      });
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "announce" or "snapshot"' });
    }
  } catch (error: any) {
    console.error('[pool/wind-down] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error?.message });
  }
}
