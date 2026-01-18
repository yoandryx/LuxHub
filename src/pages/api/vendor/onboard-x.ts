// File: /pages/api/vendor/onboard.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import InviteCodeModel from '../../../lib/models/InviteCode';

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

  const { wallet, name, username, bio, avatarUrl, bannerUrl, inviteCode, socialLinks } = req.body;

  const { instagram, x, website } = formatSocialLinks(
    socialLinks?.instagram,
    socialLinks?.x,
    socialLinks?.website
  );

  if (!wallet || !name || !username || !inviteCode || !avatarUrl || !bannerUrl) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await dbConnect();

    const invite = await InviteCodeModel.findOne({ code: inviteCode });

    if (!invite || invite.used) {
      return res.status(403).json({ error: 'Invalid or already used invite code' });
    }

    if (invite.vendorWallet !== wallet) {
      return res.status(403).json({ error: 'Wallet does not match invite' });
    }

    await VendorProfileModel.create({
      wallet,
      name,
      username,
      bio,
      avatarUrl,
      bannerUrl,
      socialLinks: {
        instagram,
        x,
        website,
      },
      approved: false,
      verified: false,
      inventory: [],
    });

    invite.used = true;
    await invite.save();

    return res.status(200).json({ message: 'Vendor profile submitted for approval' });
  } catch (err) {
    console.error('Onboard error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
