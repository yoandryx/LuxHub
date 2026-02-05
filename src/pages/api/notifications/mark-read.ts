// src/pages/api/notifications/mark-read.ts
// Mark notification(s) as read
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Notification } from '../../../lib/models/Notification';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();

    const { notificationIds, wallet, markAll } = req.body;

    // Option 1: Mark all notifications as read for a wallet
    if (markAll && wallet) {
      const result = await Notification.updateMany(
        { userWallet: wallet, read: false, deleted: false },
        { $set: { read: true, readAt: new Date() } }
      );

      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        modifiedCount: result.modifiedCount,
      });
    }

    // Option 2: Mark specific notifications as read
    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      const result = await Notification.updateMany(
        { _id: { $in: notificationIds }, read: false },
        { $set: { read: true, readAt: new Date() } }
      );

      return res.status(200).json({
        success: true,
        message: 'Notifications marked as read',
        modifiedCount: result.modifiedCount,
      });
    }

    // Option 3: Mark single notification as read
    if (req.body.notificationId) {
      const notification = await Notification.findByIdAndUpdate(
        req.body.notificationId,
        { $set: { read: true, readAt: new Date() } },
        { new: true }
      );

      if (!notification) {
        return res.status(404).json({ error: 'Notification not found' });
      }

      return res.status(200).json({
        success: true,
        notification,
      });
    }

    return res.status(400).json({
      error:
        'Invalid request. Provide notificationId, notificationIds[], or {wallet, markAll: true}',
    });
  } catch (error: any) {
    console.error('[/api/notifications/mark-read] Error:', error);
    return res.status(500).json({
      error: 'Failed to mark notifications as read',
      details: error?.message || 'Unknown error',
    });
  }
}
