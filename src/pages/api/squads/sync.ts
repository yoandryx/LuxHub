// src/pages/api/squads/sync.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, Idl, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { BN } from '@coral-xyz/anchor';
import connectToDatabase from '../../../lib/database/mongodb';
import idl from '../../../idl/anchor_escrow.json';

export const config = {
  runtime: 'nodejs',
};

interface SyncResponse {
  ok: boolean;
  escrowSeed: string;
  onChainCompleted: boolean;
  mongoUpdated: boolean;
  error?: string;
}

// Helper to get a read-only program instance (no wallet required for reading)
function getReadOnlyProgram(connection: Connection): Program<Idl> {
  // Create a dummy wallet for read-only operations
  const dummyWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any) => txs,
  } as unknown as Wallet;

  const provider = new AnchorProvider(connection, dummyWallet, {
    commitment: 'confirmed',
  });

  return new Program(idl as Idl, provider);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
      escrowSeed,
      transactionSignature,
      rpc = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT,
    } = req.body as {
      escrowSeed?: string;
      transactionSignature?: string;
      rpc?: string;
    };

    if (!escrowSeed) {
      return res.status(400).json({ error: 'Missing escrowSeed' });
    }
    if (!rpc) {
      return res.status(500).json({ error: 'RPC env is not set' });
    }

    const connection = new Connection(rpc, 'confirmed');
    const program = getReadOnlyProgram(connection);

    // Derive the escrow PDA from seed
    const seed = parseInt(escrowSeed, 10);
    const seedBuffer = new BN(seed).toArrayLike(Buffer, 'le', 8);
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('state'), seedBuffer],
      program.programId
    );

    // Fetch on-chain escrow state
    let onChainEscrow;
    let onChainCompleted = false;
    try {
      onChainEscrow = await (program.account as any).escrow.fetch(escrowPda);
      onChainCompleted = onChainEscrow.isCompleted === true;
    } catch (e: any) {
      // Escrow account might not exist or be closed
      return res.status(400).json({
        error: `Failed to fetch on-chain escrow: ${e.message}`,
        escrowPda: escrowPda.toBase58(),
      });
    }

    // Connect to MongoDB and update the escrow document
    const db = await connectToDatabase();
    let mongoUpdated = false;

    // Try to update in the escrows collection (Mongoose model)
    const escrowsCollection = db.collection('escrows');
    const saleRequestsCollection = db.collection('salerequests');

    // First, try to find and update in escrows collection by escrowPda
    const escrowDoc = await escrowsCollection.findOne({ escrowPda: escrowPda.toBase58() });

    if (escrowDoc) {
      const updateFields: Record<string, any> = {};

      if (onChainCompleted) {
        updateFields.status = 'released';
        updateFields.squadsExecutedAt = new Date();
      }

      if (transactionSignature) {
        updateFields.squadsExecutionSignature = transactionSignature;
      }

      if (Object.keys(updateFields).length > 0) {
        await escrowsCollection.updateOne(
          { escrowPda: escrowPda.toBase58() },
          { $set: updateFields }
        );
        mongoUpdated = true;
      }
    }

    // Also update saleRequests collection by seed
    const saleRequest = await saleRequestsCollection.findOne({ seed: seed });
    if (saleRequest && onChainCompleted) {
      await saleRequestsCollection.updateOne(
        { seed: seed },
        {
          $set: {
            marketStatus: 'Sold',
            squadsExecutedAt: new Date(),
            ...(transactionSignature && { squadsExecutionSignature: transactionSignature }),
          },
        }
      );
      mongoUpdated = true;
    }

    // Optionally trigger NFT metadata update (call the existing updateStatus API)
    if (onChainCompleted && onChainEscrow.mintB) {
      try {
        const mintAddress = onChainEscrow.mintB.toBase58?.() || onChainEscrow.mintB;
        // Internal call to update NFT market status
        await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/nft/updateStatus`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mintAddress,
              marketStatus: 'Sold',
            }),
          }
        );
      } catch (metadataErr) {
        console.warn('[/api/squads/sync] NFT metadata update failed:', metadataErr);
        // Don't fail the sync for metadata update errors
      }
    }

    return res.status(200).json({
      ok: true,
      escrowSeed,
      onChainCompleted,
      mongoUpdated,
      escrowPda: escrowPda.toBase58(),
      onChainState: {
        isCompleted: onChainEscrow.isCompleted,
        seed: onChainEscrow.seed?.toString(),
        salePrice: onChainEscrow.salePrice?.toString(),
        initializer: onChainEscrow.initializer?.toBase58?.(),
        buyer: onChainEscrow.buyer?.toBase58?.(),
      },
    } as SyncResponse & { escrowPda: string; onChainState: Record<string, any> });
  } catch (e: any) {
    console.error('[/api/squads/sync] error:', e);
    return res.status(500).json({ error: e?.message ?? 'Unknown error' });
  }
}
