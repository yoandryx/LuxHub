// /pages/api/storage/upload.ts
// Server-side storage upload API - supports Irys (Arweave), Pinata (IPFS), or both
// This endpoint has access to server-side env vars (ADMIN_SECRET, IRYS_PRIVATE_KEY)

import type { NextApiRequest, NextApiResponse } from 'next';
import { uploadMetadata, uploadImage, getStorageConfig } from '../../../utils/storage';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Allow larger payloads for images
    },
  },
};

interface UploadRequest {
  type: 'metadata' | 'image';
  data: object | string; // JSON object for metadata, base64 string for images
  name: string;
  contentType?: string; // Required for images (e.g., 'image/png')
  forceProvider?: 'irys' | 'pinata' | 'arweave' | 'both';
}

interface UploadResponse {
  success: boolean;
  url?: string;
  irysTxId?: string;
  arweaveTxId?: string;
  ipfsHash?: string;
  provider?: string;
  error?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<UploadResponse>) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { type, data, name, contentType, forceProvider } = req.body as UploadRequest;

  // Validate request
  if (!type || !data || !name) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: type, data, name',
    });
  }

  if (type !== 'metadata' && type !== 'image') {
    return res.status(400).json({
      success: false,
      error: 'Invalid type. Must be "metadata" or "image"',
    });
  }

  if (type === 'image' && !contentType) {
    return res.status(400).json({
      success: false,
      error: 'contentType is required for image uploads',
    });
  }

  try {
    // Log storage configuration
    const storageConfig = getStorageConfig();
    console.log('[STORAGE-API] Upload request received');
    console.log('[STORAGE-API] Type:', type);
    console.log('[STORAGE-API] Name:', name);
    console.log('[STORAGE-API] Provider config:', storageConfig.provider);
    console.log('[STORAGE-API] Irys configured:', storageConfig.irysConfigured);
    console.log('[STORAGE-API] Pinata configured:', storageConfig.pinataConfigured);
    console.log('[STORAGE-API] Force provider:', forceProvider || 'none (using default)');

    if (type === 'metadata') {
      // Upload JSON metadata
      console.log('[STORAGE-API] Uploading metadata...');
      const result = await uploadMetadata(data as object, name, {
        forceProvider,
      });

      console.log('[STORAGE-API] Metadata upload successful');
      console.log('[STORAGE-API] Gateway URL:', result.gateway);
      console.log('[STORAGE-API] Provider used:', result.provider);

      return res.status(200).json({
        success: true,
        url: result.gateway,
        irysTxId: result.irysTxId,
        arweaveTxId: result.arweaveTxId,
        ipfsHash: result.ipfsHash,
        provider: result.provider,
      });
    } else {
      // Upload image (base64 encoded)
      console.log('[STORAGE-API] Uploading image...');

      // Convert base64 to Buffer
      const base64Data = (data as string).replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const result = await uploadImage(imageBuffer, contentType!, {
        forceProvider,
        fileName: name,
      });

      console.log('[STORAGE-API] Image upload successful');
      console.log('[STORAGE-API] Gateway URL:', result.gateway);
      console.log('[STORAGE-API] Provider used:', result.provider);

      return res.status(200).json({
        success: true,
        url: result.gateway,
        irysTxId: result.irysTxId,
        arweaveTxId: result.arweaveTxId,
        ipfsHash: result.ipfsHash,
        provider: result.provider,
      });
    }
  } catch (error: any) {
    console.error('[STORAGE-API] Upload failed:', error);
    console.error('[STORAGE-API] Error message:', error.message);

    return res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
    });
  }
}
