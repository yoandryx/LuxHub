// src/pages/api/ai/analyze-batch.ts
// Batch image analysis endpoint — processes up to 25 watch images concurrently
import type { NextApiRequest, NextApiResponse } from 'next';

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
  authenticityIndicators: AuthenticityIndicators;
  conditionGrade: 'unworn' | 'excellent' | 'very_good' | 'good' | 'fair';
  verificationFlags: string[];
  overallConfidence: number;
}

const WATCH_ANALYSIS_PROMPT = `Analyze this luxury watch image and provide detailed information for an NFT marketplace listing with authenticity assessment.

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
  "conditionGrade": "unworn|excellent|very_good|good|fair",
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
- unworn: Never worn, with tags, perfect condition
- excellent: Minimal wear, no visible scratches
- very_good: Light wear, minor hairlines
- good: Moderate wear, some scratches
- fair: Heavy wear, visible damage or significant issues

Be specific and accurate. If you notice any authenticity concerns, add them to verificationFlags.`;

async function analyzeOneImage(imageUrl: string): Promise<WatchAnalysis> {
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
            source: { type: 'url', url: imageUrl },
          },
          { type: 'text', text: WATCH_ANALYSIS_PROMPT },
        ],
      },
    ],
  });

  const textContent = message.content.find((c: any) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from AI');
  }

  let jsonText = textContent.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText
      .replace(/```json?\n?/g, '')
      .replace(/```$/g, '')
      .trim();
  }

  const parsed = JSON.parse(jsonText);

  const estimatedPriceUSD = parsed.estimatedPriceUSD || 0;

  return {
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
    estimatedPriceUSD,
    estimatedPriceSol: 0, // Will be calculated client-side with live SOL price
    confidence: parsed.confidence || 50,
    authenticityIndicators: parsed.authenticityIndicators || {
      logoAlignment: 'unknown',
      dialFinish: 'unknown',
      crownDetails: 'Not assessed',
      movementVisible: false,
      caseback: 'Not visible',
      bracelet: 'Not assessed',
    },
    conditionGrade: (() => {
      const grade = parsed.conditionGrade || 'good';
      if (grade === 'mint') return 'unworn' as const;
      if (grade === 'poor') return 'fair' as const;
      return grade;
    })(),
    verificationFlags: parsed.verificationFlags || [],
    overallConfidence: parsed.overallConfidence || parsed.confidence || 50,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { imageUrls } = req.body;

  if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return res.status(400).json({ success: false, error: 'imageUrls is required and must be a non-empty array' });
  }

  if (imageUrls.length > 25) {
    return res.status(400).json({ success: false, error: 'Maximum 25 images per batch' });
  }

  try {
    // Dynamic import for p-limit (ESM module)
    const pLimit = (await import('p-limit')).default;
    const limit = pLimit(3);

    const results = await Promise.all(
      imageUrls.map((imageUrl: string) =>
        limit(async () => {
          try {
            const analysis = await analyzeOneImage(imageUrl);
            return { imageUrl, analysis, error: undefined };
          } catch (err: any) {
            console.error(`Failed to analyze image ${imageUrl}:`, err.message);
            return { imageUrl, analysis: null, error: err.message || 'Analysis failed' };
          }
        })
      )
    );

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error('Batch Analysis Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze batch',
    });
  }
}

export default handler;
