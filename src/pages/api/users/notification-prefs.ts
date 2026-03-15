// src/pages/api/users/notification-prefs.ts
// GET/PUT notification preferences for a user
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { User } from '../../../lib/models/User';

const DEFAULT_PREFS = {
  emailEnabled: true,
  inAppEnabled: true,
  orderUpdates: true,
  offerAlerts: true,
  paymentAlerts: true,
  poolUpdates: true,
  securityAlerts: true,
  marketingUpdates: false,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: fetch preferences
  if (req.method === 'GET') {
    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const user = (await User.findOne({ wallet }).lean()) as any;
    const prefs = user?.notificationPrefs || DEFAULT_PREFS;
    const email = user?.email || null;

    return res.status(200).json({
      success: true,
      email,
      emailVerified: user?.emailVerified || false,
      preferences: { ...DEFAULT_PREFS, ...prefs },
    });
  }

  // PUT: update preferences
  if (req.method === 'PUT') {
    const { wallet, email, preferences } = req.body;
    if (!wallet) return res.status(400).json({ error: 'wallet required' });

    const updates: Record<string, any> = {};

    // Update email if provided
    if (email !== undefined) {
      updates.email = email || null;
      if (email) updates.emailVerified = false; // Reset verification on change
    }

    // Update notification preferences
    if (preferences && typeof preferences === 'object') {
      const validKeys = Object.keys(DEFAULT_PREFS);
      for (const key of validKeys) {
        if (key in preferences && typeof preferences[key] === 'boolean') {
          updates[`notificationPrefs.${key}`] = preferences[key];
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const user = (await User.findOneAndUpdate(
      { wallet },
      { $set: updates },
      { new: true, upsert: true }
    ).lean()) as any;

    return res.status(200).json({
      success: true,
      email: user.email,
      preferences: { ...DEFAULT_PREFS, ...(user.notificationPrefs || {}) },
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
