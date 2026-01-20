// src/pages/api/vendor/register.ts
// Simplified vendor registration - creates User + Vendor in one call
// No invite code required (for development/testing)

import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { User } from '../../../lib/models/User';
import { Vendor } from '../../../lib/models/Vendor';

interface RegisterVendorRequest {
  wallet: string;
  businessName: string;
  username: string;
  bio?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { wallet, businessName, username, bio } = req.body as RegisterVendorRequest;

    // Validation
    if (!wallet || !businessName || !username) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['wallet', 'businessName', 'username'],
      });
    }

    // Validate wallet format
    if (typeof wallet !== 'string' || wallet.length < 32 || wallet.length > 44) {
      return res.status(400).json({ error: 'Invalid wallet address format' });
    }

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        error: 'Invalid username format',
        message: 'Username must be 3-20 characters, alphanumeric and underscores only',
      });
    }

    await dbConnect();

    // Check if username is taken
    const existingVendor = await Vendor.findOne({ username });
    if (existingVendor) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    // Get or create user
    let user = await User.findOne({ wallet });
    if (!user) {
      user = await User.create({
        wallet,
        role: 'vendor',
      });
    } else if (user.role !== 'vendor') {
      // Upgrade user to vendor role
      user.role = 'vendor';
      await user.save();
    }

    // Check if vendor profile already exists for this user
    const existingProfile = await Vendor.findOne({ user: user._id });
    if (existingProfile) {
      return res.status(409).json({
        error: 'Vendor profile already exists',
        vendor: {
          _id: existingProfile._id,
          username: existingProfile.username,
          businessName: existingProfile.businessName,
        },
      });
    }

    // Create vendor profile
    const vendor = await Vendor.create({
      user: user._id,
      businessName,
      username,
      bio: bio || '',
      verified: false, // Requires admin verification
    });

    return res.status(201).json({
      success: true,
      message: 'Vendor registered successfully',
      user: {
        _id: user._id,
        wallet: user.wallet,
        role: user.role,
      },
      vendor: {
        _id: vendor._id,
        username: vendor.username,
        businessName: vendor.businessName,
        verified: vendor.verified,
      },
    });
  } catch (error: unknown) {
    console.error('[/api/vendor/register] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Handle duplicate key errors
    if (message.includes('duplicate key')) {
      if (message.includes('username')) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      if (message.includes('wallet')) {
        return res.status(409).json({ error: 'Wallet already registered' });
      }
    }

    return res.status(500).json({ error: 'Failed to register vendor', details: message });
  }
}
