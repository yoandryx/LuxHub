import { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../../lib/database/mongodb';
import Listing from '../../../../../lib/database/listings';
import { getAdminConfig } from '../../../../../lib/config/adminConfig';
import AdminRole from '../../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    await dbConnect();

    // Wallet-based admin authorization
    const requestingWallet =
      (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

    if (!requestingWallet) {
      return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
    }

    const adminConfig = getAdminConfig();
    const isEnvAdmin = adminConfig.isAdmin(requestingWallet);
    const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

    // Check if has permission to approve listings
    const canApprove =
      isEnvAdmin || dbAdmin?.permissions?.canApproveListings || dbAdmin?.role === 'super_admin';

    if (!canApprove) {
      return res
        .status(403)
        .json({ error: 'Admin access required - must have canApproveListings permission' });
    }

    const { listingId, approved } = req.body;

    if (!listingId || typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    listing.approved = approved;
    await listing.save();

    res.status(200).json({ message: 'Listing status updated', listing });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
