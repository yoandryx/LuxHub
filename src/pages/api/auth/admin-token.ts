import { NextApiRequest, NextApiResponse } from 'next';
import { generateAdminToken } from '../../../lib/auth/token';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.body?.wallet || req.headers['x-admin-wallet'];

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing wallet address' });
  }

  // Verify the wallet is an authorized admin
  const adminConfig = getAdminConfig();
  if (!adminConfig.isAdmin(wallet)) {
    return res.status(403).json({ error: 'Unauthorized: wallet is not an admin' });
  }

  const token = generateAdminToken();
  res.status(200).json({ token });
}
