// src/pages/api/cron/sweep-expired-distributions.ts
// Vercel Cron: daily sweep of expired pool distributions (90-day claim window).
// Funds were never disbursed (pull/claim model), so this is an accounting event:
// we mark unclaimed entries as expired and write a TreasuryDeposit audit record
// documenting the sweep. No on-chain fund transfer occurs.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withErrorMonitoring } from '../../../lib/monitoring/errorHandler';
import dbConnect from '../../../lib/database/mongodb';
import { PoolDistribution } from '../../../lib/models/PoolDistribution';
import { TreasuryDeposit } from '../../../lib/models/TreasuryDeposit';
import { getTreasury } from '../../../lib/config/treasuryConfig';

interface SweepResult {
  distributionId: string;
  action: 'swept' | 'closed_no_unclaimed';
  unclaimedCount?: number;
  unclaimedUsd?: number;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  const isValidCron =
    typeof authHeader === 'string' &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isValidCron && process.env.NODE_ENV === 'production') {
    return res.status(401).json({ error: 'unauthorized' });
  }

  await dbConnect();

  // Find distributions past their claim deadline with unclaimed balances
  const expired = await PoolDistribution.find({
    status: { $in: ['pending', 'distributed'] },
    claimDeadlineAt: { $lt: new Date() },
  });

  const results: SweepResult[] = [];

  for (const dist of expired) {
    const unclaimed = (dist.distributions || []).filter(
      (d: any) => !d.claimedAt
    );
    const unclaimedTotal = unclaimed.reduce(
      (s: number, d: any) => s + (d.payoutUSD || 0),
      0
    );

    if (unclaimedTotal === 0) {
      // All holders already claimed -- just close the distribution
      await PoolDistribution.updateOne(
        { _id: dist._id },
        { $set: { status: 'distributed' } }
      );
      results.push({
        distributionId: dist._id.toString(),
        action: 'closed_no_unclaimed',
      });
      continue;
    }

    // Write TreasuryDeposit audit record.
    // The actual USDC never left the treasury (pull/claim model).
    // This record documents that unclaimed amounts are now permanently treasury-owned.
    let poolsTreasury: string;
    try {
      poolsTreasury = getTreasury('pools');
    } catch {
      poolsTreasury = 'pools_treasury_unknown';
    }

    await TreasuryDeposit.create({
      depositType: 'unclaimed_sweep',
      pool: dist.pool,
      amountLamports: 0, // No on-chain transfer -- accounting only
      amountSOL: 0,
      amountUSD: unclaimedTotal,
      txSignature: `sweep_${dist._id}_${Date.now()}`, // Synthetic signature for uniqueness
      fromWallet: 'unclaimed_distributions',
      toWallet: poolsTreasury,
      description: `Swept ${unclaimed.length} unclaimed holder(s) from distribution ${dist._id} ($${unclaimedTotal.toFixed(2)} USD)`,
    });

    // Mark unclaimed entries as expired
    await PoolDistribution.updateOne(
      { _id: dist._id },
      {
        $set: {
          status: 'expired',
          'distributions.$[elem].expiredAt': new Date(),
        },
      },
      { arrayFilters: [{ 'elem.claimedAt': null }] }
    );

    results.push({
      distributionId: dist._id.toString(),
      action: 'swept',
      unclaimedCount: unclaimed.length,
      unclaimedUsd: unclaimedTotal,
    });
  }

  return res.status(200).json({
    success: true,
    processed: expired.length,
    results,
  });
}

export default withErrorMonitoring(handler);
