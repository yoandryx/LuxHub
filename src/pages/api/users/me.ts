// src/pages/api/users/me.ts
// Get current user's profile with all linked wallets
import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/database/mongodb';
import { User } from '@/lib/models/User';
import { Vendor } from '@/lib/models/Vendor';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { privyId, wallet } = req.query;

  if (!privyId && !wallet) {
    return res.status(400).json({ error: 'privyId or wallet required' });
  }

  try {
    await connectDB();

    // Find user by privyId or wallet
    let user;
    if (privyId) {
      user = await User.findOne({ privyId }).lean();
    }
    if (!user && wallet) {
      user = await User.findOne({
        $or: [{ wallet }, { 'linkedWallets.address': wallet }],
      }).lean();
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is a vendor
    const userDoc = user as any;
    let vendorProfile = null;
    if (userDoc.role === 'vendor' || userDoc.wallet) {
      const vendor = await Vendor.findOne({
        $or: [{ user: userDoc._id }, { wallet: userDoc.wallet }],
      }).lean();

      if (vendor) {
        const vendorDoc = vendor as any;
        vendorProfile = {
          id: vendorDoc._id,
          businessName: vendorDoc.businessName,
          username: vendorDoc.username,
          verified: vendorDoc.verified,
          avatarUrl: vendorDoc.avatarUrl,
        };
      }
    }

    // Get all unique wallet addresses
    const allWallets = new Set<string>();
    if (userDoc.wallet) allWallets.add(userDoc.wallet);
    userDoc.linkedWallets?.forEach((w: any) => allWallets.add(w.address));
    userDoc.secondaryWallets?.forEach((w: string) => allWallets.add(w));

    return res.status(200).json({
      user: {
        id: userDoc._id,
        privyId: userDoc.privyId,
        email: userDoc.email,
        emailVerified: userDoc.emailVerified,
        role: userDoc.role,
        profile: userDoc.profile,
        primaryWallet: userDoc.wallet,
        linkedWallets: userDoc.linkedWallets || [],
        allWalletAddresses: Array.from(allWallets),
        totalInvested: userDoc.totalInvested,
        createdAt: userDoc.createdAt,
        lastLoginAt: userDoc.lastLoginAt,
      },
      vendorProfile,
    });
  } catch (error: any) {
    console.error('[users/me] Error:', error);
    return res.status(500).json({ error: 'Failed to fetch user data' });
  }
}
