// pages/api/vault/assets.ts
// Public endpoint to fetch NFTs held in the LuxHub vault
// Combines data from VaultInventory and Assets collections

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultInventory, VaultConfig } from '@/lib/models/LuxHubVault';
import { Asset } from '@/lib/models/Assets';
import { Vendor } from '@/lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  const {
    status,
    tags,
    page = '1',
    limit = '20',
    sortBy = 'mintedAt',
    sortOrder = 'desc',
    source = 'both', // 'inventory', 'assets', or 'both'
  } = req.query;

  try {
    // Get vault config and LuxHub vendor
    const vaultConfig = (await VaultConfig.findOne({ isActive: true }).lean()) as {
      vaultPda: string;
      multisigAddress: string;
    } | null;
    const luxhubVendor = (await Vendor.findOne({ isOfficial: true }).lean()) as {
      _id: unknown;
      walletAddress?: string;
    } | null;

    if (!vaultConfig) {
      return res.status(404).json({
        error: 'Vault not configured',
        hint: 'Run: node scripts/seedLuxHubVault.mjs',
      });
    }

    const vaultPda = vaultConfig.vaultPda;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const skip = (pageNum - 1) * limitNum;
    const sortField = typeof sortBy === 'string' ? sortBy : 'mintedAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;

    let items: any[] = [];
    let total = 0;

    // Fetch from VaultInventory (primary source)
    if (source === 'inventory' || source === 'both') {
      const inventoryQuery: Record<string, unknown> = {};

      if (status && typeof status === 'string' && status !== 'all') {
        inventoryQuery.status = status;
      }

      if (tags && typeof tags === 'string') {
        inventoryQuery.tags = { $in: tags.split(',') };
      }

      const [inventoryItems, inventoryTotal] = await Promise.all([
        VaultInventory.find(inventoryQuery)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        VaultInventory.countDocuments(inventoryQuery),
      ]);

      items = inventoryItems;
      total = inventoryTotal;
    }

    // If also fetching from Assets collection (or as fallback)
    if (source === 'assets' || (source === 'both' && items.length === 0)) {
      const assetsQuery: Record<string, unknown> = {
        nftOwnerWallet: vaultPda,
        deleted: { $ne: true },
      };

      if (status && typeof status === 'string' && status !== 'all') {
        // Map vault status to asset status if needed
        const statusMap: Record<string, string> = {
          minted: 'pending',
          listed: 'listed',
          pooled: 'pooled',
          transferred: 'sold',
        };
        assetsQuery.status = statusMap[status] || status;
      }

      const assetSortField = sortField === 'mintedAt' ? 'createdAt' : sortField;

      const [assetItems, assetTotal] = await Promise.all([
        Asset.find(assetsQuery)
          .sort({ [assetSortField]: sortDir })
          .skip(source === 'assets' ? skip : 0)
          .limit(source === 'assets' ? limitNum : limitNum - items.length)
          .lean(),
        Asset.countDocuments(assetsQuery),
      ]);

      // Transform assets to match VaultInventory format
      const transformedAssets = assetItems.map((asset: any) => ({
        _id: asset._id,
        nftMint: asset.nftMint,
        name: `${asset.metaplexMetadata?.attributes?.brand || ''} ${asset.model}`.trim(),
        description: asset.description,
        imageUrl: asset.imageIpfsUrls?.[0]
          ? `https://gateway.pinata.cloud/ipfs/${asset.imageIpfsUrls[0].replace('ipfs://', '')}`
          : asset.images?.[0] || '',
        metadataUri: asset.metadataIpfsUrl,
        mintedBy: luxhubVendor?.walletAddress || 'LuxHub',
        mintedAt: asset.createdAt,
        status: mapAssetStatusToVault(asset.status),
        tags: [asset.category, asset.metaplexMetadata?.attributes?.brand?.toLowerCase()].filter(
          Boolean
        ),
        isVerifiedCreator: true,
        listing:
          asset.status === 'listed'
            ? {
                priceSol: asset.priceUSD ? asset.priceUSD / 150 : 0, // Rough conversion
                priceUsd: asset.priceUSD,
                listedAt: asset.updatedAt,
              }
            : undefined,
        offers: [],
        history: [
          {
            action: 'minted_to_vault',
            performedBy: luxhubVendor?.walletAddress || 'admin',
            performedAt: asset.createdAt,
            details: { source: 'bulk-mint' },
          },
        ],
        // Include original asset data for reference
        assetData: {
          vendor: asset.vendor,
          serial: asset.serial,
          priceUSD: asset.priceUSD,
          attributes: asset.metaplexMetadata?.attributes,
        },
      }));

      if (source === 'assets') {
        items = transformedAssets;
        total = assetTotal;
      } else {
        // Merge, avoiding duplicates
        const existingMints = new Set(items.map((i: any) => i.nftMint));
        const newItems = transformedAssets.filter((a: any) => !existingMints.has(a.nftMint));
        items = [...items, ...newItems];
        total = Math.max(total, assetTotal);
      }
    }

    // Calculate stats
    const [inventoryStats, assetStats] = await Promise.all([
      VaultInventory.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Asset.aggregate([
        { $match: { nftOwnerWallet: vaultPda, deleted: { $ne: true } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    // Merge stats
    const statusCounts: Record<string, number> = {};
    for (const s of inventoryStats) {
      statusCounts[s._id] = (statusCounts[s._id] || 0) + s.count;
    }
    for (const s of assetStats) {
      const mappedStatus = mapAssetStatusToVault(s._id);
      statusCounts[mappedStatus] = (statusCounts[mappedStatus] || 0) + s.count;
    }

    // Total unique count
    const [inventoryCount, assetsCount] = await Promise.all([
      VaultInventory.countDocuments({}),
      Asset.countDocuments({ nftOwnerWallet: vaultPda, deleted: { $ne: true } }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: Math.max(inventoryCount, assetsCount),
          pages: Math.ceil(Math.max(inventoryCount, assetsCount) / limitNum),
        },
        stats: {
          total: Math.max(inventoryCount, assetsCount),
          byStatus: statusCounts,
          vaultAddress: vaultPda,
          multisigAddress: vaultConfig.multisigAddress,
          luxhubVendorId: luxhubVendor?._id?.toString(),
        },
      },
    });
  } catch (error) {
    console.error('[VAULT-ASSETS] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch vault assets' });
  }
}

// Helper to map Asset status to VaultInventory status
function mapAssetStatusToVault(assetStatus: string): string {
  const map: Record<string, string> = {
    pending: 'minted',
    reviewed: 'ready_to_list',
    listed: 'listed',
    in_escrow: 'listed',
    pooled: 'pooled',
    sold: 'transferred',
    burned: 'transferred',
    frozen: 'reserved',
  };
  return map[assetStatus] || 'minted';
}
