// src/pages/api/ai/verify-listing.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { aiLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { validateBody } from '@/lib/middleware/validate';
import { VerifyListingSchema, type VerifyListingInput } from '@/lib/validation/schemas';
import {
  buildVerificationPrompt,
  getApprovalThresholds,
  getRecommendedAuthServices,
  type LuxuryCategory,
} from '@/lib/ai/prompts';

// Lazy initialization to avoid errors when API key is not set
let anthropic: any = null;

function getAnthropicClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    const Anthropic = require('@anthropic-ai/sdk').default;
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return anthropic;
}

interface VerificationResult {
  success: boolean;
  verified: boolean;
  confidence: number;
  category: LuxuryCategory;
  claimsVerified: {
    brand: { verified: boolean; confidence: number; notes: string };
    model?: { verified: boolean; confidence: number; notes: string };
    condition: { verified: boolean; suggestedCondition: string; notes: string };
    value: { reasonable: boolean; marketRange: [number, number]; notes: string };
  };
  authenticityScore: number;
  authenticityFlags: string[];
  recommendedActions: string[];
  listingApproved: boolean;
  categorySpecificAnalysis?: Record<string, unknown>;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { imageUrl, category, vendorClaims, additionalImages } = req.body as VerifyListingInput;

    // Build the verification prompt for this category
    const verificationPrompt = buildVerificationPrompt(category, vendorClaims);
    const thresholds = getApprovalThresholds(category);

    // Prepare image content for the API
    const imageContent: any[] = [
      {
        type: 'image',
        source: {
          type: 'url',
          url: imageUrl,
        },
      },
    ];

    // Add additional images if provided
    if (additionalImages && additionalImages.length > 0) {
      for (const additionalUrl of additionalImages) {
        imageContent.push({
          type: 'image',
          source: {
            type: 'url',
            url: additionalUrl,
          },
        });
      }
    }

    // Add the text prompt
    imageContent.push({
      type: 'text',
      text: verificationPrompt,
    });

    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: imageContent,
        },
      ],
    });

    // Extract the text response
    const textContent = message.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse the JSON response
    let aiResponse: any;
    try {
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/```json?\n?/g, '')
          .replace(/```$/g, '')
          .trim();
      }
      aiResponse = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('Failed to parse AI response:', textContent.text);
      throw new Error('Failed to parse AI verification response');
    }

    // Calculate listing approval based on thresholds
    const authenticityScore = aiResponse.authenticityScore || 0;
    const confidence = aiResponse.confidence || aiResponse.overallConfidence || 0;
    const listingApproved =
      authenticityScore >= thresholds.minAuthenticityScore &&
      confidence >= thresholds.minConfidence;

    // Get recommended actions
    let recommendedActions = aiResponse.recommendedActions || [];

    // Add professional authentication recommendation for high-value items
    if (vendorClaims.estimatedValue && vendorClaims.estimatedValue > 5000) {
      const authServices = getRecommendedAuthServices(category);
      if (!recommendedActions.includes('Professional authentication recommended')) {
        recommendedActions.push('Professional authentication recommended for high-value listing');
        recommendedActions.push(`Suggested services: ${authServices.slice(0, 2).join(', ')}`);
      }
    }

    // Build the verification result
    const result: VerificationResult = {
      success: true,
      verified: listingApproved,
      confidence: confidence,
      category: category,
      claimsVerified: {
        brand: aiResponse.claimsVerified?.brand || {
          verified: false,
          confidence: 0,
          notes: 'Unable to verify',
        },
        model: aiResponse.claimsVerified?.model,
        condition: aiResponse.claimsVerified?.condition || {
          verified: false,
          suggestedCondition: 'unknown',
          notes: 'Unable to assess',
        },
        value: aiResponse.claimsVerified?.value || {
          reasonable: false,
          marketRange: [0, 0],
          notes: 'Unable to assess',
        },
      },
      authenticityScore: authenticityScore,
      authenticityFlags: aiResponse.authenticityFlags || aiResponse.verificationFlags || [],
      recommendedActions: recommendedActions,
      listingApproved: listingApproved,
      categorySpecificAnalysis:
        aiResponse.authenticityIndicators ||
        aiResponse.conditionDetails ||
        aiResponse.artworkDetails ||
        aiResponse.collectibleDetails,
    };

    // Log for monitoring
    console.log(
      `[verify-listing] Category: ${category}, Brand: ${vendorClaims.brand}, ` +
        `Authenticity: ${authenticityScore}, Confidence: ${confidence}, Approved: ${listingApproved}`
    );

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[/api/ai/verify-listing] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to verify listing',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

// Apply validation, rate limiting, and error monitoring
export default validateBody(VerifyListingSchema)(aiLimiter(withErrorMonitoring(handler)));
