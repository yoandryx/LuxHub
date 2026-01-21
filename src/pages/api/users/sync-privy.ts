// src/pages/api/users/sync-privy.ts
// Syncs Privy user data with MongoDB User collection
import type { NextApiRequest, NextApiResponse } from 'next';
import connectDB from '@/lib/database/mongodb';
import { User } from '@/lib/models/User';

interface LinkedAccount {
  type: string;
  chainType?: string;
  address?: string;
  walletClientType?: string;
  verified_at?: number;
}

interface PrivyUserData {
  id: string; // Privy DID (did:privy:xxx)
  createdAt?: number;
  email?: {
    address: string;
    verified?: boolean;
  };
  linkedAccounts?: LinkedAccount[];
}

interface LinkedWallet {
  address: string;
  type: 'embedded' | 'external' | 'backpack';
  chainType: string;
  walletClient?: string;
  isPrimary: boolean;
  linkedAt: Date;
  verified: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { privyUser } = req.body as { privyUser: PrivyUserData };

  if (!privyUser?.id) {
    return res.status(400).json({ error: 'Privy user data required' });
  }

  try {
    await connectDB();

    // Extract wallets from linkedAccounts
    const linkedWallets: LinkedWallet[] = [];
    let primaryWallet: string | null = null;

    if (privyUser.linkedAccounts) {
      for (const account of privyUser.linkedAccounts) {
        // Handle embedded Solana wallet
        if (account.type === 'embedded_solana_wallet' && account.address) {
          linkedWallets.push({
            address: account.address,
            type: 'embedded',
            chainType: 'solana',
            walletClient: 'privy_embedded',
            isPrimary: linkedWallets.length === 0, // First wallet is primary
            linkedAt: new Date(),
            verified: true,
          });
          if (!primaryWallet) primaryWallet = account.address;
        }

        // Handle external Solana wallet
        if (account.type === 'wallet' && account.chainType === 'solana' && account.address) {
          linkedWallets.push({
            address: account.address,
            type: 'external',
            chainType: 'solana',
            walletClient: account.walletClientType || 'unknown',
            isPrimary: linkedWallets.length === 0, // First wallet is primary if no embedded
            linkedAt: new Date(),
            verified: !!account.verified_at,
          });
          if (!primaryWallet) primaryWallet = account.address;
        }
      }
    }

    // Find existing user by privyId, email, or any linked wallet
    let user = await User.findOne({ privyId: privyUser.id });

    if (!user && privyUser.email?.address) {
      user = await User.findOne({ email: privyUser.email.address });
    }

    if (!user && primaryWallet) {
      user = await User.findOne({
        $or: [{ wallet: primaryWallet }, { 'linkedWallets.address': primaryWallet }],
      });
    }

    const now = new Date();

    if (user) {
      // Update existing user
      const updateData: Record<string, any> = {
        privyId: privyUser.id,
        lastLoginAt: now,
        $inc: { loginCount: 1 },
      };

      // Update email if not set or different
      if (privyUser.email?.address && !user.email) {
        updateData.email = privyUser.email.address;
        updateData.emailVerified = privyUser.email.verified || false;
      }

      // Update primary wallet if not set
      if (primaryWallet && !user.wallet) {
        updateData.wallet = primaryWallet;
      }

      // Merge linked wallets (add new ones, don't remove existing)
      const existingAddresses = new Set(user.linkedWallets?.map((w: any) => w.address) || []);
      const newWallets = linkedWallets.filter((w) => !existingAddresses.has(w.address));

      if (newWallets.length > 0) {
        updateData.$push = { linkedWallets: { $each: newWallets } };
      }

      await User.findByIdAndUpdate(user._id, updateData);

      // Fetch updated user
      user = await User.findById(user._id).lean();
    } else {
      // Create new user
      user = await User.create({
        privyId: privyUser.id,
        privyCreatedAt: privyUser.createdAt ? new Date(privyUser.createdAt) : now,
        email: privyUser.email?.address,
        emailVerified: privyUser.email?.verified || false,
        wallet: primaryWallet,
        linkedWallets,
        lastLoginAt: now,
        loginCount: 1,
      });
    }

    // Return user data with all linked wallets
    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        privyId: user.privyId,
        email: user.email,
        emailVerified: user.emailVerified,
        wallet: user.wallet,
        linkedWallets: user.linkedWallets || [],
        role: user.role,
        profile: user.profile,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (error: any) {
    console.error('[sync-privy] Error:', error);
    return res.status(500).json({ error: 'Failed to sync user data' });
  }
}
