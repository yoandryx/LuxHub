// src/pages/api/pool/wind-down-choice.ts
// Holder makes a choice during pool wind-down
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { poolId, wallet, choice, rolloverPoolId } = req.body;

  if (!poolId || !wallet || !choice) {
    return res.status(400).json({ error: 'Missing poolId, wallet, or choice' });
  }

  if (!['cash_out', 'rollover'].includes(choice)) {
    return res.status(400).json({ error: 'Choice must be cash_out or rollover' });
  }

  try {
    await dbConnect();

    const pool = await Pool.findById(poolId);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    if (pool.windDownStatus !== 'snapshot_taken') {
      return res.status(400).json({ error: 'Pool is not in snapshot_taken state' });
    }

    // Check claim deadline
    if (pool.windDownClaimDeadline && new Date() > pool.windDownClaimDeadline) {
      return res.status(400).json({ error: 'Claim deadline has passed' });
    }

    // Find holder in snapshot
    const holderIndex = pool.windDownSnapshotHolders?.findIndex((h: any) => h.wallet === wallet);

    if (holderIndex === undefined || holderIndex === -1) {
      return res.status(404).json({ error: 'Wallet not found in snapshot' });
    }

    const holder = pool.windDownSnapshotHolders[holderIndex];
    if (holder.choice !== 'pending') {
      return res.status(400).json({ error: `Choice already made: ${holder.choice}` });
    }

    // Validate rollover target
    if (choice === 'rollover') {
      if (!rolloverPoolId) {
        return res.status(400).json({ error: 'rolloverPoolId required for rollover choice' });
      }
      const targetPool = await Pool.findById(rolloverPoolId);
      if (!targetPool || targetPool.status !== 'open') {
        return res
          .status(400)
          .json({ error: 'Target pool not found or not accepting investments' });
      }
    }

    // Update holder choice
    pool.windDownSnapshotHolders[holderIndex].choice = choice;
    pool.windDownSnapshotHolders[holderIndex].choiceMadeAt = new Date();
    if (choice === 'rollover' && rolloverPoolId) {
      pool.windDownSnapshotHolders[holderIndex].rolloverPoolId = rolloverPoolId;
    }

    // Check if all holders have chosen
    const allChosen = pool.windDownSnapshotHolders.every((h: any) => h.choice !== 'pending');
    if (allChosen) {
      pool.windDownStatus = 'distributing';
    }

    await pool.save();

    return res.status(200).json({
      success: true,
      choice,
      allHoldersChosen: allChosen,
      windDownStatus: pool.windDownStatus,
    });
  } catch (error: any) {
    console.error('[pool/wind-down-choice] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
