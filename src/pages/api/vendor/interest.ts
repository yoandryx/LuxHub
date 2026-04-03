// src/pages/api/vendor/interest.ts
// Save vendor interest submissions from /vendor/apply
// Notifies admins in-app + notifies vendor with confirmation
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorInterest from '../../../lib/models/VendorInterest';
import { notifyUser, notifyNewVendorApplication } from '../../../lib/services/notificationService';
import { z } from 'zod';
import { apiLimiter } from '../../../lib/middleware/rateLimit';

const interestSchema = z.object({
  wallet: z.string().nullable().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  message: z.string().min(1, 'Message is required').max(2000),
  contact: z.string().max(200).nullable().optional(),
  website: z.string().max(500).nullable().optional(),
  inventorySize: z.string().max(20).nullable().optional(),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = interestSchema.parse(req.body);

    await dbConnect();

    // Prevent spam: check for recent submission from same wallet or email
    if (parsed.wallet) {
      const recentSubmission = await VendorInterest.findOne({
        wallet: parsed.wallet,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (recentSubmission) {
        return res.status(200).json({
          success: true,
          message: 'Interest already submitted. We will be in touch!',
        });
      }
    }

    if (parsed.email) {
      const recentByEmail = await VendorInterest.findOne({
        email: parsed.email.toLowerCase(),
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      if (recentByEmail) {
        return res.status(200).json({
          success: true,
          message: 'Interest already submitted. We will be in touch!',
        });
      }
    }

    await VendorInterest.create({
      wallet: parsed.wallet || null,
      name: parsed.name.trim(),
      category: parsed.category || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      message: parsed.message.trim(),
      contact: parsed.contact?.trim() || null,
      website: parsed.website?.trim() || null,
      inventorySize: parsed.inventorySize || null,
    });

    // Notify admins about new application
    try {
      if (parsed.wallet) {
        await notifyNewVendorApplication({
          vendorName: parsed.name.trim(),
          vendorWallet: parsed.wallet,
          vendorUsername: parsed.name.trim().toLowerCase().replace(/\s+/g, ''),
          primaryCategory: parsed.category || undefined,
        });
      }
    } catch (notifErr) {
      console.error('[vendor/interest] Admin notification error (non-blocking):', notifErr);
    }

    // Notify the vendor their application was received
    try {
      if (parsed.wallet) {
        await notifyUser({
          userWallet: parsed.wallet,
          type: 'vendor_application_submitted',
          title: 'Application Received',
          message:
            "Thanks for applying to sell on LuxHub! We're reviewing your application and will send you an invite to complete onboarding once approved.",
          sendEmail: false,
        });
      }
    } catch (notifErr) {
      console.error('[vendor/interest] Vendor notification error (non-blocking):', notifErr);
    }

    return res.status(200).json({
      success: true,
      message: 'Interest submitted successfully!',
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: err.errors });
    }
    console.error('[vendor/interest] Error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

export default apiLimiter(handler);
