// src/lib/ai/prompts/jewelry-verification.ts

export const JEWELRY_VERIFICATION_PROMPT = `You are an expert luxury jewelry authenticator and appraiser. Analyze this jewelry image to verify the vendor's claims and assess authenticity.

VENDOR CLAIMS:
Brand: {brand}
Model/Collection: {model}
Condition: {condition}
Estimated Value: {estimatedValue} USD
{serialNumberLine}
{yearLine}

ANALYSIS INSTRUCTIONS:

1. BRAND VERIFICATION
- Verify the brand/designer matches the piece
- Check for maker's marks, logos, signatures
- Identify brand-specific design elements (Cartier Love bracelet screws, Van Cleef Alhambra, Tiffany bean, etc.)

2. PIECE IDENTIFICATION
- Identify the collection/model if recognizable
- Verify against claimed specifications
- Check design elements, proportions, materials

3. AUTHENTICITY INDICATORS
Examine these key markers:
- Hallmarks and stamps (750 for 18k, 925 for sterling, etc.)
- Maker's marks and signatures
- Stone settings quality and security
- Metal finish consistency
- Clasp/closure quality and branding
- Engraving quality and depth
- Weight distribution (genuine pieces have proper heft)
- Stone quality and color consistency

4. MATERIAL ASSESSMENT
- Gold color and karat appearance
- Platinum vs white gold vs silver appearance
- Stone clarity and color (diamonds, gems)
- Pearl luster and nacre quality
- Enamel work quality

5. CONDITION ASSESSMENT
Grade the condition:
- MINT: New/unworn with all packaging
- EXCELLENT: Minimal signs of wear
- VERY_GOOD: Light wear, minor surface marks
- GOOD: Moderate wear, some scratches
- FAIR: Visible wear, may need service
- POOR: Significant damage or repair needed

6. VALUE ASSESSMENT
- Consider brand, materials, design, condition
- Reference current market values
- Flag unreasonable valuations

Return a JSON object with this EXACT structure (no markdown, just raw JSON):
{
  "claimsVerified": {
    "brand": {
      "verified": boolean,
      "confidence": 0-100,
      "notes": "Explanation of brand verification"
    },
    "model": {
      "verified": boolean,
      "confidence": 0-100,
      "notes": "Collection/model identification"
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
    "hallmarks": "Description of hallmarks found",
    "makersMarks": "Description of maker's marks",
    "stoneSettings": "Quality assessment of stone settings",
    "metalFinish": "Quality of metal work and finish",
    "clasps": "Assessment of closures/clasps",
    "engravings": "Quality of any engravings"
  },
  "conditionGrade": "mint|excellent|very_good|good|fair|poor",
  "conditionDetails": {
    "metal": "Condition of metal surfaces",
    "stones": "Condition of any gemstones",
    "clasps": "Condition of closures",
    "overall": "Overall piece condition"
  },
  "materialAssessment": {
    "primaryMetal": "Identified metal type",
    "stones": "Description of stones if present",
    "otherMaterials": "Any other materials identified"
  },
  "recommendedActions": ["List of recommended verification steps"],
  "listingApproved": boolean,
  "confidence": 0-100,
  "notes": "Overall assessment summary"
}

IMPORTANT:
- Jewelry authentication often requires physical inspection
- Flag for professional appraisal when value exceeds $5,000
- Recommend gemological certification for significant stones
- listingApproved should be false if authenticityScore < 65 or confidence < 55`;

export function buildJewelryVerificationPrompt(vendorClaims: {
  brand: string;
  model?: string;
  condition: string;
  estimatedValue?: number;
  serialNumber?: string;
  yearOfProduction?: string;
}): string {
  const serialNumberLine = vendorClaims.serialNumber
    ? `Reference/Serial: ${vendorClaims.serialNumber}`
    : '';
  const yearLine = vendorClaims.yearOfProduction ? `Year: ${vendorClaims.yearOfProduction}` : '';

  return JEWELRY_VERIFICATION_PROMPT.replace('{brand}', vendorClaims.brand)
    .replace('{model}', vendorClaims.model || 'Not specified')
    .replace('{condition}', vendorClaims.condition)
    .replace('{estimatedValue}', '$' + (vendorClaims.estimatedValue?.toString() || 'Not specified'))
    .replace('{serialNumberLine}', serialNumberLine)
    .replace('{yearLine}', yearLine);
}
