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
        subject: `You're invited to LuxHub`,
        html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#000000;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#000000;">
<tr><td align="center" style="padding:48px 20px 32px;">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;width:100%;">

<!-- Logo -->
<tr><td align="center" style="padding-bottom:40px;">
  <img src="${APP_URL}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" />
</td></tr>

<!-- Card -->
<tr><td style="background:#0d0d0d;border:1px solid rgba(200,161,255,0.1);border-radius:16px;overflow:hidden;">
  <div style="height:1px;background:linear-gradient(90deg,transparent 10%,#c8a1ff 50%,transparent 90%);"></div>
  <div style="padding:44px 40px 36px;">

    <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#b0b0b0;">
      ${name || 'Hello'},
    </p>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#b0b0b0;">
      You've been selected to join LuxHub as a verified vendor.
    </p>

    <p style="margin:0 0 32px;font-size:15px;line-height:1.7;color:#b0b0b0;">
      List real-world luxury assets on-chain. Every transaction is secured by smart contract escrow with automated fund distribution.
    </p>

    <!-- CTA -->
    <div style="text-align:center;margin:0 0 32px;">
      <a href="${link}" style="display:inline-block;padding:14px 44px;background:rgba(200,161,255,0.12);border:1px solid rgba(200,161,255,0.3);color:#c8a1ff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.4px;">
        Begin Onboarding
      </a>
    </div>

    <p style="margin:0;font-size:11px;line-height:1.5;color:#444;text-align:center;">
      This link is tied to your wallet and can only be used once.
    </p>

  </div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:32px 16px 0;text-align:center;">
  <p style="margin:0 0 12px;font-size:11px;color:#444;">
    <a href="https://luxhub.gold" style="color:#555;text-decoration:none;">luxhub.gold</a>
    &nbsp;&middot;&nbsp;
    <a href="https://x.com/LuxHubStudio" style="color:#555;text-decoration:none;">@LuxHubStudio</a>
  </p>
</td></tr>

<!-- Legal -->
<tr><td style="padding:16px 24px 0;text-align:center;">
  <p style="margin:0;font-size:9px;line-height:1.6;color:#333;">
    LuxHub is a technology platform that facilitates peer-to-peer transactions of physical assets using blockchain infrastructure. LuxHub does not take custody of funds or assets. All transactions are executed via on-chain escrow smart contracts on the Solana blockchain. Digital representations of assets (NFTs) serve as certificates of authenticity and do not constitute securities, financial instruments, or investment contracts. Vendors are independent sellers and not employees or agents of LuxHub. Platform fees are disclosed in the vendor agreement. By proceeding, you agree to our <a href="${APP_URL}/terms" style="color:#444;text-decoration:underline;">Terms of Service</a>.
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
