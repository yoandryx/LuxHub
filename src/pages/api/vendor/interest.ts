// src/pages/api/vendor/interest.ts
// Save vendor interest submissions from /vendor/apply
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import VendorInterest from '../../../lib/models/VendorInterest';
import { z } from 'zod';
import { apiLimiter } from '../../../lib/middleware/rateLimit';

const interestSchema = z.object({
  wallet: z.string().nullable().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  category: z.string().nullable().optional(),
  message: z.string().min(1, 'Message is required').max(2000),
  contact: z.string().max(200).nullable().optional(),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = interestSchema.parse(req.body);

    await dbConnect();

    // Prevent spam: check for recent submission from same wallet
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

    await VendorInterest.create({
      wallet: parsed.wallet || null,
      name: parsed.name.trim(),
      category: parsed.category || null,
      message: parsed.message.trim(),
      contact: parsed.contact?.trim() || null,
    });

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
