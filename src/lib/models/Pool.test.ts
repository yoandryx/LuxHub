/**
 * @jest-environment node
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Must import Pool AFTER mongoose connects to avoid model caching issues
let Pool: typeof import('./Pool').Pool;
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  // Dynamic import so the model registers against our in-memory connection
  const mod = await import('./Pool');
  Pool = mod.Pool;
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Pool Schema — Phase 11 shape', () => {
  it('creates a Pool document with minimum required fields', async () => {
    const doc = new Pool({
      selectedAssetId: new mongoose.Types.ObjectId(),
      sourceType: 'dealer',
      maxInvestors: 100,
      minBuyInUSD: 10,
      totalShares: 1000,
    });
    const saved = await doc.save();
    expect(saved._id).toBeDefined();
    expect(saved.tokenStatus).toBe('pending');
  });

  describe('new field defaults', () => {
    let doc: InstanceType<typeof mongoose.Model>;

    beforeAll(async () => {
      doc = new Pool({
        selectedAssetId: new mongoose.Types.ObjectId(),
        sourceType: 'dealer',
        maxInvestors: 50,
        minBuyInUSD: 5,
        totalShares: 500,
      });
      await doc.save();
    });

    it('accumulatedFeesLamports defaults to 0', () => {
      expect(doc.get('accumulatedFeesLamports')).toBe(0);
    });

    it('accumulatedFeesLamportsPending defaults to 0', () => {
      expect(doc.get('accumulatedFeesLamportsPending')).toBe(0);
    });

    it('feeClaimTxSignatures defaults to empty array', () => {
      expect(doc.get('feeClaimTxSignatures')).toEqual([]);
    });

    it('feeClaimInFlight defaults to false', () => {
      expect(doc.get('feeClaimInFlight')).toBe(false);
    });

    it('slippageBufferBps defaults to 200', () => {
      expect(doc.get('slippageBufferBps')).toBe(200);
    });

    it('lifecycleMemos defaults to empty array', () => {
      expect(doc.get('lifecycleMemos')).toEqual([]);
    });

    it('tokenStatus defaults to pending', () => {
      expect(doc.get('tokenStatus')).toBe('pending');
    });

    it('fundingTargetUsdc is undefined when not set', () => {
      expect(doc.get('fundingTargetUsdc')).toBeUndefined();
    });

    it('backingEscrowPda is undefined when not set', () => {
      expect(doc.get('backingEscrowPda')).toBeUndefined();
    });

    it('custodyVaultPda is undefined when not set', () => {
      expect(doc.get('custodyVaultPda')).toBeUndefined();
    });

    it('treasuryPoolsVaultPda is undefined when not set', () => {
      expect(doc.get('treasuryPoolsVaultPda')).toBeUndefined();
    });
  });

  describe('tokenStatus enum accepts all 11 new canonical values', () => {
    const canonicalValues = [
      'pending', 'minted', 'funding', 'graduated', 'custody', 'resale_listed',
      'resold', 'distributed', 'aborted', 'resale_unlisted', 'partial_distributed',
    ];

    it.each(canonicalValues)('accepts tokenStatus = "%s"', async (status) => {
      const doc = new Pool({
        selectedAssetId: new mongoose.Types.ObjectId(),
        sourceType: 'dealer',
        maxInvestors: 10,
        minBuyInUSD: 1,
        totalShares: 100,
        tokenStatus: status,
      });
      await doc.validate();
      expect(doc.tokenStatus).toBe(status);
    });
  });

  describe('tokenStatus enum accepts legacy transition values', () => {
    const legacyValues = ['unlocked', 'frozen', 'redeemable', 'burned'];

    it.each(legacyValues)('accepts legacy tokenStatus = "%s"', async (status) => {
      const doc = new Pool({
        selectedAssetId: new mongoose.Types.ObjectId(),
        sourceType: 'dealer',
        maxInvestors: 10,
        minBuyInUSD: 1,
        totalShares: 100,
        tokenStatus: status,
      });
      await doc.validate();
      expect(doc.tokenStatus).toBe(status);
    });
  });

  describe('tokenStatus rejects invalid values', () => {
    it('rejects an invalid tokenStatus', async () => {
      const doc = new Pool({
        selectedAssetId: new mongoose.Types.ObjectId(),
        sourceType: 'dealer',
        maxInvestors: 10,
        minBuyInUSD: 1,
        totalShares: 100,
        tokenStatus: 'invalid_status',
      });
      await expect(doc.validate()).rejects.toThrow();
    });
  });

  describe('removed fields are NOT present in schema paths', () => {
    const removedFields = [
      // Squad DAO orphan fields
      'squadMultisigPda', 'squadVaultPda', 'squadThreshold',
      'squadMembers', 'squadCreatedAt', 'nftTransferredToSquad', 'nftTransferTx',
      // Phase 8 fee-split orphan fields
      'accumulatedHolderFees', 'accumulatedVendorFees', 'accumulatedTradeRewards',
      'holderDividendBps', 'totalDividendsDistributed', 'feeAllocations',
      // AMM orphan fields
      'ammEnabled', 'ammPoolAddress', 'ammLiquidityAmount',
      'ammLiquidityPercent', 'ammCreatedAt', 'liquidityModel',
      'fractionalMint', 'fractionalPda',
      // Wind-down orphan fields
      'windDownStatus', 'windDownSnapshotHolders',
    ];

    it.each(removedFields)('schema does not have path "%s"', (field) => {
      expect(Pool.schema.paths[field]).toBeUndefined();
    });
  });

  describe('new fields ARE present in schema paths', () => {
    const newFields = [
      'fundingTargetUsdc', 'fundingTargetUsdcSource', 'fundingTargetSetAt',
      'slippageBufferBps', 'accumulatedFeesLamports', 'accumulatedFeesLamportsPending',
      'feeClaimTxSignatures', 'feeClaimInFlight', 'lastFeeClaimAt', 'lastFeeClaimError',
      'backingEscrowPda', 'custodyVaultPda', 'treasuryPoolsVaultPda', 'lifecycleMemos',
    ];

    it.each(newFields)('schema has path "%s"', (field) => {
      expect(Pool.schema.paths[field]).toBeDefined();
    });
  });

  describe('compound indexes are registered', () => {
    it('has index on { tokenStatus: 1, lastFeeClaimAt: 1 }', () => {
      const indexes = Pool.schema.indexes();
      const found = indexes.some(
        ([fields]) =>
          fields &&
          typeof fields === 'object' &&
          'tokenStatus' in fields &&
          'lastFeeClaimAt' in fields
      );
      expect(found).toBe(true);
    });

    it('has index on { tokenStatus: 1, createdAt: -1 }', () => {
      const indexes = Pool.schema.indexes();
      const found = indexes.some(
        ([fields]) =>
          fields &&
          typeof fields === 'object' &&
          'tokenStatus' in fields &&
          'createdAt' in fields
      );
      expect(found).toBe(true);
    });
  });

  describe('legacy status field is preserved', () => {
    it('schema has path "status"', () => {
      expect(Pool.schema.paths['status']).toBeDefined();
    });

    it('status defaults to "open"', async () => {
      const doc = new Pool({
        selectedAssetId: new mongoose.Types.ObjectId(),
        sourceType: 'dealer',
        maxInvestors: 10,
        minBuyInUSD: 1,
        totalShares: 100,
      });
      expect(doc.status).toBe('open');
    });
  });

  describe('kept fields are still present', () => {
    const keptFields = [
      'bagsTokenMint', 'meteoraConfigKey', 'feeShareAuthority',
      'bagsTokenMetadataUrl', 'totalTrades', 'totalVolumeUSD',
      'lastTradeAt', 'lastPriceUSD', 'recentTrades', 'feeShareClaimers',
    ];

    it.each(keptFields)('schema has path "%s"', (field) => {
      expect(Pool.schema.paths[field]).toBeDefined();
    });
  });
});
