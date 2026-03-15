// pages/api/vendor/onboard-api.ts
// Open vendor registration - no invite code required
// Flow: Register → Pending → Admin Approval → (Optional) Verification
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import { z } from 'zod';
import { strictLimiter } from '../../../lib/middleware/rateLimit';
import { notifyNewVendorApplication } from '../../../lib/services/notificationService';

const onboardSchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  username: z.string().min(3, 'Username must be at least 3 characters'),
  bio: z.string().min(10, 'Bio must be at least 10 characters'),
  avatarUrl: z.string().url('Invalid avatar URL'),
  bannerUrl: z.string().url('Invalid banner URL'),
  socialLinks: z
    .object({
      instagram: z.string(),
      x: z.string(),
      website: z.string(),
    })
    .optional(),
  multisigPda: z.union([z.string(), z.null()]).optional(),
  // Honeypot field
  _company: z.string().optional(),
  // Application questionnaire
  businessType: z
    .enum(['individual', 'small_business', 'dealer', 'auction_house', 'brand_authorized'])
    .optional(),
  estimatedInventorySize: z.enum(['1-5', '6-20', '21-50', '50+']).optional(),
  primaryCategory: z.enum(['watches', 'jewelry', 'collectibles', 'art', 'mixed']).optional(),
  yearsInBusiness: z.number().optional(),
  hasPhysicalLocation: z.boolean().optional(),
  additionalNotes: z.string().optional(),
});

function formatSocialLinks(instagram?: string, x?: string, website?: string) {
  const clean = (h: string) => h.replace(/^@/, '').trim();
  return {
    instagram: instagram ? `https://instagram.com/${clean(instagram)}` : '',
    x: x ? `https://x.com/${clean(x)}` : '',
    website: website || '',
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const parsed = onboardSchema.parse(body);

    // Honeypot check: if _company is filled, silently succeed without DB write
    if (parsed._company) {
      return res.status(200).json({
        message: 'Application submitted successfully! Your profile is pending approval.',
        status: 'pending',
      });
    }

    await dbConnect();

    // Check if username is taken
    const existingUsername = await VendorProfileModel.findOne({ username: parsed.username });
    if (existingUsername) return res.status(400).json({ error: 'Username already taken' });

    // Check if wallet already registered
    const existingWallet = await VendorProfileModel.findOne({ wallet: parsed.wallet });
    if (existingWallet)
      return res.status(400).json({ error: 'Wallet already registered as vendor' });

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
      applicationStatus: 'pending',
      businessType: parsed.businessType,
      estimatedInventorySize: parsed.estimatedInventorySize,
      primaryCategory: parsed.primaryCategory,
      yearsInBusiness: parsed.yearsInBusiness,
      hasPhysicalLocation: parsed.hasPhysicalLocation,
      additionalNotes: parsed.additionalNotes,
    });

    // Notify admins of new application
    try {
      await notifyNewVendorApplication({
        vendorName: parsed.name.trim(),
        vendorWallet: parsed.wallet,
        vendorUsername: parsed.username.trim(),
        businessType: parsed.businessType,
        primaryCategory: parsed.primaryCategory,
      });
    } catch (notifErr) {
      console.error('[onboard-api] Admin notification error (non-blocking):', notifErr);
    }

    return res.status(200).json({
      message: 'Application submitted successfully! Your profile is pending approval.',
      status: 'pending',
    });
  } catch (err: any) {
    console.error('API ERROR:', err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.errors });
    }
    return res.status(500).json({ error: 'Server error' });
  }
}

export default strictLimiter(handler);
