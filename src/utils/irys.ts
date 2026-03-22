// src/utils/irys.ts
// Irys upload utilities using @irys/upload + @irys/upload-solana (replaces deprecated @irys/sdk)
import { Uploader } from '@irys/upload';
import { Solana } from '@irys/upload-solana';
import { getAdminConfig } from '../lib/config/adminConfig';
import { getClusterConfig } from '@/lib/solana/clusterConfig';

// Irys network configuration
// Use 'devnet' for testing (free uploads), 'mainnet' for production
const IRYS_NETWORK = process.env.IRYS_NETWORK || 'devnet';
const getIrysRpc = () => getClusterConfig().endpoint;

// Gateway URL for accessing uploaded content
const IRYS_GATEWAY = 'https://gateway.irys.xyz';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _irysInstance: any = null;

/**
 * Get Irys instance configured with Solana wallet.
 * Uses ADMIN_SECRET (existing admin keypair) - no extra config needed!
 * Falls back to IRYS_PRIVATE_KEY if set explicitly.
 */
async function getIrys() {
  // Return cached instance if available
  if (_irysInstance) {
    return _irysInstance;
  }

  try {
    // Determine the wallet key
    let key: string | Uint8Array;

    if (process.env.IRYS_PRIVATE_KEY) {
      // Option 1: Use explicit IRYS_PRIVATE_KEY (base58 encoded)
      key = process.env.IRYS_PRIVATE_KEY;
    } else {
      // Option 2: Use existing ADMIN_SECRET keypair (same one used for minting)
      const adminConfig = getAdminConfig();
      const adminKeypair = adminConfig.getAdminKeypair();

      if (!adminKeypair) {
        console.warn('Irys: No keypair available. Set ADMIN_SECRET or IRYS_PRIVATE_KEY');
        return null;
      }

      key = adminKeypair.secretKey;
    }

    // Build the uploader using the fluent builder API
    let builder = Uploader(Solana).withWallet(key).withRpc(getIrysRpc());
    if (IRYS_NETWORK === 'devnet') {
      builder = builder.devnet();
    }
    _irysInstance = await builder;

    console.log(`Irys initialized (${IRYS_NETWORK})`);
    return _irysInstance;
  } catch (error) {
    console.error('Failed to initialize Irys:', error);
    _irysInstance = null;
    return null;
  }
}

/**
 * Check if Irys is configured and available.
 * Now uses ADMIN_SECRET automatically - no extra config needed!
 */
export function isIrysConfigured(): boolean {
  // Check for explicit IRYS_PRIVATE_KEY
  if (process.env.IRYS_PRIVATE_KEY) {
    return true;
  }

  // Check if admin keypair is available (ADMIN_SECRET)
  const adminConfig = getAdminConfig();
  return adminConfig.getAdminKeypair() !== null;
}

/**
 * Get the full Irys gateway URL for a transaction ID
 */
export function getIrysUrl(txId: string): string {
  return `${IRYS_GATEWAY}/${txId}`;
}

/**
 * Get current network mode (devnet or mainnet)
 */
export function getIrysNetwork(): string {
  return IRYS_NETWORK;
}

/**
 * Upload an image/file to Irys (Arweave-backed)
 * @param fileBuffer - The file data as a Buffer
 * @param contentType - MIME type of the file (e.g., 'image/png')
 * @returns The Irys transaction ID
 */
export async function uploadImageToIrys(fileBuffer: Buffer, contentType: string): Promise<string> {
  console.log(`[irys] uploadImage: starting, size=${fileBuffer.length} bytes, type=${contentType}`);

  const irys = await getIrys();
  if (!irys) {
    throw new Error(
      'Irys not configured. ADMIN_SECRET is required (same keypair used for minting).'
    );
  }

  try {
    // Create tags for the upload
    const tags = [
      { name: 'Content-Type', value: contentType },
      { name: 'App-Name', value: 'LuxHub' },
      { name: 'App-Version', value: '1.0.0' },
      { name: 'Type', value: 'image' },
    ];

    console.log(
      `[irys] uploadImage: uploading ${fileBuffer.length} bytes to Irys (${IRYS_NETWORK})`
    );
    const receipt = await irys.upload(fileBuffer, { tags });

    console.log(`[irys] uploadImage: success, txId=${receipt.id}`);
    return receipt.id;
  } catch (error) {
    console.error('[irys] uploadImage: failed:', error);
    _irysInstance = null; // Clear cached instance so retries re-initialize
    throw new Error(
      `Failed to upload image to Irys: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Upload JSON metadata to Irys
 * @param metadata - The metadata object to upload
 * @param name - Optional name for the metadata file
 * @returns The Irys transaction ID
 */
export async function uploadMetadataToIrys(metadata: object, name?: string): Promise<string> {
  const metadataJson = JSON.stringify(metadata);
  console.log(
    `[irys] uploadMetadata: starting, name=${name || 'unnamed'}, size=${metadataJson.length} chars`
  );

  const irys = await getIrys();
  if (!irys) {
    throw new Error(
      'Irys not configured. ADMIN_SECRET is required (same keypair used for minting).'
    );
  }

  try {
    // Create tags
    const tags = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'LuxHub' },
      { name: 'App-Version', value: '1.0.0' },
      { name: 'Type', value: 'nft-metadata' },
    ];

    if (name) {
      tags.push({ name: 'Name', value: name });
    }

    console.log(
      `[irys] uploadMetadata: uploading ${metadataJson.length} chars to Irys (${IRYS_NETWORK})`
    );
    const receipt = await irys.upload(metadataJson, { tags });

    console.log(`[irys] uploadMetadata: success, txId=${receipt.id}`);
    return receipt.id;
  } catch (error) {
    console.error('[irys] uploadMetadata: failed:', error);
    _irysInstance = null; // Clear cached instance so retries re-initialize
    throw new Error(
      `Failed to upload metadata to Irys: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get the wallet balance on Irys
 * @returns Balance in the token's base units
 */
export async function getIrysBalance(): Promise<string> {
  const irys = await getIrys();
  if (!irys) {
    throw new Error('Irys not configured');
  }

  try {
    const balance = await irys.getLoadedBalance();
    return balance.toString();
  } catch (error) {
    console.error('Failed to get Irys balance:', error);
    _irysInstance = null;
    throw new Error('Failed to get Irys balance');
  }
}

/**
 * Estimate the cost of uploading data to Irys
 * @param byteSize - Size of data in bytes
 * @returns Cost in the token's base units (lamports for SOL)
 */
export async function estimateIrysUploadCost(byteSize: number): Promise<string> {
  const irys = await getIrys();
  if (!irys) {
    throw new Error('Irys not configured');
  }

  try {
    const price = await irys.getPrice(byteSize);
    return price.toString();
  } catch (error) {
    console.error('Failed to estimate upload cost:', error);
    _irysInstance = null;
    throw new Error('Failed to estimate Irys upload cost');
  }
}

/**
 * Fund the Irys account with SOL for uploads
 * @param amount - Amount in lamports to fund
 */
export async function fundIrysAccount(amount: number): Promise<void> {
  const irys = await getIrys();
  if (!irys) {
    throw new Error('Irys not configured');
  }

  try {
    await irys.fund(amount);
    console.log(`Funded Irys account with ${amount} lamports`);
  } catch (error) {
    console.error('Failed to fund Irys account:', error);
    _irysInstance = null;
    throw new Error('Failed to fund Irys account');
  }
}
