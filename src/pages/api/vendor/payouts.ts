// /pages/api/vendor/payouts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Transaction } from '../../../lib/models/Transaction';
import { Vendor } from '../../../lib/models/Vendor';
import { User } from '../../../lib/models/User';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid wallet address' });
  }

  try {
    await dbConnect();

    // Find the vendor by wallet (through User relationship)
    const user = await User.findOne({ wallet }).lean();
    if (!user) {
      return res.status(200).json({
        payouts: [],
        totalSales: 0,
        pendingPayouts: 0,
      });
    }

    const vendor = await Vendor.findOne({ user: user._id }).lean();
    if (!vendor) {
      return res.status(200).json({
        payouts: [],
        totalSales: 0,
        pendingPayouts: 0,
      });
    }

    // Fetch sale transactions for this vendor
    // The vendor's wallet should be in toWallet for completed sales
    const transactions = await Transaction.find({
      $or: [
        { toWallet: wallet },
        {
          fromWallet: wallet,
          type: { $in: ['sale', 'offer_acceptance', 'negotiation_settlement'] },
        },
      ],
      type: { $in: ['sale', 'offer_acceptance', 'negotiation_settlement'] },
      deleted: { $ne: true },
    })
      .populate({
        path: 'asset',
        select: 'model priceUSD images imageIpfsUrls',
      })
      .sort({ createdAt: -1 })
      .lean();

    // Calculate totals
    const completedTransactions = transactions.filter((t: any) => t.status === 'success');
    const pendingTransactions = transactions.filter((t: any) => t.status === 'pending');

    const totalSales = completedTransactions.reduce(
      (sum: number, t: any) => sum + (t.amountUSD || 0),
      0
    );

    const pendingPayouts = pendingTransactions.reduce(
      (sum: number, t: any) => sum + (t.vendorEarningsUSD || t.amountUSD * 0.97 || 0),
      0
    );

    // Also check vendor's salesSummary if available
    const vendorTotalSales = vendor.salesSummary?.totalSales || totalSales;

    // Transform transactions to payout format
    const payouts = transactions.map((tx: any) => ({
      _id: tx._id,
      assetId: tx.asset?._id,
      assetTitle: tx.asset?.model || 'Asset',
      assetImage: tx.asset?.imageIpfsUrls?.[0] || tx.asset?.images?.[0],
      type: tx.type,
      grossAmount: tx.amountUSD || 0,
      royaltyAmount: tx.luxhubRoyaltyUSD || (tx.amountUSD ? tx.amountUSD * 0.03 : 0),
      netAmount: tx.vendorEarningsUSD || (tx.amountUSD ? tx.amountUSD * 0.97 : 0),
      status: tx.status,
      txSignature: tx.txSignature,
      buyerWallet: tx.fromWallet,
      createdAt: tx.createdAt,
    }));

    res.status(200).json({
      payouts,
      totalSales: vendorTotalSales,
      totalRoyaltiesPaid: vendorTotalSales * 0.03,
      netEarnings: vendorTotalSales * 0.97,
      pendingPayouts: Math.round(pendingPayouts * 100) / 100,
    });
  } catch (err) {
    console.error('[vendor/payouts] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
