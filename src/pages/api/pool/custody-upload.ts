// src/pages/api/pool/custody-upload.ts
// Upload custody verification photos to Pinata/IPFS and attach to pool
import type { NextApiRequest, NextApiResponse } from 'next';

const formidable = require('formidable');
import { readFileSync } from 'fs';
import dbConnect from '../../../lib/database/mongodb';
import { Pool } from '../../../lib/models/Pool';
import { getAdminConfig } from '../../../lib/config/adminConfig';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({ maxFiles: 10, maxFileSize: 10 * 1024 * 1024 }); // 10MB per file
    const [fields, files] = await form.parse(req);

    const poolId = fields.poolId?.[0];
    const adminWallet = fields.adminWallet?.[0];

    if (!poolId || !adminWallet) {
      return res.status(400).json({ error: 'Missing required fields: poolId, adminWallet' });
    }

    await dbConnect();

    // Verify admin
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool || pool.deleted) {
      return res.status(404).json({ error: 'Pool not found' });
    }

    // Upload each file to Pinata
    const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
    const pinataSecret = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;
    if (!pinataApiKey || !pinataSecret) {
      return res.status(500).json({ error: 'Pinata credentials not configured' });
    }

    const uploadedFiles = files.photos || files.file || [];
    const fileArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];

    if (fileArray.length === 0) {
      return res
        .status(400)
        .json({ error: 'No files uploaded. Use field name "photos" or "file".' });
    }

    const uploadedUrls: string[] = [];

    for (const file of fileArray) {
      const fileData = readFileSync(file.filepath);
      const blob = new Blob([new Uint8Array(fileData)], { type: file.mimetype || 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', blob, file.originalFilename || 'custody-photo.jpg');
      formData.append(
        'pinataMetadata',
        JSON.stringify({
          name: `custody-${poolId}-${Date.now()}`,
          keyvalues: { poolId, type: 'custody_proof', uploadedBy: adminWallet },
        })
      );

      const pinataResponse = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          pinata_api_key: pinataApiKey,
          pinata_secret_api_key: pinataSecret,
        },
        body: formData,
      });

      if (!pinataResponse.ok) {
        console.error('[custody-upload] Pinata upload failed for file:', file.originalFilename);
        continue;
      }

      const pinataResult = await pinataResponse.json();
      const gateway = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs';
      uploadedUrls.push(`${gateway}/${pinataResult.IpfsHash}`);
    }

    if (uploadedUrls.length === 0) {
      return res.status(500).json({ error: 'All file uploads failed' });
    }

    // Append URLs to pool custody proof
    const existingUrls = pool.custodyProofUrls || [];
    const allUrls = [...existingUrls, ...uploadedUrls];

    await Pool.findByIdAndUpdate(poolId, {
      $set: { custodyProofUrls: allUrls },
    });

    return res.status(200).json({
      success: true,
      uploaded: uploadedUrls.length,
      totalProofPhotos: allUrls.length,
      urls: uploadedUrls,
      allCustodyProofUrls: allUrls,
      message: `${uploadedUrls.length} custody photo(s) uploaded to IPFS.`,
      nextSteps: [
        'Photos attached to pool custody record',
        'Admin can now verify custody via POST /api/pool/custody with action: "verify"',
      ],
    });
  } catch (error: any) {
    console.error('[/api/pool/custody-upload] Error:', error);
    return res.status(500).json({
      error: 'Failed to upload custody photos',
      details: error?.message || 'Unknown error',
    });
  }
}
