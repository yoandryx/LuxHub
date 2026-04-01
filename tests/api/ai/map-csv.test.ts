// tests/api/ai/map-csv.test.ts
// Unit tests for CSV column mapping API

import { createMocks } from 'node-mocks-http';

// Mock Anthropic SDK
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

// Mock rate limiter to pass through
jest.mock('@/lib/middleware/rateLimit', () => ({
  rateLimit: () => (handler: any) => handler,
  aiLimiter: (handler: any) => handler,
  strictLimiter: (handler: any) => handler,
}));

jest.mock('@/lib/database/mongodb', () => jest.fn().mockResolvedValue(true));

// Set API key for tests
process.env.ANTHROPIC_API_KEY = 'test-key';

import handler from '@/pages/api/ai/map-csv';

const validMappingResponse = {
  mapping: { 'Brand Name': 'brand', 'Model': 'model', 'Ref #': 'referenceNumber', 'Price': 'priceUSD' },
  confidence: { 'Brand Name': 0.95, 'Model': 0.9, 'Ref #': 0.85, 'Price': 0.9 },
  unmapped: ['Notes'],
};

describe('POST /api/ai/map-csv', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(405);
  });

  it('returns 400 if headers missing from request body', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { sampleRows: [[]], allRows: [[]] },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
    expect(JSON.parse(res._getData()).error).toContain('headers');
  });

  it('returns 400 if sampleRows missing', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { headers: ['Brand'], allRows: [[]] },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns 400 if allRows missing', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { headers: ['Brand'], sampleRows: [[]] },
    });
    await handler(req as any, res as any);
    expect(res._getStatusCode()).toBe(400);
  });

  it('returns mapping object with confidence scores (mock Anthropic)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(validMappingResponse) }],
    });

    const headers = ['Brand Name', 'Model', 'Ref #', 'Price', 'Notes'];
    const sampleRows = [['Rolex', 'Submariner', '116610', '12000', 'Good condition']];
    const allRows = [
      ['Rolex', 'Submariner', '116610', '12000', 'Good condition'],
      ['Omega', 'Speedmaster', '311.30', '8000', 'Box and papers'],
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { headers, sampleRows, allRows },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.success).toBe(true);
    expect(data.mapping).toEqual(validMappingResponse.mapping);
    expect(data.confidence).toEqual(validMappingResponse.confidence);
    expect(data.unmapped).toEqual(['Notes']);
    expect(data.mappedRows).toHaveLength(2);
    expect(data.mappedRows[0].brand).toBe('Rolex');
    expect(data.mappedRows[0].model).toBe('Submariner');
  });

  it('handles malformed AI JSON response gracefully with retry', async () => {
    // First call returns invalid JSON, second returns valid
    mockCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify(validMappingResponse) }],
      });

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        headers: ['Brand Name'],
        sampleRows: [['Rolex']],
        allRows: [['Rolex']],
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(200);
    // Should have been called twice (initial + retry)
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('returns 500 on Anthropic API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        headers: ['Brand'],
        sampleRows: [['Rolex']],
        allRows: [['Rolex']],
      },
    });

    await handler(req as any, res as any);

    expect(res._getStatusCode()).toBe(500);
    expect(JSON.parse(res._getData()).error).toContain('API rate limit exceeded');
  });
});
