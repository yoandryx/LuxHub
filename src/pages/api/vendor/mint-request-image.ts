// src/pages/api/vendor/mint-request-image.ts
// Serves the stored base64 image for a mint request as a binary response
// Requires wallet ownership (vendor) or admin authorization
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import MintRequest from '../../../lib/models/MintRequest';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import AdminRole from '../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, wallet } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing request ID' });
  }

  if (!wallet || typeof wallet !== 'string') {
    return res.status(401).json({ error: 'Wallet address required' });
  }

  try {
    await dbConnect();

    const request = (await MintRequest.findById(id)
      .select('imageBase64 imageUrl wallet')
      .lean()) as { imageBase64?: string; imageUrl?: string; wallet: string } | null;
    if (!request) {
      return res.status(404).json({ error: 'Mint request not found' });
    }

    // Authorization: must be the vendor who owns this request, or an admin
    const isOwner = request.wallet === wallet;
    if (!isOwner) {
      const adminConfig = getAdminConfig();
      const isEnvAdmin = adminConfig.isAdmin(wallet);
      const dbAdmin = await AdminRole.findOne({ wallet, isActive: true });
      const isAdmin =
        isEnvAdmin || dbAdmin?.permissions?.canApproveMints || dbAdmin?.role === 'super_admin';

      if (!isAdmin) {
        return res.status(403).json({ error: 'Not authorized to view this image' });
      }
    }

    // If there's a URL, redirect to it
    if (request.imageUrl) {
      return res.redirect(302, request.imageUrl);
    }

    // Serve base64 image as binary
    if (request.imageBase64) {
      // Parse data URI: "data:image/png;base64,iVBOR..."
      const match = request.imageBase64.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const contentType = match[1];
        const buffer = Buffer.from(match[2], 'base64');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.status(200).send(buffer);
      }

      // Raw base64 without data URI prefix — assume JPEG
      const buffer = Buffer.from(request.imageBase64, 'base64');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.status(200).send(buffer);
    }

    return res.status(404).json({ error: 'No image available' });
  } catch (error) {
    console.error('[mint-request-image] Error:', error);
    return res.status(500).json({ error: 'Failed to serve image' });
  }
}
