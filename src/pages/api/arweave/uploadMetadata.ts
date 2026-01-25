// src/pages/api/arweave/uploadMetadata.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadMetadata, getStorageConfig } from '@/utils/storage';
import { uploadLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { validateBody } from '@/lib/middleware/validate';
import { z } from 'zod';

// Request schema
const UploadMetadataSchema = z.object({
  metadata: z.record(z.unknown()),
  name: z.string().min(1, 'Name is required'),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  // Check storage configuration
  const config = getStorageConfig();
  if (!config.arweaveConfigured && !config.pinataConfigured) {
    return res.status(503).json({
      success: false,
      error: 'No storage provider configured',
    });
  }

  try {
    const { metadata, name } = req.body;

    // Upload to storage provider(s)
    const result = await uploadMetadata(metadata, name);

    return res.status(200).json({
      success: true,
      data: {
        arweaveTxId: result.arweaveTxId,
        ipfsHash: result.ipfsHash,
        uri: result.gateway,
        provider: result.provider,
      },
    });
  } catch (error: any) {
    console.error('[/api/arweave/uploadMetadata] Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Metadata upload failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

// Apply validation, rate limiting and error monitoring
export default validateBody(UploadMetadataSchema)(uploadLimiter(withErrorMonitoring(handler)));
