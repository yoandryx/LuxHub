// src/pages/api/vendor/delist-request.ts
// Vendor submits a request to delist/remove an NFT from marketplace
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import { Asset } from '../../../lib/models/Assets';
import { Vendor } from '../../../lib/models/Vendor';
import DelistRequest from '../../../lib/models/DelistRequest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: Fetch vendor's delist requests
  if (req.method === 'GET') {
    const wallet = req.query.wallet as string;
    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet' });
    }

    try {
      const vendor = await Vendor.findOne({ wallet });
      if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      const requests = await DelistRequest.find({ vendor: vendor._id })
        .populate('asset', 'model nftMint priceUSD images status')
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({ requests });
    } catch (error) {
      console.error('[delist-request] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }

  // POST: Submit new delist request
  if (req.method === 'POST') {
    const {
      wallet,
      assetId,
      mintAddress,
      reason,
      reasonDetails,
      requestedAction = 'delist',
    } = req.body;

    if (!wallet || (!assetId && !mintAddress)) {
      return res
        .status(400)
        .json({ error: 'Missing required fields: wallet, assetId or mintAddress' });
    }

    if (!reason || !reasonDetails) {
      return res.status(400).json({ error: 'Missing reason and reasonDetails' });
    }

    const validReasons = ['sold_externally', 'damaged', 'lost', 'stolen', 'returned', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason', validReasons });
    }

    try {
      // Find vendor
      const vendor = await Vendor.findOne({ wallet });
      if (!vendor) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      // Find asset
      const assetQuery = assetId ? { _id: assetId } : { nftMint: mintAddress };
      const asset = await Asset.findOne(assetQuery);
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      // Verify vendor owns this asset
      const isOwner =
        asset.vendor?.toString() === vendor._id.toString() || asset.nftOwnerWallet === wallet;

      if (!isOwner) {
        return res.status(403).json({ error: 'You do not own this asset' });
      }

      // Check if asset can be delisted (must be listed or pending)
      const delistableStatuses = ['listed', 'pending', 'reviewed'];
      if (!delistableStatuses.includes(asset.status)) {
        return res.status(400).json({
          error: `Cannot delist asset with status "${asset.status}"`,
          hint: 'Only listed, pending, or reviewed assets can be delisted',
        });
      }

      // Check for existing pending request
      const existingRequest = await DelistRequest.findOne({
        asset: asset._id,
        status: 'pending',
      });

      if (existingRequest) {
        return res.status(400).json({
          error: 'A pending delist request already exists for this asset',
          requestId: existingRequest._id,
        });
      }

      // Create delist request
      const delistRequest = await DelistRequest.create({
        asset: asset._id,
        mintAddress: asset.nftMint,
        vendor: vendor._id,
        vendorWallet: wallet,
        reason,
        reasonDetails,
        requestedAction,
      });

      return res.status(201).json({
        success: true,
        message: 'Delist request submitted successfully',
        request: {
          _id: delistRequest._id,
          status: delistRequest.status,
          reason: delistRequest.reason,
          createdAt: delistRequest.createdAt,
        },
      });
    } catch (error) {
      console.error('[delist-request] POST error:', error);
      return res.status(500).json({ error: 'Failed to submit request' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
