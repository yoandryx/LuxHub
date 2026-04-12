/**
 * Pool Schema Migration Script — Phase 11
 *
 * Migrates existing Pool documents to the phase 11 fee-funded model:
 * - Maps legacy `status` values to new `tokenStatus` enum
 * - Sets default values for new fields
 * - Unsets orphan fields (Squad DAO, AMM, fee-split, wind-down)
 *
 * Run with: npx tsx scripts/migrate-pool-schema-v11.ts
 * Idempotent: safe to re-run.
 *
 * NOTE: This script is CREATED in plan 11-01 but EXECUTED in Wave E (plan 11-18).
 */
import mongoose from 'mongoose';
import { Pool } from '../src/lib/models/Pool';

const LEGACY_TO_NEW_STATUS: Record<string, string> = {
  open: 'pending',
  filled: 'pending',
  funded: 'pending',
  custody: 'custody',
  active: 'funding',
  graduated: 'graduated',
  winding_down: 'aborted',
  listed: 'resale_listed',
  sold: 'resold',
  distributing: 'partial_distributed',
  distributed: 'distributed',
  closed: 'distributed',
  failed: 'aborted',
  dead: 'aborted',
  burned: 'aborted',
  canceled: 'aborted',
};

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI environment variable is required');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const pools = await Pool.find({ deleted: { $ne: true } }).lean();
  console.log(`Found ${pools.length} pool(s) to migrate`);

  let migrated = 0;
  for (const p of pools) {
    const pool = p as Record<string, unknown>;
    const newTokenStatus = pool.bagsTokenMint
      ? LEGACY_TO_NEW_STATUS[pool.status as string] || 'pending'
      : 'pending';

    await Pool.updateOne(
      { _id: pool._id },
      {
        $set: {
          tokenStatus: newTokenStatus,
          accumulatedFeesLamports: (pool.accumulatedFeesLamports as number) || 0,
          accumulatedFeesLamportsPending: 0,
          slippageBufferBps: 200,
          feeClaimTxSignatures: [],
          feeClaimInFlight: false,
          lifecycleMemos: [],
        },
        $unset: {
          // Squad DAO orphan fields
          squadMultisigPda: '',
          squadVaultPda: '',
          squadThreshold: '',
          squadMembers: '',
          squadCreatedAt: '',
          nftTransferredToSquad: '',
          nftTransferTx: '',
          // Phase 8 fee-split orphan fields
          accumulatedHolderFees: '',
          accumulatedVendorFees: '',
          accumulatedTradeRewards: '',
          holderDividendBps: '',
          totalDividendsDistributed: '',
          feeAllocations: '',
          // AMM orphan fields
          ammEnabled: '',
          ammPoolAddress: '',
          ammLiquidityAmount: '',
          ammLiquidityPercent: '',
          ammCreatedAt: '',
          liquidityModel: '',
          fractionalMint: '',
          fractionalPda: '',
          // Wind-down orphan fields
          windDownStatus: '',
          windDownSnapshotHolders: '',
        },
      }
    );
    migrated++;
    console.log(
      `  [${migrated}/${pools.length}] Pool ${pool.poolNumber || pool._id}: ` +
        `status="${pool.status}" -> tokenStatus="${newTokenStatus}"`
    );
  }

  console.log(`\nMigrated ${migrated} pool(s) to phase 11 schema`);
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
