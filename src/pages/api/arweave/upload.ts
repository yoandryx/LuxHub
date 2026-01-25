// src/pages/api/arweave/upload.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import fs from 'fs';
import { uploadImage, uploadMetadata, getStorageConfig } from '@/utils/storage';
import { uploadLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';

// Configure multer to use /tmp folder with 10MB limit
const upload = multer({
  dest: '/tmp',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Disable body parsing for file upload
export const config = {
  api: {
    bodyParser: false,
  },
};

// Middleware wrapper for multer
function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: (req: NextApiRequest, res: NextApiResponse, callback: (result?: unknown) => void) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: unknown) => {
      if (result instanceof Error) return reject(result);
      return resolve();
    });
  });
}

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
    // Parse multipart form data
    await runMiddleware(req, res, upload.single('file') as any);

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // Read file into buffer
    const fileBuffer = fs.readFileSync(file.path);
    const contentType = file.mimetype;
    const fileName = file.originalname || `upload-${Date.now()}`;

    // Upload to storage provider(s)
    const result = await uploadImage(fileBuffer, contentType, { fileName });

    // Clean up temp file
    fs.unlinkSync(file.path);

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
    // Clean up temp file if it exists
    try {
      const file = (req as any).file;
      if (file?.path) {
        fs.unlinkSync(file.path);
      }
    } catch {
      // Ignore cleanup errors
    }

    console.error('[/api/arweave/upload] Error:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

// Apply rate limiting and error monitoring
export default uploadLimiter(withErrorMonitoring(handler));
