// /pages/api/admin/mint-requests/index.ts
// Get all mint requests for admin review
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../../lib/database/mongodb';
import MintRequest from '../../../../lib/models/MintRequest';
import { getAdminConfig } from '../../../../lib/config/adminConfig';
import AdminRole from '../../../../lib/models/AdminRole';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await dbConnect();

  // Wallet-based admin authorization
  const requestingWallet =
    (req.headers['x-wallet-address'] as string) || (req.query.wallet as string);

  if (!requestingWallet) {
    return res.status(401).json({ error: 'Wallet address required in x-wallet-address header' });
  }

  const adminConfig = getAdminConfig();
  const isEnvAdmin = adminConfig.isAdmin(requestingWallet);
  const dbAdmin = await AdminRole.findOne({ wallet: requestingWallet, isActive: true });

  // Check if has permission to view mint requests
  const canView =
    isEnvAdmin || dbAdmin?.permissions?.canApproveMints || dbAdmin?.role === 'super_admin';

  if (!canView) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // Query parameters for filtering
    const { status, limit = 50, offset = 0, batchId, groupBy } = req.query;

    const query: Record<string, unknown> = {};
    if (status && typeof status === 'string') {
      query.status = status;
    }
    if (batchId && typeof batchId === 'string') {
      query.batchId = batchId;
    }

    // Grouped batch mode
    if (groupBy === 'batch') {
      const allRequests = await MintRequest.find(query)
        .sort({ createdAt: -1 })
        .select('-imageBase64')
        .lean();

      const addImageUrl = (r: any) => ({
        ...r,
        imageUrl:
          r.imageUrl || `/api/vendor/mint-request-image?id=${r._id}&wallet=${requestingWallet}`,
      });

      // Separate batched and ungrouped items
      const batchMap = new Map<string, any[]>();
      const ungrouped: any[] = [];

      for (const r of allRequests as any[]) {
        if (r.batchId) {
          if (!batchMap.has(r.batchId)) {
            batchMap.set(r.batchId, []);
          }
          batchMap.get(r.batchId)!.push(addImageUrl(r));
        } else {
          ungrouped.push(addImageUrl(r));
        }
      }

      // Build batch summaries
      const batches = Array.from(batchMap.entries()).map(([bId, items]) => {
        const statuses = { pending: 0, approved: 0, rejected: 0, minted: 0 };
        for (const item of items) {
          if (item.status in statuses) {
            statuses[item.status as keyof typeof statuses]++;
          }
        }
        return {
          batchId: bId,
          batchName: items[0]?.batchName || bId,
          count: items.length,
          statuses,
          items,
        };
      });

      // Sort batches by most recent item first
      batches.sort((a, b) => {
        const aTime = new Date(a.items[0]?.createdAt || 0).getTime();
        const bTime = new Date(b.items[0]?.createdAt || 0).getTime();
        return bTime - aTime;
      });

      return res.status(200).json({ batches, ungrouped });
    }

    // Standard list mode
    const rawRequests = await MintRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .select('-imageBase64') // Exclude large base64 data from list view
      .lean();

    // Add imageUrl for requests that only have base64 images stored
    const mintRequests = (rawRequests as any[]).map((r) => ({
      ...r,
      imageUrl:
        r.imageUrl || `/api/vendor/mint-request-image?id=${r._id}&wallet=${requestingWallet}`,
    }));

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
