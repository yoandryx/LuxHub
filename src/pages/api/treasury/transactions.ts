// src/pages/api/treasury/transactions.ts
// API endpoint to fetch transaction history for admin dashboard (admin only)
import type { NextApiRequest, NextApiResponse } from 'next';
import { JwtPayload } from 'jsonwebtoken';
import dbConnect from '../../../lib/database/mongodb';
import { Transaction } from '../../../lib/models/Transaction';
import { verifyToken } from '../../../lib/auth/token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin authentication check
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authorization.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded || (decoded as JwtPayload).role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized - Admin access required' });
  }

  const { type, status, limit = '50', page = '1', startDate, endDate } = req.query;

  try {
    await dbConnect();

    // Build query
    const query: Record<string, any> = {};

    if (type && type !== 'all') {
      query.type = type;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate as string);
      }
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Fetch transactions
    const [transactions, totalCount] = await Promise.all([
      Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Transaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    return res.status(200).json({
      transactions,
      page: pageNum,
      totalPages,
      totalCount,
    });
  } catch (error: any) {
    console.error('[treasury/transactions] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      transactions: [],
      page: 1,
      totalPages: 0,
      totalCount: 0,
    });
  }
}
