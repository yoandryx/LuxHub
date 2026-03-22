// src/pages/api/admin/invites.ts
// Admin-only: List all invites, or create a new one (optionally notify vendor via email)
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
    const existing = await InviteCodeModel.findOne({
      vendorWallet,
      used: false,
    });

    if (existing) {
      const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/vendor/onboard?invite=${existing.code}`;

      // Still send email if requested
      if (vendorEmail) {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'LuxHub <notifications@luxhub.gold>',
            to: vendorEmail,
            subject: 'Your LuxHub Vendor Invite',
            html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d0d;color:#fff;padding:32px;border-radius:12px;">
              <h2 style="color:#c8a1ff;margin:0 0 16px;">Welcome to LuxHub</h2>
              <p>Hi ${vendorName || 'there'},</p>
              <p>You've been invited to become a vendor on LuxHub. Click below to set up your profile:</p>
              <a href="${link}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:linear-gradient(135deg,#c8a1ff,#a855f7);color:#0a0a0c;border-radius:8px;text-decoration:none;font-weight:600;">Complete Onboarding</a>
              <p style="color:#888;font-size:13px;">This invite is linked to your wallet and can only be used once.</p>
            </div>`,
          });
        } catch (emailErr) {
          console.error('[admin/invites] Email send error (non-blocking):', emailErr);
        }
      }

      return res.status(200).json({
        code: existing.code,
        existing: true,
        emailSent: !!vendorEmail,
        message: 'Invite already exists for this wallet',
      });
    }

    const code = uuidv4();
    const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://luxhub.gold'}/vendor/onboard?invite=${code}`;

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

    // Send email notification if email provided
    if (vendorEmail) {
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'LuxHub <notifications@luxhub.gold>',
          to: vendorEmail,
          subject: 'Your LuxHub Vendor Invite',
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0d0d0d;color:#fff;padding:32px;border-radius:12px;">
            <h2 style="color:#c8a1ff;margin:0 0 16px;">Welcome to LuxHub</h2>
            <p>Hi ${vendorName || 'there'},</p>
            <p>You've been invited to become a vendor on LuxHub. Click below to set up your profile:</p>
            <a href="${link}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:linear-gradient(135deg,#c8a1ff,#a855f7);color:#0a0a0c;border-radius:8px;text-decoration:none;font-weight:600;">Complete Onboarding</a>
            <p style="color:#888;font-size:13px;">This invite is linked to your wallet and can only be used once.</p>
          </div>`,
        });
      } catch (emailErr) {
        console.error('[admin/invites] Email send error (non-blocking):', emailErr);
      }
    }

    return res.status(200).json({ code, existing: false, emailSent: !!vendorEmail });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
