// pages/api/vendor/onboard-b-api.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import InviteCodeModel from '../../../lib/models/InviteCode';
import { z } from 'zod';

const onboardSchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  avatarUrl: z.string().url('Invalid avatar URL'),
  bannerUrl: z.string().url('Invalid banner URL'),
  inviteCode: z.union([z.string(), z.null()]).optional(),
  socialLinks: z
    .object({
      instagram: z.string(),
      x: z.string(),
      website: z.string(),
    })
    .optional(),
  multisigPda: z.union([z.string(), z.null()]).optional(),
});

function formatSocialLinks(instagram?: string, x?: string, website?: string) {
  const clean = (h: string) => h.replace(/^@/, '').trim();
  return {
    instagram: instagram ? `https://instagram.com/${clean(instagram)}` : '',
    x: x ? `https://x.com/${clean(x)}` : '',
    website: website || '',
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    console.log('API RECEIVED:', body); // DEBUG

    const parsed = onboardSchema.parse(body);

    await dbConnect();

    const existing = await VendorProfileModel.findOne({ username: parsed.username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    // Invite code validation (optional - skip if not provided)
    if (parsed.inviteCode) {
      const invite = await InviteCodeModel.findOne({ code: parsed.inviteCode });
      if (!invite || invite.used || invite.vendorWallet !== parsed.wallet) {
        return res.status(403).json({ error: 'Invalid invite code' });
      }
      // Mark invite as used after successful validation
      invite.used = true;
      await invite.save();
    }

    await VendorProfileModel.create({
      ...parsed,
      socialLinks: formatSocialLinks(
        parsed.socialLinks?.instagram,
        parsed.socialLinks?.x,
        parsed.socialLinks?.website
      ),
      multisigPda: parsed.multisigPda || null,
      approved: false,
      verified: false,
      inventory: [],
    });

    return res.status(200).json({ message: 'Submitted!' });
  } catch (err: any) {
    console.error('API ERROR:', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.errors });
    }
    return res.status(500).json({ error: 'Server error' });
  }
}
