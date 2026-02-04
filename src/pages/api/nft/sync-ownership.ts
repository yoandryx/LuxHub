// src/pages/api/nft/sync-ownership.ts
// Syncs on-chain NFT ownership to MongoDB database
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import dbConnect from '@/lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com';

interface SyncResult {
  mintAddress: string;
  dbOwner: string | null;
  onChainOwner: string | null;
  synced: boolean;
  changed: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mintAddresses, adminWallet } = req.body as {
    mintAddresses?: string[];
    adminWallet?: string;
  };

  try {
    await dbConnect();
    const connection = new Connection(RPC_URL, 'confirmed');

    // If specific mint addresses provided, sync those. Otherwise sync all.
    let assetsToSync;
    if (mintAddresses && mintAddresses.length > 0) {
      assetsToSync = await Asset.find({
        nftMint: { $in: mintAddresses },
        deleted: false,
      }).lean();
    } else if (adminWallet) {
      // Sync assets where the admin is either the minter or current owner in DB
      assetsToSync = await Asset.find({
        $or: [{ mintedBy: adminWallet }, { nftOwnerWallet: adminWallet }],
        nftMint: { $exists: true, $ne: null },
        deleted: false,
      }).lean();
    } else {
      return res.status(400).json({ error: 'Provide mintAddresses or adminWallet' });
    }

    const results: SyncResult[] = [];
    let updated = 0;
    let unchanged = 0;
    let errors = 0;

    for (const asset of assetsToSync) {
      if (!asset.nftMint) continue;

      try {
        // Fetch on-chain account data for mpl-core asset
        const mintPubkey = new PublicKey(asset.nftMint);
        const accountInfo = await connection.getAccountInfo(mintPubkey);

        if (!accountInfo) {
          results.push({
            mintAddress: asset.nftMint,
            dbOwner: asset.nftOwnerWallet || null,
            onChainOwner: null,
            synced: false,
            changed: false,
          });
          errors++;
          continue;
        }

        // mpl-core asset account structure: owner is at offset 1 (after discriminator)
        // Discriminator (1 byte) + Owner (32 bytes)
        const ownerBytes = accountInfo.data.slice(1, 33);
        const onChainOwner = new PublicKey(ownerBytes).toBase58();

        const dbOwner = asset.nftOwnerWallet || null;
        const changed = dbOwner !== onChainOwner;

        if (changed) {
          // Update the database with on-chain owner
          await Asset.updateOne(
            { nftMint: asset.nftMint },
            {
              nftOwnerWallet: onChainOwner,
              $push: {
                transferHistory: {
                  from: dbOwner,
                  to: onChainOwner,
                  transferredAt: new Date(),
                  transactionSignature: 'sync-ownership',
                },
              },
            }
          );
          updated++;
        } else {
          unchanged++;
        }

        results.push({
          mintAddress: asset.nftMint,
          dbOwner,
          onChainOwner,
          synced: true,
          changed,
        });
      } catch (err: any) {
        console.error(`[sync-ownership] Error syncing ${asset.nftMint}:`, err.message);
        results.push({
          mintAddress: asset.nftMint,
          dbOwner: asset.nftOwnerWallet || null,
          onChainOwner: null,
          synced: false,
          changed: false,
        });
        errors++;
      }
    }

    return res.status(200).json({
      success: true,
      summary: {
        total: assetsToSync.length,
        updated,
        unchanged,
        errors,
      },
      results,
    });
  } catch (error: any) {
    console.error('[/api/nft/sync-ownership] Error:', error);
    return res.status(500).json({
      error: 'Failed to sync ownership',
      details: error?.message,
    });
  }
}
