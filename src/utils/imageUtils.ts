// src/utils/imageUtils.ts
// Unified image resolution utilities for consistent Irys/IPFS gateway handling

import { SyntheticEvent } from 'react';

// Gateway configurations - Irys is the primary gateway
export const IRYS_GATEWAY = 'https://gateway.irys.xyz/';
// Fallback Pinata gateway for legacy IPFS CIDs
export const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://teal-working-frog-718.mypinata.cloud/ipfs/';
export const PLACEHOLDER_IMAGE = '/images/purpleLGG.png';

/**
 * Check if a string is an Irys/Arweave transaction ID
 * Irys TX IDs are 43-character base64url strings
 */
export function isIrysTxId(str: string): boolean {
  return str.length === 43 && /^[A-Za-z0-9_-]+$/.test(str);
}

/**
 * Check if a string is an IPFS CID
 * CIDv0 starts with "Qm", CIDv1 starts with "bafy"
 */
export function isIpfsCid(str: string): boolean {
  return str.startsWith('Qm') || str.startsWith('bafy');
}

/**
 * Resolve an image identifier to a full URL
 * Handles:
 * - Full URLs (http/https) - returned as-is
 * - Local paths (/) - returned as-is
 * - Irys/Arweave TX IDs (43-char base64url) - prepended with Irys gateway (PRIMARY)
 * - IPFS CIDv0 (Qm...) - prepended with Pinata gateway (LEGACY)
 * - IPFS CIDv1 (bafy...) - prepended with Pinata gateway (LEGACY)
 * - Other strings - assumed to be Irys TX IDs
 */
export function resolveImageUrl(idOrUrl: string | undefined | null): string {
  if (!idOrUrl) return PLACEHOLDER_IMAGE;

  const trimmed = idOrUrl.trim();

  // Already a full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Local path
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // IPFS CIDv0 (starts with Qm) or CIDv1 (starts with bafy) - legacy support
  if (isIpfsCid(trimmed)) {
    return `${PINATA_GATEWAY}${trimmed}`;
  }

  // Irys/Arweave TX ID (43-char base64url string) - primary
  if (isIrysTxId(trimmed)) {
    return `${IRYS_GATEWAY}${trimmed}`;
  }

  // Default to Irys gateway for unknown formats (assuming new uploads use Irys)
  return `${IRYS_GATEWAY}${trimmed}`;
}

/**
 * Asset interface for image resolution
 * Supports all field variations from Asset model and NFT model
 */
export interface AssetWithImage {
  imageUrl?: string; // Primary: Full URL (Irys/IPFS gateway)
  imageIpfsUrls?: string[]; // Array of IPFS/Irys TX IDs
  images?: string[]; // Array of image URLs
  image?: string; // Legacy: single image field from NFT model
  fileCid?: string; // Legacy: IPFS CID from old NFT model
  arweaveTxId?: string; // Arweave/Irys TX ID
}

/**
 * Resolve image from an asset object
 * Priority: imageUrl > images[0] > imageIpfsUrls[0] > image > fileCid > arweaveTxId > placeholder
 */
export function resolveAssetImage(asset: AssetWithImage | undefined | null): string {
  if (!asset) return PLACEHOLDER_IMAGE;

  // Priority 1: imageUrl (full gateway URL from new mints)
  if (asset.imageUrl) {
    const resolved = resolveImageUrl(asset.imageUrl);
    if (resolved !== PLACEHOLDER_IMAGE) return resolved;
  }

  // Priority 2: images array (full URLs)
  if (asset.images && asset.images.length > 0 && asset.images[0]) {
    const resolved = resolveImageUrl(asset.images[0]);
    if (resolved !== PLACEHOLDER_IMAGE) return resolved;
  }

  // Priority 3: imageIpfsUrls array (TX IDs that need gateway)
  if (asset.imageIpfsUrls && asset.imageIpfsUrls.length > 0 && asset.imageIpfsUrls[0]) {
    const resolved = resolveImageUrl(asset.imageIpfsUrls[0]);
    if (resolved !== PLACEHOLDER_IMAGE) return resolved;
  }

  // Priority 4: generic image field (legacy NFT model)
  if (asset.image) {
    const resolved = resolveImageUrl(asset.image);
    if (resolved !== PLACEHOLDER_IMAGE) return resolved;
  }

  // Priority 5: fileCid (legacy IPFS from old NFT model)
  if (asset.fileCid) {
    const resolved = resolveImageUrl(asset.fileCid);
    if (resolved !== PLACEHOLDER_IMAGE) return resolved;
  }

  // Priority 6: arweaveTxId (direct Irys TX ID)
  if (asset.arweaveTxId) {
    return `${IRYS_GATEWAY}${asset.arweaveTxId}`;
  }

  return PLACEHOLDER_IMAGE;
}

/**
 * Listing interface for marketplace
 */
export interface ListingWithAsset {
  asset?: AssetWithImage;
}

/**
 * Resolve image from a listing (escrow) object
 */
export function resolveListingImage(listing: ListingWithAsset | undefined | null): string {
  if (!listing) return PLACEHOLDER_IMAGE;
  return resolveAssetImage(listing.asset);
}

/**
 * Pool interface for image resolution
 */
export interface PoolWithImage {
  image?: string;
  asset?: AssetWithImage;
}

/**
 * Resolve image from a pool object
 */
export function resolvePoolImage(pool: PoolWithImage | undefined | null): string {
  if (!pool) return PLACEHOLDER_IMAGE;

  // Check asset first (using full asset resolution)
  if (pool.asset) {
    const assetImage = resolveAssetImage(pool.asset);
    if (assetImage !== PLACEHOLDER_IMAGE) return assetImage;
  }

  // Check pool image
  if (pool.image) {
    return resolveImageUrl(pool.image);
  }

  return PLACEHOLDER_IMAGE;
}

/**
 * Create an onError handler for images that sets the placeholder
 * @returns Event handler function
 */
export function handleImageError(e: SyntheticEvent<HTMLImageElement, Event>): void {
  const target = e.target as HTMLImageElement;
  if (target.src !== PLACEHOLDER_IMAGE) {
    target.src = PLACEHOLDER_IMAGE;
  }
}

/**
 * Create an onError handler that calls a callback (for React state updates)
 * @param callback Function to call on error
 */
export function createImageErrorHandler(callback: () => void) {
  return (e: SyntheticEvent<HTMLImageElement, Event>): void => {
    const target = e.target as HTMLImageElement;
    if (target.src !== PLACEHOLDER_IMAGE) {
      callback();
    }
  };
}
