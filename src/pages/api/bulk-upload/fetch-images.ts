// src/pages/api/bulk-upload/fetch-images.ts
// Fetch images from external URLs (Dropbox, etc.) and upload to R2
import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadImage } from '@/lib/storage/uploadImage';

interface FetchItem {
  url: string;
  index: number; // which CSV row this image belongs to
}

interface ResultItem {
  index: number;
  originalUrl: string;
  r2Url: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { items } = req.body as { items: FetchItem[] };

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'No image URLs provided' });
  }

  if (items.length > 25) {
    return res.status(400).json({ success: false, error: 'Maximum 25 images per batch' });
  }

  const timestamp = Date.now();
  const results: ResultItem[] = [];

  for (const item of items) {
    try {
      // Fetch the image from external URL
      const response = await fetch(item.url, {
        headers: { 'User-Agent': 'LuxHub-BulkUpload/1.0' },
        redirect: 'follow',
      });

      if (!response.ok) {
        results.push({
          index: item.index,
          originalUrl: item.url,
          r2Url: '',
          error: `HTTP ${response.status}`,
        });
        continue;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await response.arrayBuffer());

      // Generate a filename from the URL or use index
      const urlPath = new URL(item.url).pathname;
      const ext = urlPath.match(/\.(jpe?g|png|webp|gif)/i)?.[0] || '.jpg';
      const filename = `item-${item.index}${ext}`;

      const key = `bulk-uploads/${timestamp}/${filename}`;
      const r2Url = await uploadImage(buffer, key, contentType);

      results.push({
        index: item.index,
        originalUrl: item.url,
        r2Url,
      });
    } catch (err: any) {
      console.error(`Failed to fetch image for index ${item.index}:`, err.message);
      results.push({
        index: item.index,
        originalUrl: item.url,
        r2Url: '',
        error: err.message || 'Fetch failed',
      });
    }
  }

  return res.status(200).json({ success: true, results });
}
