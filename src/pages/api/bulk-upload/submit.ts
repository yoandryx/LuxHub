// src/pages/api/bulk-upload/submit.ts
// Vendor batch submission — creates grouped MintRequests with shared batchId
import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import connectDB from '@/lib/database/mongodb';
import MintRequest from '@/lib/models/MintRequest';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { items, batchName, wallet } = req.body;

  if (!wallet || typeof wallet !== 'string' || wallet.trim() === '') {
    return res.status(400).json({ success: false, error: 'wallet is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items is required and must be a non-empty array' });
  }

  if (items.length > 25) {
    return res.status(400).json({ success: false, error: 'Maximum 25 items per batch' });
  }

  try {
    await connectDB();

    const batchId = new mongoose.Types.ObjectId().toString();
    const now = Date.now();

    const docs = items.map((item: any) => ({
      ...item,
      batchId,
      batchName: batchName || `Batch ${new Date().toISOString().slice(0, 10)}`,
      wallet: wallet.trim(),
      requestSource: 'vendor',
      status: 'pending',
      timestamp: now,
    }));

    const created = await MintRequest.insertMany(docs, { ordered: false });

    return res.status(200).json({
      success: true,
      batchId,
      count: items.length,
      created: created.length,
    });
  } catch (error: any) {
    console.error('Batch submit error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit batch',
    });
  }
}
