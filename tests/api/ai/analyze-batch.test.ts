// tests/api/ai/analyze-batch.test.ts
// Unit tests for batch image analysis API

import { createMocks } from 'node-mocks-http';

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Mock p-limit to run synchronously in tests
jest.mock('p-limit', () => {
  const limiter = () => (fn: () => Promise<any>) => fn();
  limiter.__esModule = true;
  limiter.default = limiter;
  return limiter;
});

// Set API key for tests
process.env.ANTHROPIC_API_KEY = 'test-key';

import handler from '@/pages/api/ai/analyze-batch';

const mockAnalysisResponse = {
  brand: 'Rolex',
  model: 'Submariner',
  title: 'Rolex Submariner Date',
  description: 'Classic diving watch',
  material: 'Stainless Steel',
  dialColor: 'Black',
  caseSize: '41mm',
  movement: 'Automatic',
  waterResistance: '300m',
  productionYear: '2023',
  condition: 'Excellent',
  features: 'Date, Rotating Bezel',
  country: 'Switzerland',
  estimatedPriceUSD: 12000,
  confidence: 90,
  authenticityIndicators: {
    logoAlignment: 'verified',
    dialFinish: 'genuine',
    crownDetails: 'Proper crown logo',
    movementVisible: false,
    caseback: 'Not visible',
    bracelet: 'Genuine Oyster bracelet',
  },
  conditionGrade: 'excellent',
  verificationFlags: [],
  overallConfidence: 88,
};

describe('POST /api/ai/analyze-batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 400 if imageUrls exceeds 25', async () => {
    const imageUrls = Array.from({ length: 26 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
    const { req, res } = createMocks({
      method: 'POST',
      body: { imageUrls },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain('25');
  });

  it('returns 400 if imageUrls is empty', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { imageUrls: [] },
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 if imageUrls is missing', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {},
    });

    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns per-image results with analysis for valid request', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockAnalysisResponse) }],
    });

    const imageUrls = [
      'https://cdn.example.com/watch1.jpg',
      'https://cdn.example.com/watch2.jpg',
      'https://cdn.example.com/watch3.jpg',
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { imageUrls },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.results).toHaveLength(3);

    for (const result of data.results) {
      expect(result.analysis).not.toBeNull();
      expect(result.analysis.brand).toBe('Rolex');
      expect(result.analysis.model).toBe('Submariner');
      expect(result.error).toBeUndefined();
    }

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it('handles partial failures — one image fails, others succeed', async () => {
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockAnalysisResponse) }],
      })
      .mockRejectedValueOnce(new Error('Image not accessible'))
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(mockAnalysisResponse) }],
      });

    const imageUrls = [
      'https://cdn.example.com/watch1.jpg',
      'https://cdn.example.com/broken.jpg',
      'https://cdn.example.com/watch3.jpg',
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { imageUrls },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.results).toHaveLength(3);

    // First succeeds
    expect(data.results[0].analysis).not.toBeNull();
    expect(data.results[0].error).toBeUndefined();

    // Second fails
    expect(data.results[1].analysis).toBeNull();
    expect(data.results[1].error).toBe('Image not accessible');

    // Third succeeds
    expect(data.results[2].analysis).not.toBeNull();
    expect(data.results[2].error).toBeUndefined();
  });
});
