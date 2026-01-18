// File: /pages/api/vendor/onboard.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import InviteCodeModel from '../../../lib/models/InviteCode';
import { z } from 'zod'; // Import Zod for validation

// Zod schema for input validation
const onboardSchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
  name: z.string().min(1, 'Name is required'),
  username: z.string().min(1, 'Username is required'),
  bio: z.string().optional(),
  avatarUrl: z.string().url('Invalid avatar URL').min(1, 'Avatar URL is required'),
  bannerUrl: z.string().url('Invalid banner URL').min(1, 'Banner URL is required'),
  inviteCode: z.string().min(1, 'Invite code is required'),
  socialLinks: z
    .object({
      instagram: z.string().optional(),
      x: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
  multisigPda: z.string().optional(), // New optional field for multisig PDA
});

// Helper to format social links into full URLs
function formatSocialLinks(instagram?: string, x?: string, website?: string) {
  const clean = (handle: string) => handle.replace(/^@/, '').trim();

  return {
    instagram: instagram ? `https://instagram.com/${clean(instagram)}` : '',
    x: x ? `https://x.com/${clean(x)}` : '',
    website: website?.trim() || '',
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse and validate request body using Zod
    const parsedBody = onboardSchema.parse(req.body);

    const {
      wallet,
      name,
      username,
      bio,
      avatarUrl,
      bannerUrl,
      inviteCode,
      socialLinks,
      multisigPda, // New field
    } = parsedBody;

    const formattedSocialLinks = formatSocialLinks(
      socialLinks?.instagram,
      socialLinks?.x,
      socialLinks?.website
    );

    // Connect to DB (cached connection recommended for production)
    await dbConnect();

    // Find and validate invite code
    const invite = await InviteCodeModel.findOne({ code: inviteCode });

    if (!invite || invite.used) {
      return res.status(403).json({ error: 'Invalid or already used invite code' });
    }

    if (invite.vendorWallet !== wallet) {
      return res.status(403).json({ error: 'Wallet does not match invite' });
    }

    // Create vendor profile (include multisigPda if provided)
    await VendorProfileModel.create({
      wallet,
      name,
      username,
      bio,
      avatarUrl,
      bannerUrl,
      socialLinks: formattedSocialLinks,
      multisigPda: multisigPda || null, // Store null if not provided
      approved: false,
      verified: false,
      inventory: [],
    });

    // Mark invite as used
    invite.used = true;
    await invite.save();

    return res.status(200).json({ message: 'Vendor profile submitted for approval' });
  } catch (err) {
    if (err instanceof z.ZodError) {
      // Handle validation errors
      return res.status(400).json({ error: 'Invalid input', details: err.errors });
    }
    console.error('Onboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
