// src/pages/api/admin/interests.ts
// Admin-only: List vendor interest submissions from /vendor/apply
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorInterest from '../../../lib/models/VendorInterest';

const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '')
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);

function isAdmin(wallet: string) {
  return ADMIN_WALLETS.includes(wallet);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const adminWallet = req.headers['x-wallet-address'] as string;
  if (!adminWallet || !isAdmin(adminWallet)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await dbConnect();

  if (req.method === 'GET') {
    const interests = await VendorInterest.find().sort({ createdAt: -1 }).limit(50).lean();
    return res.status(200).json({ interests });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Application ID is required' });
    }
    await VendorInterest.findByIdAndDelete(id);
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
