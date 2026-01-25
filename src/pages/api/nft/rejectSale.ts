// src/pages/api/nft/rejectSale.ts
// API endpoint to reject a pending sale request (admin only)
import type { NextApiRequest, NextApiResponse } from 'next';
import { JwtPayload } from 'jsonwebtoken';
import dbConnect from '../../../lib/database/mongodb';
import SaleRequest from '../../../lib/models/SaleRequest';
import { verifyToken } from '../../../lib/auth/token';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

  const { nftId, mintAddress } = req.body;
  const mint = nftId || mintAddress;

  if (!mint) {
    return res.status(400).json({ error: 'Missing nftId or mintAddress' });
  }

  try {
    await dbConnect();

    // Update the sale request status to rejected
    const result = await SaleRequest.findOneAndUpdate(
      { nftId: mint, marketStatus: 'pending' },
      {
        $set: {
          marketStatus: 'rejected',
          rejectedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: 'Pending sale request not found' });
    }

    console.log(`[rejectSale] Rejected sale request for NFT: ${mint}`);

    return res.status(200).json({
      success: true,
      message: 'Sale request rejected',
      nftId: mint,
    });
  } catch (error: any) {
    console.error('[rejectSale] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
