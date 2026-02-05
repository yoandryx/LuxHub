// src/pages/api/notifications/list.ts
// Get notifications for a user with pagination and filtering
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Notification } from '../../../lib/models/Notification';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { wallet, limit = '20', offset = '0', unreadOnly = 'false', type } = req.query;

    if (!wallet || typeof wallet !== 'string') {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    // Build query
    const query: Record<string, any> = {
      userWallet: wallet,
      deleted: false,
    };

    // Filter by read status
    if (unreadOnly === 'true') {
      query.read = false;
    }

    // Filter by notification type
    if (type && typeof type === 'string') {
      query.type = type;
    }

    const limitNum = Math.min(parseInt(limit as string, 10) || 20, 100);
    const offsetNum = parseInt(offset as string, 10) || 0;

    // Fetch notifications
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(offsetNum).limit(limitNum).lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userWallet: wallet, read: false, deleted: false }),
    ]);

    return res.status(200).json({
      notifications,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + notifications.length < total,
      },
      unreadCount,
    });
  } catch (error: any) {
    console.error('[/api/notifications/list] Error:', error);
    return res.status(500).json({
      error: 'Failed to fetch notifications',
      details: error?.message || 'Unknown error',
    });
  }
}
