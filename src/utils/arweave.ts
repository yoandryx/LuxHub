// src/utils/arweave.ts
import Arweave from 'arweave';
import type { JWKInterface } from 'arweave/node/lib/wallet';

// Arweave gateway URLs
const ARWEAVE_GATEWAY = 'https://arweave.net';

// Initialize Arweave client
const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
});

/**
 * Get Arweave wallet from environment variable.
 * The ARWEAVE_KEY should be a base64-encoded JWK.
 */
function getArweaveWallet(): JWKInterface | null {
  const keyBase64 = process.env.ARWEAVE_KEY;
  if (!keyBase64) {
    return null;
  }

  try {
    const keyJson = Buffer.from(keyBase64, 'base64').toString('utf-8');
    return JSON.parse(keyJson) as JWKInterface;
  } catch (error) {
    console.error('Failed to parse ARWEAVE_KEY:', error);
    return null;
  }
}

/**
 * Check if Arweave is configured and available
 */
export function isArweaveConfigured(): boolean {
  return !!process.env.ARWEAVE_KEY;
}

/**
 * Get the full Arweave gateway URL for a transaction ID
 */
export function getArweaveUrl(txId: string): string {
  return `${ARWEAVE_GATEWAY}/${txId}`;
}

/**
 * Upload an image/file to Arweave
 * @param fileBuffer - The file data as a Buffer
 * @param contentType - MIME type of the file (e.g., 'image/png')
 * @returns The Arweave transaction ID
 */
export async function uploadImageToArweave(
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const wallet = getArweaveWallet();
  if (!wallet) {
    throw new Error('Arweave wallet not configured. Set ARWEAVE_KEY environment variable.');
  }

  try {
    // Create the transaction
    const transaction = await arweave.createTransaction({ data: fileBuffer }, wallet);

    // Add tags for content type and app identification
    transaction.addTag('Content-Type', contentType);
    transaction.addTag('App-Name', 'LuxHub');
    transaction.addTag('App-Version', '1.0.0');
    transaction.addTag('Type', 'image');

    // Sign the transaction
    await arweave.transactions.sign(transaction, wallet);

    // Submit the transaction
    const response = await arweave.transactions.post(transaction);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`Arweave upload failed with status ${response.status}`);
    }

    return transaction.id;
  } catch (error) {
    console.error('Arweave image upload error:', error);
    throw new Error(
      `Failed to upload image to Arweave: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Upload JSON metadata to Arweave
 * @param metadata - The metadata object to upload
 * @param name - Optional name for the metadata file
 * @returns The Arweave transaction ID
 */
export async function uploadMetadataToArweave(metadata: object, name?: string): Promise<string> {
  const wallet = getArweaveWallet();
  if (!wallet) {
    throw new Error('Arweave wallet not configured. Set ARWEAVE_KEY environment variable.');
  }

  try {
    const metadataJson = JSON.stringify(metadata);
    const dataBuffer = Buffer.from(metadataJson, 'utf-8');

    // Create the transaction
    const transaction = await arweave.createTransaction({ data: dataBuffer }, wallet);

    // Add tags
    transaction.addTag('Content-Type', 'application/json');
    transaction.addTag('App-Name', 'LuxHub');
    transaction.addTag('App-Version', '1.0.0');
    transaction.addTag('Type', 'nft-metadata');
    if (name) {
      transaction.addTag('Name', name);
    }

    // Sign the transaction
    await arweave.transactions.sign(transaction, wallet);

    // Submit the transaction
    const response = await arweave.transactions.post(transaction);

    if (response.status !== 200 && response.status !== 202) {
      throw new Error(`Arweave upload failed with status ${response.status}`);
    }

    return transaction.id;
  } catch (error) {
    console.error('Arweave metadata upload error:', error);
    throw new Error(
      `Failed to upload metadata to Arweave: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get the status of an Arweave transaction
 * @param txId - The transaction ID to check
 * @returns Transaction status object
 */
export async function getTransactionStatus(txId: string): Promise<{
  confirmed: boolean;
  confirmations: number;
  blockHeight?: number;
}> {
  try {
    const status = await arweave.transactions.getStatus(txId);

    if (status.status === 200 && status.confirmed) {
      return {
        confirmed: true,
        confirmations: status.confirmed.number_of_confirmations,
        blockHeight: status.confirmed.block_height,
      };
    }

    return {
      confirmed: false,
      confirmations: 0,
    };
  } catch (error) {
    console.error('Failed to get transaction status:', error);
    return {
      confirmed: false,
      confirmations: 0,
    };
  }
}

/**
 * Get wallet balance in AR
 * @returns Balance in AR (not winston)
 */
export async function getWalletBalance(): Promise<string> {
  const wallet = getArweaveWallet();
  if (!wallet) {
    throw new Error('Arweave wallet not configured');
  }

  try {
    const address = await arweave.wallets.getAddress(wallet);
    const winstonBalance = await arweave.wallets.getBalance(address);
    const arBalance = arweave.ar.winstonToAr(winstonBalance);
    return arBalance;
  } catch (error) {
    console.error('Failed to get wallet balance:', error);
    throw new Error('Failed to get Arweave wallet balance');
  }
}

/**
 * Estimate the cost of uploading data to Arweave
 * @param byteSize - Size of data in bytes
 * @returns Cost in AR
 */
export async function estimateUploadCost(byteSize: number): Promise<string> {
  try {
    const winstonCost = await arweave.transactions.getPrice(byteSize);
    const arCost = arweave.ar.winstonToAr(winstonCost);
    return arCost;
  } catch (error) {
    console.error('Failed to estimate upload cost:', error);
    throw new Error('Failed to estimate Arweave upload cost');
  }
}
