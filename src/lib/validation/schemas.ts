// src/lib/validation/schemas.ts
import { z } from 'zod';

// ============================================
// Primitive Schemas
// ============================================

/**
 * Solana wallet address validation (Base58, 32-44 chars)
 */
export const SolanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address format');

/**
 * IPFS CID validation (Qm... or baf...)
 */
export const IPFSCidSchema = z
  .string()
  .regex(/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[a-z2-7]{50,})$/, 'Invalid IPFS CID format');

/**
 * Arweave transaction ID validation (43 chars, base64url)
 */
export const ArweaveTxIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{43}$/, 'Invalid Arweave transaction ID format');

/**
 * IPFS gateway URL
 */
export const IPFSUrlSchema = z.string().url().includes('ipfs', { message: 'Must be an IPFS URL' });

/**
 * Arweave gateway URL
 */
export const ArweaveUrlSchema = z
  .string()
  .url()
  .refine((url) => url.includes('arweave.net') || url.includes('ar://'), {
    message: 'Must be an Arweave URL',
  });

// ============================================
// Asset & NFT Schemas
// ============================================

/**
 * Asset status enum
 */
export const AssetStatusSchema = z.enum([
  'pending',
  'reviewed',
  'listed',
  'in_escrow',
  'pooled',
  'sold',
  'burned',
]);

/**
 * Luxury category enum
 */
export const LuxuryCategorySchema = z.enum(['watches', 'jewelry', 'art', 'collectibles']);

/**
 * Condition grade enum
 */
export const ConditionGradeSchema = z.enum([
  'mint',
  'excellent',
  'very_good',
  'good',
  'fair',
  'poor',
]);

/**
 * Create asset request schema
 */
export const CreateAssetSchema = z.object({
  vendor: z.string().min(1, 'Vendor is required'),
  model: z.string().min(1, 'Model is required'),
  serial: z.string().min(1, 'Serial number is required'),
  description: z.string().optional(),
  priceUSD: z.number().positive('Price must be positive'),
  imageIpfsUrls: z.array(z.string()).min(1, 'At least one image is required'),
  metadataIpfsUrl: z.string().url('Invalid metadata URL'),
  nftMint: SolanaAddressSchema,
  nftOwnerWallet: SolanaAddressSchema,
  status: AssetStatusSchema.optional().default('pending'),
  poolEligible: z.boolean().optional().default(false),
  arweaveTxId: ArweaveTxIdSchema.optional(),
  arweaveMetadataTxId: ArweaveTxIdSchema.optional(),
});

export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

// ============================================
// AI Verification Schemas
// ============================================

/**
 * Vendor claims for verification
 */
export const VendorClaimsSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().optional(),
  condition: z.string().min(1, 'Condition is required'),
  estimatedValue: z.number().positive().optional(),
  serialNumber: z.string().optional(),
  yearOfProduction: z.string().optional(),
});

/**
 * Image analysis request schema
 */
export const AnalyzeImageSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
});

export type AnalyzeImageInput = z.infer<typeof AnalyzeImageSchema>;

/**
 * Multi-category listing verification request schema
 */
export const VerifyListingSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
  category: LuxuryCategorySchema,
  vendorClaims: VendorClaimsSchema,
  additionalImages: z.array(z.string().url()).max(5, 'Maximum 5 additional images').optional(),
});

export type VerifyListingInput = z.infer<typeof VerifyListingSchema>;

/**
 * Verification result claim status
 */
export const ClaimVerificationSchema = z.object({
  verified: z.boolean(),
  confidence: z.number().min(0).max(100),
  notes: z.string(),
});

/**
 * Full verification response schema
 */
export const VerificationResultSchema = z.object({
  success: z.boolean(),
  verified: z.boolean(),
  confidence: z.number().min(0).max(100),
  category: LuxuryCategorySchema,
  claimsVerified: z.object({
    brand: ClaimVerificationSchema,
    model: ClaimVerificationSchema.optional(),
    condition: z.object({
      verified: z.boolean(),
      suggestedCondition: ConditionGradeSchema,
      notes: z.string(),
    }),
    value: z.object({
      reasonable: z.boolean(),
      marketRange: z.tuple([z.number(), z.number()]),
      notes: z.string(),
    }),
  }),
  authenticityScore: z.number().min(0).max(100),
  authenticityFlags: z.array(z.string()),
  recommendedActions: z.array(z.string()),
  listingApproved: z.boolean(),
  categorySpecificAnalysis: z.record(z.unknown()).optional(),
});

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

// ============================================
// Webhook Schemas
// ============================================

/**
 * Helius webhook event types (enhanced)
 */
export const HeliusEventTypeSchema = z.enum([
  'NFT_SALE',
  'NFT_LISTING',
  'NFT_CANCEL_LISTING',
  'NFT_BID',
  'NFT_BID_CANCELLED',
  'NFT_TRANSFER',
  'NFT_MINT',
  'NFT_AUCTION_CREATED',
  'NFT_AUCTION_UPDATED',
  'NFT_AUCTION_CANCELLED',
  'NFT_PARTICIPATION_REWARD',
  'NFT_MINT_REJECTED',
  'ACCOUNT_UPDATE',
  'TOKEN_BURN',
  'TRANSFER',
  'SWAP',
  'UNKNOWN',
]);

/**
 * Treasury deposit type enum
 */
export const TreasuryDepositTypeSchema = z.enum([
  'escrow_fee',
  'pool_royalty',
  'direct_deposit',
  'mint_fee',
  'platform_fee',
  'unknown',
]);

/**
 * Helius webhook event schema
 */
export const HeliusWebhookEventSchema = z.object({
  type: HeliusEventTypeSchema,
  signature: z.string(),
  timestamp: z.number(),
  accountKeys: z.array(z.string()).optional(),
  nativeTransfers: z.array(z.unknown()).optional(),
  tokenTransfers: z.array(z.unknown()).optional(),
  events: z.record(z.unknown()).optional(),
});

/**
 * Helius webhook payload schema
 */
export const HeliusWebhookPayloadSchema = z.array(HeliusWebhookEventSchema);

export type HeliusWebhookPayload = z.infer<typeof HeliusWebhookPayloadSchema>;

// ============================================
// Storage Schemas
// ============================================

/**
 * Storage provider enum
 */
export const StorageProviderSchema = z.enum(['pinata', 'arweave', 'both']);

/**
 * Storage result schema
 */
export const StorageResultSchema = z.object({
  arweaveTxId: ArweaveTxIdSchema.optional(),
  ipfsHash: z.string().optional(),
  gateway: z.string().url(),
  provider: StorageProviderSchema,
});

export type StorageResult = z.infer<typeof StorageResultSchema>;

/**
 * Upload request schema
 */
export const UploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^(image|application)\/.+$/, 'Invalid content type'),
});

// ============================================
// Common API Schemas
// ============================================

/**
 * Pagination query schema
 */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Standard success response schema
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z
      .object({
        page: z.number().optional(),
        total: z.number().optional(),
        requestId: z.string().optional(),
      })
      .optional(),
  });

/**
 * Standard error response schema
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.array(z.unknown()).optional(),
  requestId: z.string().optional(),
});
