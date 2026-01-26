// /pages/api/admin/mint-requests/index.ts
// Get all mint requests for admin review
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { verifyToken } from '../../../../lib/auth/token';
import { JwtPayload } from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin authorization
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authorization.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded || (decoded as JwtPayload).role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized - Admin access required' });
  }

  try {
    await dbConnect();

    // Query parameters for filtering
    const { status, limit = 50, offset = 0 } = req.query;

    const query: Record<string, unknown> = {};
    if (status && typeof status === 'string') {
      query.status = status;
    }

    const mintRequests = await MintRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .select('-imageBase64'); // Exclude large base64 data from list view

    const total = await MintRequest.countDocuments(query);

    return res.status(200).json({
      requests: mintRequests,
      total,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Error fetching mint requests:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
