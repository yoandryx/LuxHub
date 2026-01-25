// src/lib/ai/prompts/index.ts
import { buildWatchVerificationPrompt } from './watch-verification';
import { buildJewelryVerificationPrompt } from './jewelry-verification';
import { buildArtVerificationPrompt } from './art-verification';
import { buildCollectiblesVerificationPrompt } from './collectibles-verification';

export type LuxuryCategory = 'watches' | 'jewelry' | 'art' | 'collectibles';

export interface VendorClaims {
  brand: string;
  model?: string;
  condition: string;
  estimatedValue?: number;
  serialNumber?: string;
  yearOfProduction?: string;
}

/**
 * Build the appropriate verification prompt for a given category
 */
export function buildVerificationPrompt(
  category: LuxuryCategory,
  vendorClaims: VendorClaims
): string {
  switch (category) {
    case 'watches':
      return buildWatchVerificationPrompt(vendorClaims);
    case 'jewelry':
      return buildJewelryVerificationPrompt(vendorClaims);
    case 'art':
      return buildArtVerificationPrompt(vendorClaims);
    case 'collectibles':
      return buildCollectiblesVerificationPrompt(vendorClaims);
    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

/**
 * Get minimum thresholds for listing approval by category
 */
export function getApprovalThresholds(category: LuxuryCategory): {
  minAuthenticityScore: number;
  minConfidence: number;
} {
  switch (category) {
    case 'watches':
      return { minAuthenticityScore: 70, minConfidence: 60 };
    case 'jewelry':
      return { minAuthenticityScore: 65, minConfidence: 55 };
    case 'art':
      return { minAuthenticityScore: 60, minConfidence: 50 };
    case 'collectibles':
      return { minAuthenticityScore: 65, minConfidence: 55 };
    default:
      return { minAuthenticityScore: 70, minConfidence: 60 };
  }
}

/**
 * Get recommended professional authentication services by category
 */
export function getRecommendedAuthServices(category: LuxuryCategory): string[] {
  switch (category) {
    case 'watches':
      return [
        'Rolex Service Center (for Rolex)',
        'Certified pre-owned dealer inspection',
        'Watch Registry authentication',
        'Entrupy authentication',
      ];
    case 'jewelry':
      return [
        'GIA (Gemological Institute of America)',
        'Brand boutique verification',
        'Entrupy authentication',
        'Independent appraiser',
      ];
    case 'art':
      return [
        'Artist foundation/estate authentication',
        'Auction house evaluation',
        'Independent art appraiser',
        'Provenance research service',
      ];
    case 'collectibles':
      return [
        'PSA (trading cards)',
        'Entrupy (designer goods)',
        'CheckCheck (sneakers)',
        'Professional grading service',
      ];
    default:
      return ['Professional authentication service'];
  }
}

// Re-export individual prompt builders for direct use
export { buildWatchVerificationPrompt } from './watch-verification';
export { buildJewelryVerificationPrompt } from './jewelry-verification';
export { buildArtVerificationPrompt } from './art-verification';
export { buildCollectiblesVerificationPrompt } from './collectibles-verification';
