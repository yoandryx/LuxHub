import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import AssetModel from '../../../lib/models/Assets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();

    const includeStats = req.query.includeStats === 'true';

    const vendors = await VendorProfileModel.find({ approved: true }).lean();
    const verifiedVendors = await VendorProfileModel.find({ verified: true }).lean();

    // If stats requested, fetch asset data for each vendor
    if (includeStats) {
      const vendorWallets = [
        ...new Set([...vendors, ...verifiedVendors].map((v: any) => v.wallet)),
      ];

      // Get all assets for these vendors in one query
      const allAssets = await AssetModel.find({
        vendorWallet: { $in: vendorWallets },
        status: { $ne: 'burned' },
      }).lean();

      // Create a map of wallet -> stats
      const statsMap: Record<
        string,
        { totalItems: number; itemsListed: number; inventoryValue: number }
      > = {};

      for (const wallet of vendorWallets) {
        const vendorAssets = allAssets.filter((a: any) => a.vendorWallet === wallet);
        statsMap[wallet] = {
          totalItems: vendorAssets.length,
          itemsListed: vendorAssets.filter((a: any) => a.status === 'listed').length,
          inventoryValue: vendorAssets.reduce((sum: number, a: any) => sum + (a.priceUSD || 0), 0),
        };
      }

      // Attach stats to vendors
      const vendorsWithStats = vendors.map((v: any) => ({
        ...v,
        stats: statsMap[v.wallet] || { totalItems: 0, itemsListed: 0, inventoryValue: 0 },
      }));

      const verifiedWithStats = verifiedVendors.map((v: any) => ({
        ...v,
        stats: statsMap[v.wallet] || { totalItems: 0, itemsListed: 0, inventoryValue: 0 },
      }));

      return res
        .status(200)
        .json({ vendors: vendorsWithStats, verifiedVendors: verifiedWithStats });
    }

    res.status(200).json({ vendors, verifiedVendors });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ error: 'Failed to fetch vendors.' });
  }
}
