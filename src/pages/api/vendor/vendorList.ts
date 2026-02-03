import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import { Escrow } from '../../../lib/models/Escrow';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await dbConnect();

    const includeStats = req.query.includeStats === 'true';

    const vendors = await VendorProfileModel.find({ approved: true }).lean();
    const verifiedVendors = await VendorProfileModel.find({ verified: true }).lean();

    // If stats requested, fetch escrow data for each vendor
    if (includeStats) {
      const vendorWallets = [
        ...new Set([...vendors, ...verifiedVendors].map((v: any) => v.wallet)),
      ];

      // Get all escrows for these vendors in one query (using sellerWallet)
      const allEscrows = await Escrow.find({
        sellerWallet: { $in: vendorWallets },
        deleted: { $ne: true },
        status: { $nin: ['cancelled', 'failed'] },
      }).lean();

      // Create a map of wallet -> stats
      const statsMap: Record<
        string,
        { totalItems: number; itemsListed: number; inventoryValue: number }
      > = {};

      for (const wallet of vendorWallets) {
        const vendorEscrows = allEscrows.filter((e: any) => e.sellerWallet === wallet);
        statsMap[wallet] = {
          totalItems: vendorEscrows.length,
          itemsListed: vendorEscrows.filter(
            (e: any) => e.status === 'listed' || e.status === 'initiated'
          ).length,
          inventoryValue: vendorEscrows.reduce(
            (sum: number, e: any) => sum + (e.listingPriceUSD || 0),
            0
          ),
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
