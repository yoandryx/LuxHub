// src/pages/api/notifications/unread-count.ts
// Get unread notification count for badge display
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Notification } from '../../../lib/models/Notification';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { wallet } = req.query;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    const count = await Notification.countDocuments({
      userWallet: wallet,
      read: false,
      deleted: false,
    });

    return res.status(200).json({ count });
  } catch (error: any) {
    console.error('[/api/notifications/unread-count] Error:', error);
    return res.status(500).json({
      error: 'Failed to get unread count',
      details: error?.message || 'Unknown error',
    });
  }
}
