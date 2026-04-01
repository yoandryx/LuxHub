// src/pages/api/bulk-upload/images.ts
// Bulk image upload to R2 — accepts multiple image files via multipart form data
import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import { uploadImage } from '@/lib/storage/uploadImage';
import { matchImageToRow } from '@/utils/imageMatching';

export const config = { api: { bodyParser: false } };

// Memory storage, limit 25 files, max 10MB each
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 25, fileSize: 10 * 1024 * 1024 },
});

function runMiddleware(
  req: NextApiRequest,
  res: NextApiResponse,
  fn: Function
): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

interface UploadResult {
  originalName: string;
  r2Url: string;
  mimeType: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    await runMiddleware(req, res, upload.array('files', 25));

    const files = (req as any).files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const timestamp = Date.now();
    const images: UploadResult[] = [];

    for (const file of files) {
      try {
        const key = `bulk-uploads/${timestamp}/${file.originalname}`;
        const r2Url = await uploadImage(file.buffer, key, file.mimetype);
        images.push({
          originalName: file.originalname,
          r2Url,
          mimeType: file.mimetype,
        });
      } catch (err: any) {
        console.error(`Failed to upload ${file.originalname}:`, err.message);
        images.push({
          originalName: file.originalname,
          r2Url: '',
          mimeType: file.mimetype,
          error: err.message || 'Upload failed',
        });
      }
    }

    return res.status(200).json({ success: true, images });
  } catch (err: any) {
    console.error('Bulk upload error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Upload failed' });
  }
}
