// /src/pages/api/nft/activeEscrowsByMint.ts
// Returns active escrows for admin dashboard — sourced from Escrow collection
// Maps to the shape expected by adminDashboard.tsx EscrowAccount interface
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Escrow } from '../../../lib/models/Escrow';
import { getClusterConfig, getConnection } from '@/lib/solana/clusterConfig';
import { PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import idl from '../../../idl/luxhub_marketplace.json';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();

    // Find all active escrows with real on-chain PDAs
    const escrows = await Escrow.find({
      deleted: { $ne: true },
      status: { $in: ['funded', 'shipped', 'listed', 'initiated'] },
      escrowPda: { $not: /^listing-/ }, // Only real on-chain PDAs
    })
      .populate('asset')
      .sort({ createdAt: -1 })
      .lean();

    const { usdcMint } = getClusterConfig();
    const connection = getConnection();
    const programId = new PublicKey(process.env.PROGRAM_ID!);

    // Read-only provider (no wallet needed for fetching)
    const provider = new AnchorProvider(connection, {} as any, {});
    const program = new Program(idl as any, provider);

    // Map to the shape expected by adminDashboard.tsx
    const mapped = await Promise.all(
      escrows.map(async (escrow: any) => {
        const asset = escrow.asset || {};

        // Read seed from on-chain escrow account if not stored in DB
        let seed = escrow.escrowSeed;
        if (!seed && escrow.escrowPda) {
          try {
            const escrowPda = new PublicKey(escrow.escrowPda);
            const onChainEscrow = await (program.account as any).escrow.fetch(escrowPda);
            seed = Number(onChainEscrow.seed);
          } catch (e) {
            // On-chain fetch failed — escrow may not exist yet
          }
        }

        return {
          seed: seed || 0,
          initializer: escrow.sellerWallet,
          luxhub_wallet: process.env.NEXT_PUBLIC_LUXHUB_WALLET || '',
          initializer_amount: '1',
          taker_amount: (escrow.listingPrice || 0).toString(),
          salePrice: (escrow.listingPrice || 0).toString(),
          file_cid: asset.arweaveTxId || asset.imageIpfsUrls?.[0] || '',
          mintA: usdcMint,
          mintB: escrow.nftMint,
          nftId: escrow.nftMint,
          name: asset.title || asset.model || 'Unknown',
          image: asset.imageUrl || '',
          description: asset.description || '',
          attributes: [],
          // Extra fields
          seller: escrow.sellerWallet,
          buyer: escrow.buyerWallet || null,
          status: escrow.status,
          escrowPda: escrow.escrowPda,
          priceUSD: escrow.listingPriceUSD,
          createdAt: escrow.createdAt,
        };
      })
    );

    res.status(200).json(mapped);
  } catch (err) {
    console.error('[activeEscrowsByMint] Error:', err);
    res.status(500).json({ error: 'Failed to fetch active escrows' });
  }
}
