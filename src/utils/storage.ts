// src/utils/storage.ts
import axios from 'axios';
import {
  uploadImageToArweave,
  uploadMetadataToArweave,
  getArweaveUrl,
  isArweaveConfigured,
} from './arweave';
import { uploadImageToIrys, uploadMetadataToIrys, getIrysUrl, isIrysConfigured } from './irys';
import { uploadToPinata } from './pinata';

// Storage provider type - Irys is now the recommended option
type StorageProvider = 'irys' | 'pinata' | 'arweave' | 'both';

// Get the configured storage provider
function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER?.toLowerCase();
  if (
    provider === 'irys' ||
    provider === 'arweave' ||
    provider === 'both' ||
    provider === 'pinata'
  ) {
    return provider as StorageProvider;
  }
  // Default to Irys for permanent storage (devnet is free)
  return 'irys';
}

// Pinata configuration
const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY || process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY =
  process.env.PINATA_API_SECRET_KEY || process.env.NEXT_PUBLIC_PINATA_SECRET_KEY;
const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';

export interface StorageResult {
  irysTxId?: string;
  arweaveTxId?: string;
  ipfsHash?: string;
  gateway: string;
  provider: StorageProvider;
}

export interface UploadOptions {
  forceProvider?: StorageProvider;
  fileName?: string;
}

/**
 * Check if Pinata is configured
 */
function isPinataConfigured(): boolean {
  return !!(PINATA_API_KEY && PINATA_SECRET_KEY);
}

/**
 * Upload image file to Pinata IPFS
 */
async function uploadImageToPinata(
  fileBuffer: Buffer,
  contentType: string,
  fileName: string = 'image'
): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('PINATA_JWT not configured');
  }

  const FormData = (await import('form-data')).default;
  const formData = new FormData();

  // Append the file buffer with proper filename and content type
  formData.append('file', fileBuffer, {
    filename: fileName,
    contentType: contentType,
  });

  const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
    headers: {
      ...formData.getHeaders(),
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    maxBodyLength: Infinity,
  });

  return response.data.IpfsHash;
}

/**
 * Upload an image file to the configured storage provider(s).
 * Returns both Arweave txId and IPFS hash when using 'both' provider.
 *
 * @param fileBuffer - The image data as a Buffer
 * @param contentType - MIME type (e.g., 'image/png')
 * @param options - Upload options including fileName and forceProvider
 */
export async function uploadImage(
  fileBuffer: Buffer,
  contentType: string,
  options: UploadOptions = {}
): Promise<StorageResult> {
  const provider = options.forceProvider || getStorageProvider();
  const fileName = options.fileName || `image-${Date.now()}`;

  // Validate configuration
  if (provider === 'irys' && !isIrysConfigured()) {
    throw new Error('Irys not configured. Set IRYS_PRIVATE_KEY or use STORAGE_PROVIDER=pinata');
  }
  if (provider === 'arweave' && !isArweaveConfigured()) {
    throw new Error('Arweave not configured. Set ARWEAVE_KEY or use STORAGE_PROVIDER=pinata');
  }
  if (provider === 'pinata' && !isPinataConfigured()) {
    throw new Error('Pinata not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY');
  }

  let irysTxId: string | undefined;
  let arweaveTxId: string | undefined;
  let ipfsHash: string | undefined;

  // Upload based on provider
  if (provider === 'irys') {
    irysTxId = await uploadImageToIrys(fileBuffer, contentType);
    return {
      irysTxId,
      gateway: getIrysUrl(irysTxId),
      provider: 'irys',
    };
  }

  if (provider === 'arweave') {
    arweaveTxId = await uploadImageToArweave(fileBuffer, contentType);
    return {
      arweaveTxId,
      gateway: getArweaveUrl(arweaveTxId),
      provider: 'arweave',
    };
  }

  if (provider === 'pinata') {
    ipfsHash = await uploadImageToPinata(fileBuffer, contentType, fileName);
    return {
      ipfsHash,
      gateway: `${PINATA_GATEWAY}${ipfsHash}`,
      provider: 'pinata',
    };
  }

  // 'both' - upload to Irys (permanent) + Pinata (fast CDN) for redundancy
  const [irysResult, pinataResult] = await Promise.allSettled([
    uploadImageToIrys(fileBuffer, contentType),
    uploadImageToPinata(fileBuffer, contentType, fileName),
  ]);

  if (irysResult.status === 'fulfilled') {
    irysTxId = irysResult.value;
  } else {
    console.error('Irys upload failed (continuing with Pinata):', irysResult.reason);
  }

  if (pinataResult.status === 'fulfilled') {
    ipfsHash = pinataResult.value;
  } else {
    console.error('Pinata upload failed:', pinataResult.reason);
  }

  // At least one must succeed
  if (!irysTxId && !ipfsHash) {
    throw new Error('Both Irys and Pinata uploads failed');
  }

  // Prefer Irys URL for gateway (permanent Arweave-backed storage)
  const gateway = irysTxId ? getIrysUrl(irysTxId) : `${PINATA_GATEWAY}${ipfsHash}`;

  return {
    irysTxId,
    ipfsHash,
    gateway,
    provider: 'both',
  };
}

/**
 * Upload JSON metadata to the configured storage provider(s).
 *
 * @param metadata - The metadata object to upload
 * @param name - Name for the metadata file
 * @param options - Upload options
 */
export async function uploadMetadata(
  metadata: object,
  name: string,
  options: UploadOptions = {}
): Promise<StorageResult> {
  const provider = options.forceProvider || getStorageProvider();

  // Validate configuration
  if (provider === 'irys' && !isIrysConfigured()) {
    throw new Error('Irys not configured. Set IRYS_PRIVATE_KEY or use STORAGE_PROVIDER=pinata');
  }
  if (provider === 'arweave' && !isArweaveConfigured()) {
    throw new Error('Arweave not configured. Set ARWEAVE_KEY or use STORAGE_PROVIDER=pinata');
  }
  if (provider === 'pinata' && !isPinataConfigured()) {
    throw new Error('Pinata not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY');
  }

  let irysTxId: string | undefined;
  let arweaveTxId: string | undefined;
  let ipfsHash: string | undefined;

  // Upload based on provider
  if (provider === 'irys') {
    irysTxId = await uploadMetadataToIrys(metadata, name);
    return {
      irysTxId,
      gateway: getIrysUrl(irysTxId),
      provider: 'irys',
    };
  }

  if (provider === 'arweave') {
    arweaveTxId = await uploadMetadataToArweave(metadata, name);
    return {
      arweaveTxId,
      gateway: getArweaveUrl(arweaveTxId),
      provider: 'arweave',
    };
  }

  if (provider === 'pinata') {
    // Use existing uploadToPinata function
    const fullUrl = await uploadToPinata(metadata, name);
    // Extract hash from URL
    const hashMatch = fullUrl.match(/ipfs\/([^/]+)/);
    ipfsHash = hashMatch ? hashMatch[1] : fullUrl.split('/').pop();
    return {
      ipfsHash,
      gateway: fullUrl,
      provider: 'pinata',
    };
  }

  // 'both' - upload to Irys (permanent) + Pinata (fast CDN) for redundancy
  const [irysResult, pinataResult] = await Promise.allSettled([
    uploadMetadataToIrys(metadata, name),
    uploadToPinata(metadata, name),
  ]);

  if (irysResult.status === 'fulfilled') {
    irysTxId = irysResult.value;
  } else {
    console.error('Irys metadata upload failed (continuing with Pinata):', irysResult.reason);
  }

  if (pinataResult.status === 'fulfilled') {
    const fullUrl = pinataResult.value;
    const hashMatch = fullUrl.match(/ipfs\/([^/]+)/);
    ipfsHash = hashMatch ? hashMatch[1] : fullUrl.split('/').pop();
  } else {
    console.error('Pinata metadata upload failed:', pinataResult.reason);
  }

  // At least one must succeed
  if (!irysTxId && !ipfsHash) {
    throw new Error('Both Irys and Pinata metadata uploads failed');
  }

  // Prefer Irys URL for gateway (permanent Arweave-backed storage)
  const gateway = irysTxId ? getIrysUrl(irysTxId) : `${PINATA_GATEWAY}${ipfsHash}`;

  return {
    irysTxId,
    ipfsHash,
    gateway,
    provider: 'both',
  };
}

/**
 * Get the current storage provider configuration
 */
export function getStorageConfig(): {
  provider: StorageProvider;
  irysConfigured: boolean;
  arweaveConfigured: boolean;
  pinataConfigured: boolean;
} {
  return {
    provider: getStorageProvider(),
    irysConfigured: isIrysConfigured(),
    arweaveConfigured: isArweaveConfigured(),
    pinataConfigured: isPinataConfigured(),
  };
}

/**
 * Resolve a storage URL to Irys, Arweave, and IPFS URLs if possible
 */
export function resolveStorageUrl(url: string): {
  original: string;
  irys?: string;
  arweave?: string;
  ipfs?: string;
} {
  const result: { original: string; irys?: string; arweave?: string; ipfs?: string } = {
    original: url,
  };

  // Check if it's an Irys URL (Arweave-backed)
  if (url.includes('gateway.irys.xyz') || url.includes('arweave.net')) {
    result.irys = url;
    // Irys content is also accessible via Arweave directly
    if (url.includes('gateway.irys.xyz')) {
      const txId = url.split('/').pop();
      if (txId) {
        result.arweave = `https://arweave.net/${txId}`;
      }
    } else {
      result.arweave = url;
    }
  }

  // Check if it's an IPFS URL
  if (url.includes('ipfs') || url.includes('gateway.pinata.cloud')) {
    const hashMatch = url.match(/ipfs\/([^/?]+)/);
    if (hashMatch) {
      result.ipfs = `${PINATA_GATEWAY}${hashMatch[1]}`;
    }
  }

  return result;
}
