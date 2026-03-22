// src/pages/api/admin/invites.ts
// Admin-only: List all invites, create new ones (with email notification), or delete unused ones
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import InviteCodeModel from '../../../lib/models/InviteCode';
import VendorInterest from '../../../lib/models/VendorInterest';
import { notifyUser } from '../../../lib/services/notificationService';
import { v4 as uuidv4 } from 'uuid';

const ADMIN_WALLETS = (process.env.ADMIN_WALLETS || '')
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);

function isAdmin(wallet: string) {
  return ADMIN_WALLETS.includes(wallet);
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LuxHub <notifications@luxhub.gold>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold';

async function sendInviteEmail(
  email: string,
  name: string | null,
  link: string
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: `${name ? name + ', you' : 'You'}'re invited to sell on LuxHub`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000000;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;">

<!-- Logo -->
<tr><td align="center" style="padding-bottom:32px;">
  <img src="${APP_URL}/images/purpleLGG.png" alt="LuxHub" width="48" height="48" style="display:block;border:0;" />
</td></tr>

<!-- Main Card -->
<tr><td style="background:#0d0d0d;border:1px solid rgba(200,161,255,0.12);border-radius:16px;overflow:hidden;">

  <!-- Header accent line -->
  <div style="height:2px;background:linear-gradient(90deg,transparent,#c8a1ff,transparent);"></div>

  <!-- Content -->
  <div style="padding:40px 36px;">

    <!-- Greeting -->
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#ffffff;letter-spacing:-0.5px;">
      You're Invited
    </h1>
    <p style="margin:0 0 28px;font-size:14px;color:#666666;letter-spacing:0.3px;text-transform:uppercase;">
      Vendor Partnership
    </p>

    <!-- Body -->
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cccccc;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#cccccc;">
      We'd like to invite you to join LuxHub as a verified vendor. List authenticated luxury timepieces, backed by NFTs on Solana, with every transaction protected by on-chain escrow.
    </p>

    <!-- Value Props -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;">
          <span style="color:#c8a1ff;font-size:13px;font-weight:600;letter-spacing:0.5px;">ESCROW PROTECTION</span>
          <br/><span style="color:#888888;font-size:13px;">Funds held on-chain until buyer confirms delivery</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #1a1a1a;">
          <span style="color:#c8a1ff;font-size:13px;font-weight:600;letter-spacing:0.5px;">97% TO YOU</span>
          <br/><span style="color:#888888;font-size:13px;">Industry-low 3% platform fee, paid in USDC</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="color:#c8a1ff;font-size:13px;font-weight:600;letter-spacing:0.5px;">VERIFIED PROVENANCE</span>
          <br/><span style="color:#888888;font-size:13px;">Every piece minted as an NFT with permanent metadata</span>
        </td>
      </tr>
    </table>

    <!-- CTA -->
    <div style="text-align:center;margin:32px 0 24px;">
      <a href="${link}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#c8a1ff 0%,#a855f7 100%);color:#0a0a0c;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px;">
        Complete Onboarding
      </a>
    </div>

    <!-- Fine print -->
    <p style="margin:0;font-size:12px;line-height:1.5;color:#444444;text-align:center;">
      This invite is linked to your wallet and can only be used once.
    </p>

  </div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:28px 0;text-align:center;">
  <p style="margin:0 0 8px;font-size:12px;color:#444444;">
    <a href="https://luxhub.gold" style="color:#666666;text-decoration:none;">luxhub.gold</a>
    &nbsp;&middot;&nbsp;
    <a href="https://x.com/LuxHubStudio" style="color:#666666;text-decoration:none;">@LuxHubStudio</a>
  </p>
  <p style="margin:0;font-size:11px;color:#333333;">
    The Luxury Protocol on Solana
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body></html>`,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[admin/invites] Resend API error:', errorText);
      return { sent: false, error: errorText };
    }

    return { sent: true };
  } catch (err: any) {
    console.error('[admin/invites] Email send exception:', err);
    return { sent: false, error: err.message || 'Email send failed' };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const adminWallet = req.headers['x-wallet-address'] as string;
  if (!adminWallet || !isAdmin(adminWallet)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  await dbConnect();

  if (req.method === 'GET') {
    const invites = await InviteCodeModel.find().sort({ _id: -1 }).limit(50).lean();
    return res.status(200).json({ invites });
  }

  if (req.method === 'POST') {
    const { vendorWallet, vendorName, vendorEmail, interestId } = req.body;

    if (!vendorWallet) {
      return res.status(400).json({ error: 'Vendor wallet address is required' });
    }

    // Check for existing unused invite for this wallet
    const existing = await InviteCodeModel.findOne({ vendorWallet, used: false });

    if (existing) {
      const link = `${APP_URL}/vendor/onboard?invite=${existing.code}`;
      let emailResult = { sent: false, error: undefined as string | undefined };

      if (vendorEmail) {
        emailResult = await sendInviteEmail(vendorEmail, vendorName, link);
      }

      return res.status(200).json({
        code: existing.code,
        existing: true,
        emailSent: emailResult.sent,
        emailError: emailResult.error || null,
        message: 'Invite already exists for this wallet',
      });
    }

    const code = uuidv4();
    const link = `${APP_URL}/vendor/onboard?invite=${code}`;

    await InviteCodeModel.create({
      code,
      vendorWallet,
      vendorName: vendorName || null,
      createdBy: adminWallet,
      used: false,
      expiresAt: null,
    });

    // Update interest status if interestId provided
    if (interestId) {
      try {
        await VendorInterest.findByIdAndUpdate(interestId, {
          status: 'invited',
          reviewedBy: adminWallet,
          reviewedAt: new Date(),
        });
      } catch {
        // non-blocking
      }
    }

    // Send email notification
    let emailResult = { sent: false, error: undefined as string | undefined };
    if (vendorEmail) {
      emailResult = await sendInviteEmail(vendorEmail, vendorName, link);
    }

    // Send in-app notification to vendor
    try {
      await notifyUser({
        userWallet: vendorWallet,
        type: 'vendor_invite_sent',
        title: 'Complete Your Vendor Onboarding',
        message: `You've been invited to become a LuxHub vendor! Click here to set up your profile and start listing.`,
        metadata: {
          actionUrl: link,
        },
        sendEmail: false,
      });
    } catch (notifErr) {
      console.error('[admin/invites] In-app notification error (non-blocking):', notifErr);
    }

    return res.status(200).json({
      code,
      existing: false,
      emailSent: emailResult.sent,
      emailError: emailResult.error || null,
    });
  }

  if (req.method === 'DELETE') {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    const invite = await InviteCodeModel.findOne({ code });
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found' });
    }
    if (invite.used) {
      return res.status(400).json({ error: 'Cannot delete an invite that has already been used' });
    }

    await InviteCodeModel.deleteOne({ code });
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
