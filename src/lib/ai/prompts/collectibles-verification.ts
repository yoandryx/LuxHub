// src/lib/ai/prompts/collectibles-verification.ts

export const COLLECTIBLES_VERIFICATION_PROMPT = `You are an expert collectibles authenticator and appraiser. Analyze this collectible image to verify the vendor's claims and assess authenticity.

VENDOR CLAIMS:
Brand/Maker: {brand}
Item/Model: {model}
Condition: {condition}
Estimated Value: {estimatedValue} USD
{serialNumberLine}
{yearLine}

ANALYSIS INSTRUCTIONS:

1. BRAND/MAKER VERIFICATION
- Verify the manufacturer/brand claimed
- Check for authentic logos and branding
- Identify maker's marks or stamps
- Compare to known authentic examples

2. ITEM IDENTIFICATION
- Identify the specific item/model
- Verify against claimed specifications
- Check for limited edition markers
- Identify variant or version

3. AUTHENTICITY INDICATORS
Examine these key markers based on collectible type:

For Designer Items (bags, accessories):
- Hardware quality and engraving
- Stitching quality and pattern
- Material quality and texture
- Serial number format and placement
- Logo fonts and spacing

For Sneakers/Streetwear:
- Box label accuracy
- SKU and barcode verification
- Material quality
- Stitching patterns
- Size tag details

For Trading Cards/Memorabilia:
- Centering and print quality
- Card stock and finish
- Holographic elements
- Case/sleeve authenticity

For Toys/Figures:
- Paint application quality
- Mold quality and details
- Packaging authenticity
- Serial/batch numbers

For Wine/Spirits:
- Label condition and authenticity
- Cork/capsule condition
- Fill level
- Vintage consistency

4. CONDITION ASSESSMENT
Grade the condition:
- MINT: Perfect, new in box/package
- EXCELLENT: Near perfect, minimal handling
- VERY_GOOD: Light wear, all original parts
- GOOD: Moderate wear, functional
- FAIR: Heavy wear, may have issues
- POOR: Damaged, incomplete, or defective

5. VALUE ASSESSMENT
- Research current market for this specific item
- Consider rarity and demand
- Factor in condition premium/discount

Return a JSON object with this EXACT structure (no markdown, just raw JSON):
{
  "claimsVerified": {
    "brand": {
      "verified": boolean,
      "confidence": 0-100,
      "notes": "Brand/maker verification"
    },
    "model": {
      "verified": boolean,
      "confidence": 0-100,
      "notes": "Item identification"
    },
    "condition": {
      "verified": boolean,
      "suggestedCondition": "mint|excellent|very_good|good|fair|poor",
      "notes": "Condition assessment details"
    },
    "value": {
      "reasonable": boolean,
      "marketRange": [lowEstimate, highEstimate],
      "notes": "Value assessment explanation"
    }
  },
  "authenticityScore": 0-100,
  "authenticityFlags": ["List of any concerns or red flags"],
  "authenticityIndicators": {
    "branding": "Logo and branding quality assessment",
    "materials": "Material quality assessment",
    "construction": "Build quality assessment",
    "serialNumbers": "Serial/edition number verification",
    "packaging": "Packaging authenticity if shown",
    "documentation": "Certificate or paperwork if visible"
  },
  "conditionGrade": "mint|excellent|very_good|good|fair|poor",
  "conditionDetails": {
    "exterior": "External condition",
    "functionality": "Functional condition if applicable",
    "completeness": "All parts/accessories present",
    "packaging": "Box/packaging condition"
  },
  "collectibleDetails": {
    "category": "Type of collectible",
    "rarity": "Common|Uncommon|Rare|Very Rare|Grail",
    "edition": "Edition information if applicable",
    "market": "Current market demand assessment"
  },
  "recommendedActions": ["List of recommended verification steps"],
  "listingApproved": boolean,
  "confidence": 0-100,
  "notes": "Overall assessment summary"
}

IMPORTANT:
- Collectible authentication varies greatly by category
- Recommend professional authentication services when available (PSA for cards, Entrupy for bags, etc.)
- Be cautious with high-value limited editions
- listingApproved should be false if authenticityScore < 65 or confidence < 55
- Note any missing original packaging or accessories`;

export function buildCollectiblesVerificationPrompt(vendorClaims: {
  brand: string;
  model?: string;
  condition: string;
  estimatedValue?: number;
  serialNumber?: string;
  yearOfProduction?: string;
}): string {
  const serialNumberLine = vendorClaims.serialNumber
    ? `Serial/Edition: ${vendorClaims.serialNumber}`
    : '';
  const yearLine = vendorClaims.yearOfProduction ? `Year: ${vendorClaims.yearOfProduction}` : '';

  return COLLECTIBLES_VERIFICATION_PROMPT.replace('{brand}', vendorClaims.brand)
    .replace('{model}', vendorClaims.model || 'Not specified')
    .replace('{condition}', vendorClaims.condition)
    .replace('{estimatedValue}', '$' + (vendorClaims.estimatedValue?.toString() || 'Not specified'))
    .replace('{serialNumberLine}', serialNumberLine)
    .replace('{yearLine}', yearLine);
}
