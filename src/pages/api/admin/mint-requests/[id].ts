// /pages/api/admin/mint-requests/[id].ts
// Get single mint request details or update status
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { verifyToken } from '../../../../lib/auth/token';
import { JwtPayload } from 'jsonwebtoken';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid request ID' });
  }

  try {
    await dbConnect();

    if (req.method === 'GET') {
      // Get single mint request with full details (including image)
      const mintRequest = await MintRequest.findById(id);

      if (!mintRequest) {
        return res.status(404).json({ error: 'Mint request not found' });
      }

      return res.status(200).json(mintRequest);
    }

    if (req.method === 'PATCH') {
      // Update mint request status
      const { status, adminNotes, mintAddress } = req.body;

      if (!status || !['pending', 'approved', 'rejected', 'minted'].includes(status)) {
        return res
          .status(400)
          .json({ error: 'Invalid status. Must be: pending, approved, rejected, or minted' });
      }

      const updateData: Record<string, unknown> = {
        status,
        reviewedBy: (decoded as JwtPayload).wallet || (decoded as JwtPayload).email || 'admin',
        reviewedAt: new Date(),
      };

      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      if (mintAddress && status === 'minted') {
        updateData.mintAddress = mintAddress;
      }

      const updatedRequest = await MintRequest.findByIdAndUpdate(id, updateData, { new: true });

      if (!updatedRequest) {
        return res.status(404).json({ error: 'Mint request not found' });
      }

      return res.status(200).json({
        message: `Mint request ${status}`,
        request: updatedRequest,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error processing mint request:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
