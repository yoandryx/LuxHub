// src/pages/api/admin/invites.ts
// Admin-only: List all invites, create new ones (with email notification), or delete unused ones
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import InviteCodeModel from '../../../lib/models/InviteCode';
import VendorInterest from '../../../lib/models/VendorInterest';
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
  if (!process.env.RESEND_API_KEY) {
    return { sent: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your LuxHub Vendor Invite',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d0d;color:#fff;padding:32px;border-radius:12px;">
        <h2 style="color:#c8a1ff;margin:0 0 16px;">Welcome to LuxHub</h2>
        <p>Hi ${name || 'there'},</p>
        <p>You've been invited to become a vendor on LuxHub — the decentralized marketplace for luxury assets on Solana.</p>
        <p>Click below to set up your vendor profile and start listing:</p>
        <a href="${link}" style="display:inline-block;margin:24px 0;padding:14px 28px;background:linear-gradient(135deg,#c8a1ff,#a855f7);color:#0a0a0c;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">Complete Onboarding</a>
        <p style="color:#888;font-size:13px;">This invite is linked to your wallet and can only be used once. Make sure to connect the correct wallet when onboarding.</p>
        <hr style="border:none;border-top:1px solid #222;margin:24px 0;" />
        <p style="color:#666;font-size:12px;">Questions? Reply to this email or DM us on <a href="https://x.com/LuxHubStudio" style="color:#c8a1ff;">X @LuxHubStudio</a></p>
      </div>`,
    });

    if (result.error) {
      console.error('[admin/invites] Resend API error:', result.error);
      return { sent: false, error: result.error.message || 'Resend API error' };
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
