// src/pages/api/vendor/validate-invite.ts
// Public endpoint: check if an invite code is valid (no auth needed — just validation)
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import InviteCodeModel from '../../../lib/models/InviteCode';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'No invite code provided' });
  }

  await dbConnect();

  const invite = await InviteCodeModel.findOne({ code });

  if (!invite) {
    return res.status(200).json({ valid: false, error: 'Invalid invite code' });
  }

  if (invite.used) {
    return res.status(200).json({ valid: false, error: 'This invite code has already been used' });
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return res.status(200).json({ valid: false, error: 'This invite code has expired' });
  }

  return res.status(200).json({
    valid: true,
    vendorWallet: invite.vendorWallet || null,
  });
}
