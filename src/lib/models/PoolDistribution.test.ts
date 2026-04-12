/**
 * PoolDistribution Model — Schema & Pre-save Hook Tests
 *
 * Tests Phase 11 schema extensions: distributionKind, claimDeadlineAt auto-computation,
 * new status values, and per-holder claim lifecycle fields.
 *
 * Validates schema shape and pre-save hook logic without a live DB connection.
 * Mongoose document instantiation + validateSync work without a connection.
 */
import mongoose from 'mongoose';

// Force-clear the model cache to avoid "Cannot overwrite model" errors
delete mongoose.models.PoolDistribution;
delete (mongoose.connection as any).models?.PoolDistribution;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PoolDistribution } = require('./PoolDistribution');

function buildDoc(overrides: Record<string, unknown> = {}) {
  return new PoolDistribution({
    pool: new mongoose.Types.ObjectId(),
    salePriceUSD: 10000,
    luxhubRoyaltyUSD: 300,
    ...overrides,
  });
}

describe('PoolDistribution schema extensions (Phase 11)', () => {
  // Task 2.1 — distributionKind default
  it('defaults distributionKind to "resale"', () => {
    const doc = buildDoc();
    expect(doc.distributionKind).toBe('resale');
  });

  it('accepts "abort_refund" as distributionKind', () => {
    const doc = buildDoc({ distributionKind: 'abort_refund' });
    expect(doc.distributionKind).toBe('abort_refund');
  });

  it('rejects invalid distributionKind', () => {
    const doc = buildDoc({ distributionKind: 'invalid_kind' });
    const err = doc.validateSync();
    expect(err).toBeDefined();
    expect(err!.errors['distributionKind']).toBeDefined();
  });

  // Task 2.1 — new status values
  it('accepts "expired" status', () => {
    const doc = buildDoc({ status: 'expired' });
    expect(doc.status).toBe('expired');
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('accepts "snapshot_failed" status', () => {
    const doc = buildDoc({ status: 'snapshot_failed' });
    expect(doc.status).toBe('snapshot_failed');
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('still accepts legacy statuses: pending, distributed, failed', () => {
    for (const s of ['pending', 'distributed', 'failed']) {
      const doc = buildDoc({ status: s });
      const err = doc.validateSync();
      expect(err).toBeUndefined();
    }
  });

  // Task 2.1 — top-level fields exist
  it('accepts sourceEscrowPda and sourceTxSignature', () => {
    const doc = buildDoc({
      sourceEscrowPda: 'EscrowPDA123abc',
      sourceTxSignature: 'TxSig456def',
    });
    expect(doc.sourceEscrowPda).toBe('EscrowPDA123abc');
    expect(doc.sourceTxSignature).toBe('TxSig456def');
  });

  // Task 2.2 — per-holder sub-schema fields
  it('accepts burnTxSignature and notification timestamps in distributions[]', () => {
    const now = new Date();
    const doc = buildDoc({
      distributions: [
        {
          user: new mongoose.Types.ObjectId(),
          shares: 100,
          payoutUSD: 970,
          payoutWallet: 'WalletABC',
          burnTxSignature: 'BurnTx123',
          paidTxSignature: 'PaidTx456',
          claimedAt: now,
          claimTxSignature: 'ClaimTx789',
          notifiedAt60days: now,
          notifiedAt30days: now,
          notifiedAt7days: now,
          notifiedAt1day: now,
          squadsProposalIndex: 42,
        },
      ],
    });

    const holder = doc.distributions[0];
    expect(holder.burnTxSignature).toBe('BurnTx123');
    expect(holder.paidTxSignature).toBe('PaidTx456');
    expect(holder.claimedAt).toEqual(now);
    expect(holder.claimTxSignature).toBe('ClaimTx789');
    expect(holder.notifiedAt60days).toEqual(now);
    expect(holder.notifiedAt30days).toEqual(now);
    expect(holder.notifiedAt7days).toEqual(now);
    expect(holder.notifiedAt1day).toEqual(now);
    expect(holder.squadsProposalIndex).toBe(42);
  });

  // Task 2.4 — pre-save hook: claimDeadlineAt auto-computation
  it('computes claimDeadlineAt as snapshotTakenAt + 90 days on save', async () => {
    const snapshotDate = new Date('2026-01-15T00:00:00Z');
    const doc = buildDoc({ snapshotTakenAt: snapshotDate });

    // Trigger pre-save hooks without DB connection
    await new Promise<void>((resolve, reject) => {
      const schema = PoolDistribution.schema;
      (schema as any).s.hooks.execPre('save', doc, (error: Error | null) => {
        if (error) return reject(error);
        resolve();
      });
    });

    expect(doc.claimDeadlineAt).toBeDefined();

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const expectedDeadline = new Date(snapshotDate.getTime() + NINETY_DAYS_MS);
    expect(doc.claimDeadlineAt!.getTime()).toBe(expectedDeadline.getTime());
  });

  it('does NOT overwrite claimDeadlineAt if already set', async () => {
    const snapshotDate = new Date('2026-01-15T00:00:00Z');
    const customDeadline = new Date('2026-06-01T00:00:00Z');
    const doc = buildDoc({
      snapshotTakenAt: snapshotDate,
      claimDeadlineAt: customDeadline,
    });

    await new Promise<void>((resolve, reject) => {
      const schema = PoolDistribution.schema;
      (schema as any).s.hooks.execPre('save', doc, (error: Error | null) => {
        if (error) return reject(error);
        resolve();
      });
    });

    expect(doc.claimDeadlineAt!.getTime()).toBe(customDeadline.getTime());
  });

  it('does NOT set claimDeadlineAt if snapshotTakenAt is not set', async () => {
    const doc = buildDoc();

    await new Promise<void>((resolve, reject) => {
      const schema = PoolDistribution.schema;
      (schema as any).s.hooks.execPre('save', doc, (error: Error | null) => {
        if (error) return reject(error);
        resolve();
      });
    });

    expect(doc.claimDeadlineAt).toBeUndefined();
  });
});
