// src/pages/api/ai/map-csv.ts
// AI-powered CSV column mapping to LuxHub NFT schema fields
import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimit } from '@/lib/middleware/rateLimit';

// Rate limiter: 5 requests/minute per IP for CSV mapping
const csvMapLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'CSV mapping rate limit exceeded, please wait before trying again',
});

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

const NFT_SCHEMA_FIELDS = [
  'title',
  'brand',
  'model',
  'referenceNumber',
  'priceUSD',
  'description',
  'material',
  'dialColor',
  'caseSize',
  'movement',
  'waterResistance',
  'productionYear',
  'condition',
  'features',
  'country',
  'boxPapers',
  'limitedEdition',
  'certificate',
  'warrantyInfo',
  'provenance',
  'imageUrl',
];

async function callAIForMapping(
  headers: string[],
  sampleRows: any[][]
): Promise<{ mapping: Record<string, string>; confidence: Record<string, number>; unmapped: string[] }> {
  const client = getAnthropicClient();

  const prompt = `You are a data mapping assistant. Map CSV column headers to NFT schema fields.

NFT Schema Fields: ${NFT_SCHEMA_FIELDS.join(', ')}

CSV Headers: ${headers.join(', ')}

Sample data (first 3 rows):
${sampleRows
  .slice(0, 3)
  .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
  .join('\n')}

Return a JSON object with ONLY these fields (no markdown, just raw JSON):
{
  "mapping": { "csv_header": "nft_schema_field", ... },
  "confidence": { "csv_header": 0.0_to_1.0, ... },
  "unmapped": ["csv_headers_that_dont_map_to_any_field"]
}

Rules:
- Map each CSV header to the BEST matching NFT schema field
- confidence is 0.0-1.0 for each mapping (1.0 = exact match, 0.5 = fuzzy)
- Headers that don't match any field go in "unmapped"
- Be case-insensitive and handle common abbreviations (e.g., "ref" -> "referenceNumber", "price" -> "priceUSD")
- Only map to fields from the NFT Schema Fields list above`;

  const message = await client.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
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

  return JSON.parse(jsonText);
}

function applyMapping(
  allRows: any[][],
  headers: string[],
  mapping: Record<string, string>
): any[] {
  return allRows.map((row) => {
    const mapped: Record<string, any> = {};
    headers.forEach((header, idx) => {
      const schemaField = mapping[header];
      if (schemaField) {
        mapped[schemaField] = row[idx] ?? '';
      }
    });
    // Convert priceUSD to number if present
    if (mapped.priceUSD) {
      const num = parseFloat(String(mapped.priceUSD).replace(/[^0-9.]/g, ''));
      mapped.priceUSD = isNaN(num) ? 0 : num;
    }
    return mapped;
  });
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { headers, sampleRows, allRows } = req.body;

  if (!headers || !Array.isArray(headers) || headers.length === 0) {
    return res.status(400).json({ success: false, error: 'headers is required and must be a non-empty array' });
  }

  if (!sampleRows || !Array.isArray(sampleRows)) {
    return res.status(400).json({ success: false, error: 'sampleRows is required and must be an array' });
  }

  if (!allRows || !Array.isArray(allRows)) {
    return res.status(400).json({ success: false, error: 'allRows is required and must be an array' });
  }

  try {
    let aiResult: { mapping: Record<string, string>; confidence: Record<string, number>; unmapped: string[] };

    // Try AI call with one retry for malformed JSON
    try {
      aiResult = await callAIForMapping(headers, sampleRows);
    } catch (firstErr: any) {
      if (firstErr instanceof SyntaxError) {
        // Retry once for malformed JSON
        console.warn('AI returned malformed JSON, retrying...', firstErr.message);
        aiResult = await callAIForMapping(headers, sampleRows);
      } else {
        throw firstErr;
      }
    }

    const mappedRows = applyMapping(allRows, headers, aiResult.mapping);

    return res.status(200).json({
      success: true,
      mapping: aiResult.mapping,
      confidence: aiResult.confidence,
      unmapped: aiResult.unmapped,
      mappedRows,
    });
  } catch (error: any) {
    console.error('CSV Mapping Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to map CSV columns',
    });
  }
}

export default csvMapLimiter(handler);
