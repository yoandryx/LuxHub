// src/pages/api/vendor/mint-request.ts
// Vendors submit mint requests here - admins approve/reject later
import type { NextApiRequest, NextApiResponse } from 'next';
import dbConnect from '../../../lib/database/mongodb';
import MintRequest from '../../../lib/models/MintRequest';
import { Vendor } from '../../../lib/models/Vendor';
import VendorProfile from '../../../lib/models/VendorProfile';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // For base64 images
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  // GET: Fetch vendor's own mint requests
  if (req.method === 'GET') {
    const wallet = req.query.wallet as string;
    if (!wallet) {
      return res.status(400).json({ error: 'Missing wallet' });
    }

    try {
      const requests = await MintRequest.find({ wallet })
        .sort({ createdAt: -1 })
        .select('-imageBase64') // Exclude large base64 data
        .lean();

      // Get counts by status
      const stats = {
        total: requests.length,
        pending: requests.filter((r) => r.status === 'pending').length,
        approved: requests.filter((r) => r.status === 'approved').length,
        minted: requests.filter((r) => r.status === 'minted').length,
        rejected: requests.filter((r) => r.status === 'rejected').length,
      };

      return res.status(200).json({ requests, stats });
    } catch (error) {
      console.error('[vendor/mint-request] GET error:', error);
      return res.status(500).json({ error: 'Failed to fetch requests' });
    }
  }

  // POST: Submit new mint request
  if (req.method === 'POST') {
    const {
      wallet,
      title,
      brand,
      model,
      referenceNumber,
      serialNumber, // Legacy support
      description,
      priceUSD,
      imageBase64, // Primary image as base64
      imageUrl, // Alternative: direct URL
      // Optional attributes
      material,
      productionYear,
      movement,
      caseSize,
      waterResistance,
      dialColor,
      country,
      condition,
      boxPapers,
      limitedEdition,
      certificate,
      warrantyInfo,
      provenance,
      features,
      releaseDate,
    } = req.body;

    // Validation
    if (!wallet) {
      return res.status(400).json({ error: 'Wallet address required' });
    }

    if (!brand || !model) {
      return res.status(400).json({ error: 'Brand and model are required' });
    }

    if (!referenceNumber && !serialNumber) {
      return res.status(400).json({ error: 'Reference/serial number is required' });
    }

    if (!priceUSD || priceUSD <= 0) {
      return res.status(400).json({ error: 'Valid price in USD is required' });
    }

    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ error: 'Image is required (base64 or URL)' });
    }

    try {
      // Verify vendor exists and is approved
      const vendorProfile = await VendorProfile.findOne({ wallet });
      if (!vendorProfile) {
        return res.status(404).json({ error: 'Vendor profile not found' });
      }

      if (!vendorProfile.approved) {
        return res.status(403).json({ error: 'Vendor must be approved to submit mint requests' });
      }

      // Check for duplicate reference number
      const existingRequest = await MintRequest.findOne({
        referenceNumber: referenceNumber || serialNumber,
        status: { $ne: 'rejected' }, // Allow resubmission if previously rejected
      });

      if (existingRequest) {
        return res.status(400).json({
          error: 'A mint request with this reference number already exists',
          existingStatus: existingRequest.status,
        });
      }

      // Log received attributes for debugging
      console.log('📋 Received mint request data:', {
        brand,
        model,
        referenceNumber,
        priceUSD,
        material,
        productionYear,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        condition,
        boxPapers,
        limitedEdition,
        country,
        certificate,
        warrantyInfo,
        provenance,
        features,
        releaseDate,
        hasImageBase64: !!imageBase64,
        hasImageUrl: !!imageUrl,
        imageBase64Preview: imageBase64?.substring(0, 100),
        imageUrlPreview: imageUrl?.substring(0, 100),
      });

      // Determine if imageBase64 is actually a URL
      let finalImageBase64 = imageBase64;
      let finalImageUrl = imageUrl;

      if (imageBase64 && !imageBase64.startsWith('data:')) {
        // It's a URL, not base64 - store in imageUrl instead
        if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
          console.log('🔄 Image is URL (not base64), moving to imageUrl field:', imageBase64);
          finalImageUrl = imageBase64;
          finalImageBase64 = ''; // Don't store URL in base64 field
        }
      }

      console.log('💾 Final values to save:', {
        finalImageBase64: finalImageBase64 ? `${finalImageBase64.substring(0, 50)}...` : '(empty)',
        finalImageUrl: finalImageUrl || '(empty)',
      });

      // Create the mint request
      const mintRequest = await MintRequest.create({
        wallet,
        title: title || `${brand} ${model}`,
        brand,
        model,
        referenceNumber: referenceNumber || serialNumber,
        description,
        priceUSD,
        imageBase64: finalImageBase64,
        imageUrl: finalImageUrl,
        timestamp: Date.now(),
        // Optional attributes
        material,
        productionYear,
        movement,
        caseSize,
        waterResistance,
        dialColor,
        country,
        condition,
        boxPapers,
        limitedEdition,
        certificate,
        warrantyInfo,
        provenance,
        features,
        releaseDate,
        status: 'pending',
      });

      return res.status(201).json({
        success: true,
        message: 'Mint request submitted successfully',
        request: {
          _id: mintRequest._id,
          title: mintRequest.title,
          brand: mintRequest.brand,
          model: mintRequest.model,
          referenceNumber: mintRequest.referenceNumber,
          priceUSD: mintRequest.priceUSD,
          status: mintRequest.status,
          createdAt: mintRequest.createdAt,
        },
      });
    } catch (error) {
      console.error('[vendor/mint-request] POST error:', error);
      return res.status(500).json({ error: 'Failed to submit mint request' });
    }
  }

  // DELETE: Cancel a pending mint request
  if (req.method === 'DELETE') {
    const { requestId, wallet } = req.body;

    if (!requestId || !wallet) {
      return res.status(400).json({ error: 'Request ID and wallet required' });
    }

    try {
      const request = await MintRequest.findById(requestId);

      if (!request) {
        return res.status(404).json({ error: 'Mint request not found' });
      }

      if (request.wallet !== wallet) {
        return res.status(403).json({ error: 'Not authorized to delete this request' });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({
          error: `Cannot delete request with status "${request.status}"`,
        });
      }

      await MintRequest.deleteOne({ _id: requestId });

      return res.status(200).json({
        success: true,
        message: 'Mint request cancelled',
      });
    } catch (error) {
      console.error('[vendor/mint-request] DELETE error:', error);
      return res.status(500).json({ error: 'Failed to cancel request' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
