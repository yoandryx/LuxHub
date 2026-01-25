// src/pages/api/ai/analyze-watch.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { aiLimiter } from '@/lib/middleware/rateLimit';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';
import { validateBody } from '@/lib/middleware/validate';
import { AnalyzeImageSchema } from '@/lib/validation/schemas';

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

interface AuthenticityIndicators {
  logoAlignment: 'verified' | 'suspicious' | 'unknown';
  dialFinish: 'genuine' | 'suspicious' | 'unknown';
  crownDetails: string;
  movementVisible: boolean;
  caseback: string;
  bracelet: string;
}

interface WatchAnalysis {
  brand: string;
  model: string;
  title: string;
  description: string;
  material: string;
  dialColor: string;
  caseSize: string;
  movement: string;
  waterResistance: string;
  productionYear: string;
  condition: string;
  features: string;
  country: string;
  estimatedPriceUSD: number;
  estimatedPriceSol: number;
  confidence: number;
  // Enhanced authenticity fields
  authenticityIndicators: AuthenticityIndicators;
  conditionGrade: 'mint' | 'excellent' | 'very_good' | 'good' | 'fair' | 'poor';
  verificationFlags: string[];
  overallConfidence: number;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ success: false, error: 'Image URL is required' });
  }

  try {
    // Fetch SOL price for estimation
    let solPrice = 150;
    try {
      const priceRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        solPrice = priceData.solana.usd;
      }
    } catch {
      // Use default
    }

    const client = getAnthropicClient();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: imageUrl,
              },
            },
            {
              type: 'text',
              text: `Analyze this luxury watch image and provide detailed information for an NFT marketplace listing with authenticity assessment.

Return a JSON object with ONLY these fields (no markdown, just raw JSON):
{
  "brand": "Watch brand (e.g., Rolex, Patek Philippe, Audemars Piguet, Richard Mille, Omega, Cartier)",
  "model": "Specific model name (e.g., Submariner, Nautilus, Royal Oak, Daytona)",
  "title": "Full listing title combining brand and model with any special features",
  "description": "2-3 sentence compelling description for marketplace listing highlighting key features and appeal",
  "material": "Case/bracelet material (e.g., Stainless Steel, 18K Yellow Gold, Titanium, Ceramic)",
  "dialColor": "Dial color (e.g., Black, Blue, White, Green, Silver)",
  "caseSize": "Estimated case diameter (e.g., 40mm, 41mm, 36mm)",
  "movement": "Movement type (e.g., Automatic, Manual, Quartz)",
  "waterResistance": "Estimated water resistance (e.g., 100m, 300m, 50m)",
  "productionYear": "Estimated production year or range if identifiable",
  "condition": "Apparent condition description",
  "features": "Notable features comma-separated (e.g., Chronograph, Date, Moonphase, Rotating Bezel)",
  "country": "Country of origin (usually Switzerland for luxury watches)",
  "estimatedPriceUSD": number (estimated market value in USD),
  "confidence": number (0-100, your confidence in basic identification),

  "authenticityIndicators": {
    "logoAlignment": "verified|suspicious|unknown",
    "dialFinish": "genuine|suspicious|unknown",
    "crownDetails": "Description of crown appearance and any concerns",
    "movementVisible": boolean,
    "caseback": "Description of caseback if visible, or 'Not visible'",
    "bracelet": "Description of bracelet/strap condition and authenticity markers"
  },
  "conditionGrade": "mint|excellent|very_good|good|fair|poor",
  "verificationFlags": ["Array of any concerns or red flags noticed"],
  "overallConfidence": number (0-100, overall confidence including authenticity assessment)
}

AUTHENTICITY ASSESSMENT GUIDELINES:
- Check logo placement, font, and spacing for accuracy
- Assess dial finish quality (sunburst, matte, lacquer)
- Look for proper Cyclops magnification (2.5x for Rolex)
- Check crown proportions and logo engraving
- Assess bracelet link quality and clasp details
- Look for rehaut engraving (inner bezel ring) if visible
- Note any inconsistencies in finishing

CONDITION GRADING:
- mint: Unworn, with tags, perfect condition
- excellent: Minimal wear, no visible scratches
- very_good: Light wear, minor hairlines
- good: Moderate wear, some scratches
- fair: Heavy wear, visible damage
- poor: Significant damage or issues

Be specific and accurate. If you notice any authenticity concerns, add them to verificationFlags.`,
            },
          ],
        },
      ],
    });

    // Extract the text response
    const textContent = message.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse the JSON response
    let analysis: WatchAnalysis;
    try {
      let jsonText = textContent.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText
          .replace(/```json?\n?/g, '')
          .replace(/```$/g, '')
          .trim();
      }
      const parsed = JSON.parse(jsonText);

      // Convert USD to SOL
      const estimatedPriceUSD = parsed.estimatedPriceUSD || 0;
      const estimatedPriceSol = estimatedPriceUSD / solPrice;

      // Ensure all required fields have defaults
      analysis = {
        brand: parsed.brand || 'Unknown',
        model: parsed.model || 'Unknown',
        title: parsed.title || `${parsed.brand || 'Luxury'} Watch`,
        description: parsed.description || '',
        material: parsed.material || 'Unknown',
        dialColor: parsed.dialColor || 'Unknown',
        caseSize: parsed.caseSize || 'Unknown',
        movement: parsed.movement || 'Unknown',
        waterResistance: parsed.waterResistance || 'Unknown',
        productionYear: parsed.productionYear || 'Unknown',
        condition: parsed.condition || 'Unknown',
        features: parsed.features || '',
        country: parsed.country || 'Switzerland',
        estimatedPriceUSD: estimatedPriceUSD,
        estimatedPriceSol: Math.round(estimatedPriceSol * 100) / 100,
        confidence: parsed.confidence || 50,
        authenticityIndicators: parsed.authenticityIndicators || {
          logoAlignment: 'unknown',
          dialFinish: 'unknown',
          crownDetails: 'Not assessed',
          movementVisible: false,
          caseback: 'Not visible',
          bracelet: 'Not assessed',
        },
        conditionGrade: parsed.conditionGrade || 'good',
        verificationFlags: parsed.verificationFlags || [],
        overallConfidence: parsed.overallConfidence || parsed.confidence || 50,
      };
    } catch (parseErr) {
      console.error('Failed to parse AI response:', textContent.text);
      throw new Error('Failed to parse AI response');
    }

    return res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze image',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

// Apply rate limiting and error monitoring
export default aiLimiter(withErrorMonitoring(handler));
