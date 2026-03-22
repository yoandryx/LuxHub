// pages/api/vendor/onboard-api.ts
// Invite-only vendor registration
// Flow: Admin generates invite → Vendor onboards with invite code → Pending → Admin Approval
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorProfileModel from '../../../lib/models/VendorProfile';
import InviteCodeModel from '../../../lib/models/InviteCode';
import { z } from 'zod';
import { strictLimiter } from '../../../lib/middleware/rateLimit';
import { notifyNewVendorApplication } from '../../../lib/services/notificationService';
import { User } from '../../../lib/models/User';

const onboardSchema = z.object({
  wallet: z.string().min(1, 'Wallet address is required'),
  inviteCode: z.string().min(1, 'Invite code is required'),
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

    // Validate invite code
    const invite = await InviteCodeModel.findOne({ code: parsed.inviteCode });
    if (!invite) {
      return res.status(403).json({ error: 'Invalid invite code' });
    }
    if (invite.used) {
      return res.status(403).json({ error: 'This invite code has already been used' });
    }
    if (invite.vendorWallet && invite.vendorWallet !== parsed.wallet) {
      return res.status(403).json({ error: 'This invite was issued for a different wallet' });
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(403).json({ error: 'This invite code has expired' });
    }

    // Check if username is taken (by a different wallet)
    const existingUsername = await VendorProfileModel.findOne({
      username: parsed.username,
      wallet: { $ne: parsed.wallet },
    });
    if (existingUsername) return res.status(400).json({ error: 'Username already taken' });

    // Check if wallet already registered
    const existingWallet = await VendorProfileModel.findOne({ wallet: parsed.wallet });
    if (existingWallet) {
      // If rejected, allow re-application by overwriting the old profile
      if (existingWallet.applicationStatus === 'rejected') {
        await VendorProfileModel.deleteOne({ wallet: parsed.wallet });
      } else {
        return res.status(400).json({ error: 'Wallet already registered as vendor' });
      }
    }

    await VendorProfileModel.create({
      ...parsed,
      email: invite.vendorEmail || undefined,
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

    // Propagate vendor email to User record for notification lookups
    if (invite.vendorEmail) {
      await User.findOneAndUpdate(
        { wallet: parsed.wallet },
        { $set: { email: invite.vendorEmail } },
        { upsert: false }
      );
      console.log(
        `[onboard-api] Stored vendor email on User record for ${parsed.wallet.slice(0, 8)}...`
      );
    }

    // Mark invite as used
    invite.used = true;
    invite.uses = (invite.uses || 0) + 1;
    await invite.save();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>';

    // Send vendor confirmation email (non-blocking)
    const vendorEmail = invite.vendorEmail;
    if (vendorEmail && resendKey) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [vendorEmail],
          subject: 'Application received — LuxHub',
          html: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark only;}body,html{background-color:#050507!important;}u+.body{background-color:#050507!important;}[data-ogsc] body{background-color:#050507!important;}@media(prefers-color-scheme:light){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}.t4{color:#555555!important;}}@media(prefers-color-scheme:dark){body,html,.cbg{background-color:#050507!important;}.t1{color:#ffffff!important;}.t2{color:#e0e0e0!important;}.t3{color:#999999!important;}.t4{color:#555555!important;}}</style></head>
<body class="cbg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">Your vendor application has been received.&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="cbg" style="background-color:#050507;">
<tr><td align="center" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:44px;"><img src="${appUrl}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" /></td></tr>
<tr><td class="cbg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">
<div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>
<div style="padding:48px 44px 40px;">
<p class="t1" style="margin:0 0 24px;font-size:18px;font-weight:600;color:#ffffff;">${parsed.name},</p>
<p class="t2" style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#e0e0e0;">Thank you for completing your vendor onboarding. Your application has been received.</p>
<p class="t3" style="margin:0 0 32px;font-size:14px;line-height:1.75;color:#999999;">Our team will review and verify your account. You will be notified once approved. In the meantime, start preparing your listings to request onto LuxHub.</p>
<div style="text-align:center;margin:0 0 28px;">
<a href="${appUrl}/vendor/vendorDashboard" class="accent-text" style="display:inline-block;min-width:200px;padding:16px 44px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">View Dashboard</a>
</div>
<p class="t4" style="margin:12px 0 0;font-size:11px;line-height:1.6;color:#555555;text-align:center;">Review typically takes less than 24 hours.</p>
</div></td></tr>
<tr><td style="padding:36px 16px 0;text-align:center;"><p class="t4" style="margin:0;font-size:11px;color:#555555;"><a href="https://luxhub.gold" style="color:#777;text-decoration:none;">luxhub.gold</a>&nbsp;&nbsp;&#183;&nbsp;&nbsp;<a href="https://x.com/LuxHubStudio" style="color:#777;text-decoration:none;">@LuxHubStudio</a></p></td></tr>
</table></td></tr></table></body></html>`,
        }),
      }).catch((err) => console.error('[onboard-api] Vendor confirmation email error:', err));
    }

    // Send admin email notification (non-blocking)
    const adminEmail = process.env.ADMIN_EMAIL || 'yoandry@luxhub.gold';
    if (resendKey) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [adminEmail],
          subject: `New vendor application — ${parsed.name}`,
          html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><style>:root{color-scheme:dark only;}body{background:#050507!important;}</style></head>
<body style="margin:0;padding:0;background:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#050507;">
<tr><td align="center" style="padding:40px 16px;background:#050507;">
<table width="500" cellspacing="0" cellpadding="0" border="0" style="max-width:500px;width:100%;">
<tr><td style="background:#0a0a0c;border:1px solid #1a1a1f;border-radius:12px;padding:32px 36px;">
<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#ffffff;">New Vendor Application</p>
<p style="margin:0 0 8px;font-size:14px;color:#e0e0e0;"><strong style="color:#c8a1ff;">Name:</strong> ${parsed.name} (@${parsed.username})</p>
<p style="margin:0 0 8px;font-size:14px;color:#e0e0e0;"><strong style="color:#c8a1ff;">Wallet:</strong> ${parsed.wallet.slice(0, 8)}...${parsed.wallet.slice(-4)}</p>
${parsed.businessType ? `<p style="margin:0 0 8px;font-size:14px;color:#e0e0e0;"><strong style="color:#c8a1ff;">Type:</strong> ${parsed.businessType}</p>` : ''}
${parsed.primaryCategory ? `<p style="margin:0 0 8px;font-size:14px;color:#e0e0e0;"><strong style="color:#c8a1ff;">Category:</strong> ${parsed.primaryCategory}</p>` : ''}
<div style="margin:20px 0 0;text-align:center;">
<a href="${appUrl}/adminDashboard" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.5px;">Review in Dashboard</a>
</div>
</td></tr></table></td></tr></table></body></html>`,
        }),
      }).catch((err) => console.error('[onboard-api] Admin email notification error:', err));
    }

    // Notify admins in-app
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
