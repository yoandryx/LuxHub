import type { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import dbConnect from '../../../lib/database/mongodb';
import { User } from '../../../lib/models/User';

/**
 * Auth Signup API
 *
 * Supports two authentication modes:
 * 1. Wallet-based (Web3): Just provide wallet address
 * 2. Email/Password (Web2): Traditional auth
 *
 * POST /api/auth/signup
 * Body (wallet-based): { wallet: string, role?: 'user' | 'vendor' }
 * Body (email-based): { email: string, password: string, role?: string }
 */
const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const { wallet, email, password, role = 'user' } = req.body;

    // Wallet-based authentication (Web3)
    if (wallet) {
      // Validate wallet address format (basic Solana address check)
      if (typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
      }

      // Check if user already exists
      let user = await User.findOne({ wallet });

      if (user) {
        // User exists, return token
        const token = jwt.sign(
          { userId: user._id, wallet: user.wallet, role: user.role },
          process.env.JWT_SECRET!,
          { expiresIn: '7d' }
        );
        return res.status(200).json({
          message: 'User already exists',
          token,
          user: {
            _id: user._id,
            wallet: user.wallet,
            role: user.role,
          },
        });
      }

      // Create new wallet-based user
      user = await User.create({
        wallet,
        role: role === 'vendor' ? 'vendor' : 'user',
      });

      const token = jwt.sign(
        { userId: user._id, wallet: user.wallet, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        message: 'User created successfully',
        token,
        user: {
          _id: user._id,
          wallet: user.wallet,
          role: user.role,
        },
      });
    }

    // Email/Password authentication (Web2) - legacy support
    if (email && password) {
      // Check for existing user
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      // Note: Password hashing should be handled by User model pre-save hook
      const newUser = await User.create({
        email,
        password,
        role,
      });

      const token = jwt.sign({ userId: newUser._id, role: newUser.role }, process.env.JWT_SECRET!, {
        expiresIn: '24h',
      });

      return res.status(201).json({ token, userId: newUser._id });
    }

    // Neither wallet nor email/password provided
    return res.status(400).json({
      error: 'Authentication required',
      message: 'Provide either a wallet address (Web3) or email/password (Web2)',
      examples: {
        web3: { wallet: 'YourSolanaWalletAddress', role: 'user' },
        web2: { email: 'user@example.com', password: 'yourpassword' },
      },
    });
  } catch (error: unknown) {
    console.error('[/api/auth/signup] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: 'Failed to create user', details: message });
  }
};

export default handler;
