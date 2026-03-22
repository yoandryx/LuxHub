// src/pages/api/admin/invites.ts
// Admin-only: List all invites, or create a new one
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import InviteCodeModel from '../../../lib/models/InviteCode';
import { v4 as uuidv4 } from 'uuid';

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
    const invites = await InviteCodeModel.find().sort({ _id: -1 }).limit(50).lean();
    return res.status(200).json({ invites });
  }

  if (req.method === 'POST') {
    const { vendorWallet, vendorName } = req.body;

    if (!vendorWallet) {
      return res.status(400).json({ error: 'Vendor wallet address is required' });
    }

    // Check for existing unused invite for this wallet
    const existing = await InviteCodeModel.findOne({
      vendorWallet,
      used: false,
    });

    if (existing) {
      return res.status(200).json({
        code: existing.code,
        existing: true,
        message: 'Invite already exists for this wallet',
      });
    }

    const code = uuidv4();

    await InviteCodeModel.create({
      code,
      vendorWallet,
      vendorName: vendorName || null,
      createdBy: adminWallet,
      used: false,
      expiresAt: null,
    });

    return res.status(200).json({ code, existing: false });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
