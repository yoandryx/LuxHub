// pages/api/vault/config/admins.ts
// Get authorized admins for the vault (requires admin auth)

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '@/lib/database/mongodb';
import { VaultConfig } from '@/lib/models/LuxHubVault';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for admin wallet header
  const adminWallet = req.headers['x-admin-wallet'] as string;
  if (!adminWallet) {
    return res.status(401).json({ error: 'Missing x-admin-wallet header' });
  }

  await dbConnect();

  try {
    const config = (await VaultConfig.findOne({ isActive: true }).lean()) as {
      authorizedAdmins?: Array<{
        walletAddress: string;
        name?: string;
        role: string;
        addedAt: Date;
        addedBy?: string;
      }>;
    } | null;

    if (!config) {
      return res.status(404).json({ error: 'Vault not configured' });
    }

    // Check if requester is an authorized admin
    const isAdmin = config.authorizedAdmins?.some((a) => a.walletAddress === adminWallet);

    if (!isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view admin list' });
    }

    return res.status(200).json({
      success: true,
      data: {
        authorizedAdmins: config.authorizedAdmins || [],
      },
    });
  } catch (error) {
    console.error('[VAULT-CONFIG-ADMINS] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch admin list' });
  }
}
