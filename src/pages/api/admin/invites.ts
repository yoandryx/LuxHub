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
        subject: `You've been selected — LuxHub Vendor Invitation`,
        html: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>LuxHub Vendor Invitation</title>
<!--[if mso]><style>body,table,td{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
<style>
  :root{color-scheme:dark only;}
  body,html{background-color:#050507!important;margin:0;padding:0;}
  u+.body{background-color:#050507!important;}
  [data-ogsc] body{background-color:#050507!important;}
  @media(prefers-color-scheme:light){
    body,html,.body-bg,.card-bg{background-color:#050507!important;}
    .body-text{color:#e0e0e0!important;}
    .heading-text{color:#ffffff!important;}
    .muted-text{color:#888888!important;}
    .dim-text{color:#555555!important;}
    .accent-text{color:#c8a1ff!important;}
  }
  @media(prefers-color-scheme:dark){
    body,html,.body-bg,.card-bg{background-color:#050507!important;}
    .body-text{color:#e0e0e0!important;}
    .heading-text{color:#ffffff!important;}
    .muted-text{color:#888888!important;}
    .dim-text{color:#555555!important;}
    .accent-text{color:#c8a1ff!important;}
  }
</style>
</head>
<body class="body-bg" style="margin:0;padding:0;background-color:#050507;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Force dark bg for Gmail -->
<div style="display:none;font-size:0;color:#050507;line-height:0;max-height:0;overflow:hidden;">
  You've been selected to join LuxHub as a verified vendor. Begin onboarding now. &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="body-bg" style="background-color:#050507;min-height:100%;">
<tr><td align="center" valign="top" style="padding:48px 16px 40px;background-color:#050507;">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">

<!-- Logo -->
<tr><td align="center" style="padding-bottom:44px;">
  <img src="${APP_URL}/images/purpleLGG.png" alt="LuxHub" width="44" height="44" style="display:block;border:0;" />
</td></tr>

<!-- Main Card -->
<tr><td class="card-bg" style="background-color:#0a0a0c;border:1px solid #1a1a1f;border-radius:16px;overflow:hidden;">

  <!-- Top accent line -->
  <div style="height:2px;background:linear-gradient(90deg,transparent 5%,#c8a1ff 30%,#a855f7 50%,#c8a1ff 70%,transparent 95%);"></div>

  <div style="padding:48px 44px 40px;">

    <!-- Greeting -->
    <p class="heading-text" style="margin:0 0 24px;font-size:18px;font-weight:600;line-height:1.5;color:#ffffff;">
      ${name || 'Hello'},
    </p>

    <!-- Copy -->
    <p class="body-text" style="margin:0 0 14px;font-size:15px;line-height:1.75;color:#e0e0e0;">
      Welcome to <strong style="color:#c8a1ff;">LuxHub</strong>. You've been selected to join as a verified vendor.
    </p>

    <p class="body-text" style="margin:0 0 32px;font-size:14px;line-height:1.75;color:#999999;">
      Bring your collection on-chain and reach collectors worldwide. You're among the first vendors to list on the first real-world luxury asset marketplace built on blockchain. Program-level escrow, multi-signature verification, and automated settlement &#8212; all handled for you.
    </p>

    <!-- CTA -->
    <div style="text-align:center;margin:0 0 36px;">
      <a href="${link}" class="accent-text" style="display:inline-block;min-width:220px;padding:16px 48px;background-color:#0a0a0c;background:linear-gradient(135deg,rgba(200,161,255,0.12),rgba(168,85,247,0.08));border:1px solid #c8a1ff50;color:#c8a1ff;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.8px;text-transform:uppercase;">
        Begin Onboarding
      </a>
    </div>

    <!-- Fine print -->
    <p class="dim-text" style="margin:12px 0 0;font-size:11px;line-height:1.6;color:#555555;text-align:center;">
      This invitation is exclusive and may only be used once.
    </p>

  </div>
</td></tr>

<!-- Footer -->
<tr><td style="padding:36px 16px 0;text-align:center;">
  <p class="dim-text" style="margin:0 0 12px;font-size:11px;color:#555555;letter-spacing:0.5px;">
    <a href="https://luxhub.gold" style="color:#777777;text-decoration:none;font-weight:500;">luxhub.gold</a>
    &nbsp;&nbsp;&#183;&nbsp;&nbsp;
    <a href="https://x.com/LuxHubStudio" style="color:#777777;text-decoration:none;font-weight:500;">@LuxHubStudio</a>
  </p>
</td></tr>

<!-- Legal -->
<tr><td style="padding:8px 24px 0;text-align:center;">
  <p class="dim-text" style="margin:0;font-size:9px;line-height:1.7;color:#333333;">
    LuxHub is a technology platform that facilitates peer-to-peer transactions of physical assets using blockchain infrastructure. LuxHub does not take custody of funds or assets. All transactions are executed via on-chain escrow smart contracts on the Solana blockchain. Digital representations of assets (NFTs) serve as certificates of authenticity and do not constitute securities, financial instruments, or investment contracts. Vendors are independent sellers and not employees or agents of LuxHub. Platform fees are disclosed in the vendor agreement. By proceeding, you agree to our <a href="${APP_URL}/terms" style="color:#444444;text-decoration:underline;">Terms&nbsp;of&nbsp;Service</a>.
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
      let emailResult: { sent: boolean; error?: string } = { sent: false };

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
      vendorEmail: vendorEmail || null,
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
    let emailResult: { sent: boolean; error?: string } = { sent: false };
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
