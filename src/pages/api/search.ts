// src/pages/api/search.ts
// Global search across assets, vendors, pools, and escrow listings
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../lib/database/mongodb';
import { Asset } from '../../lib/models/Assets';
import { Pool } from '../../lib/models/Pool';
import VendorProfileModel from '../../lib/models/VendorProfile';
import { Escrow } from '../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = ((req.query.q as string) || '').trim();
  if (!q || q.length < 2) {
    return res.status(200).json({ success: true, results: [], total: 0 });
  }

  try {
    await dbConnect();

    const regex = new RegExp(q, 'i');
    const limit = 5; // Max per category

    // Search in parallel across all collections
    const [assets, vendors, pools, escrows] = await Promise.all([
      // Assets: search by model, brand, serial, nftMint
      Asset.find({
        deleted: { $ne: true },
        nftMint: { $exists: true, $ne: null },
        $or: [
          { model: regex },
          { brand: regex },
          { serial: regex },
          { nftMint: q }, // Exact match for mint address
        ],
      })
        .select('model brand nftMint imageUrl imageIpfsUrls images priceUSD status nftOwnerWallet')
        .limit(limit)
        .lean(),

      // Vendors: search by name, username
      VendorProfileModel.find({
        approved: true,
        $or: [{ name: regex }, { username: regex }],
      })
        .select('name username avatarUrl wallet verified')
        .limit(limit)
        .lean(),

      // Pools: search by asset model/brand via populate
      Pool.find({
        deleted: { $ne: true },
        status: { $nin: ['dead', 'burned'] },
      })
        .populate({
          path: 'selectedAssetId',
          match: { $or: [{ model: regex }, { brand: regex }] },
          select: 'model brand imageIpfsUrls images',
        })
        .select('selectedAssetId status sharePriceUSD totalShares sharesSold bagsTokenMint')
        .limit(20) // Fetch more since we filter after populate
        .lean()
        .then((pools) => (pools as any[]).filter((p) => p.selectedAssetId).slice(0, limit)),

      // Escrow listings: search by nftMint or asset via populate
      Escrow.find({
        deleted: false,
        status: { $in: ['listed', 'initiated'] },
        $or: [{ nftMint: q }, { escrowPda: q }],
      })
        .select('escrowPda nftMint listingPriceUSD status sellerWallet')
        .limit(limit)
        .lean(),
    ]);

    // Transform results into unified format
    const results: {
      type: 'asset' | 'vendor' | 'pool' | 'listing';
      id: string;
      title: string;
      subtitle: string;
      image: string | null;
      href: string;
    }[] = [];

    // Assets
    (assets as any[]).forEach((a) => {
      results.push({
        type: 'asset',
        id: a.nftMint || a._id.toString(),
        title: `${a.brand || ''} ${a.model || 'Asset'}`.trim(),
        subtitle: a.priceUSD ? `$${a.priceUSD.toLocaleString()}` : a.status || '',
        image: a.imageUrl || a.imageIpfsUrls?.[0] || a.images?.[0] || null,
        href: `/marketplace`,
      });
    });

    // Vendors
    (vendors as any[]).forEach((v) => {
      results.push({
        type: 'vendor',
        id: v.wallet,
        title: v.name,
        subtitle: `@${v.username}${v.verified ? ' ✓' : ''}`,
        image: v.avatarUrl || null,
        href: `/vendor/${v.wallet}`,
      });
    });

    // Pools
    (pools as any[]).forEach((p) => {
      const asset = p.selectedAssetId as any;
      results.push({
        type: 'pool',
        id: p._id.toString(),
        title: `${asset?.brand || ''} ${asset?.model || 'Pool'}`.trim(),
        subtitle: `${p.sharesSold}/${p.totalShares} shares · ${p.status}`,
        image: asset?.imageIpfsUrls?.[0] || asset?.images?.[0] || null,
        href: `/pools`,
      });
    });

    // Escrow listings
    (escrows as any[]).forEach((e) => {
      results.push({
        type: 'listing',
        id: e.escrowPda,
        title: `Listing ${e.escrowPda.slice(0, 8)}...`,
        subtitle: e.listingPriceUSD ? `$${e.listingPriceUSD.toLocaleString()}` : e.status,
        image: null,
        href: `/escrow/${e.escrowPda}`,
      });
    });

    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=10');
    return res.status(200).json({
      success: true,
      query: q,
      results,
      total: results.length,
    });
  } catch (error: any) {
    console.error('[/api/search] Error:', error);
    return res.status(500).json({
      error: 'Search failed',
      details: error?.message || 'Unknown error',
    });
  }
}
