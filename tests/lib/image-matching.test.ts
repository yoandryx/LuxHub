// tests/lib/image-matching.test.ts
// Unit tests for image-to-row matching utility

import { matchImageToRow, matchAllImages } from '@/utils/imageMatching';

describe('matchImageToRow', () => {
  const rows = [
    { referenceNumber: '116520', model: 'Daytona', brand: 'Rolex' },
    { referenceNumber: '5711A', model: 'Nautilus', brand: 'Patek Philippe' },
    { referenceNumber: '15500ST', model: 'Royal Oak', brand: 'Audemars Piguet' },
    { referenceNumber: 'RM11-03', model: 'RM 11-03', brand: 'Richard Mille' },
    { referenceNumber: '310.30.42', model: 'Speedmaster', brand: 'Omega' },
  ];

  it('Tier 1: matches exact reference number in filename (confidence 0.95)', () => {
    const result = matchImageToRow('REF-116520.jpg', rows);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBe(0);
    expect(result!.confidence).toBe(0.95);
  });

  it('Tier 1: matches reference number case-insensitively', () => {
    const result = matchImageToRow('watch_5711a_front.png', rows);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBe(1);
    expect(result!.confidence).toBe(0.95);
  });

  it('Tier 2: matches model name substring in filename (confidence 0.8)', () => {
    const result = matchImageToRow('submariner-black.png', [
      { referenceNumber: '124060', model: 'Submariner', brand: 'Rolex' },
    ]);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBe(0);
    expect(result!.confidence).toBe(0.8);
  });

  it('Tier 2: matches model name case-insensitively', () => {
    const result = matchImageToRow('nautilus-blue-dial.jpg', rows);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBe(1);
    expect(result!.confidence).toBe(0.8);
  });

  it('Tier 3: matches numeric index in filename (confidence 0.6)', () => {
    const result = matchImageToRow('watch_3.jpg', rows);
    expect(result).not.toBeNull();
    expect(result!.rowIndex).toBe(2);
    expect(result!.confidence).toBe(0.6);
  });

  it('returns null when no match is found', () => {
    const result = matchImageToRow('random.jpg', rows);
    expect(result).toBeNull();
  });

  it('returns null for numeric index out of range', () => {
    const result = matchImageToRow('watch_99.jpg', rows);
    expect(result).toBeNull();
  });

  it('ignores model names shorter than 3 characters', () => {
    const shortModelRows = [{ referenceNumber: 'XYZ', model: 'AP', brand: 'Test' }];
    // "AP" is only 2 chars, should not match tier 2
    const result = matchImageToRow('ap-photo.jpg', shortModelRows);
    // Should still not match tier 2 — might match tier 3 or return null
    if (result) {
      expect(result.confidence).not.toBe(0.8);
    }
  });
});

describe('matchAllImages', () => {
  const rows = [
    { referenceNumber: '116520', model: 'Daytona', brand: 'Rolex' },
    { referenceNumber: '5711A', model: 'Nautilus', brand: 'Patek Philippe' },
    { referenceNumber: '15500ST', model: 'Royal Oak', brand: 'Audemars Piguet' },
  ];

  it('maps array of filenames to row indices', () => {
    const filenames = ['REF-116520.jpg', 'nautilus-side.png', 'random.jpg'];
    const results = matchAllImages(filenames, rows);

    expect(results).toHaveLength(3);

    expect(results[0].filename).toBe('REF-116520.jpg');
    expect(results[0].rowIndex).toBe(0);
    expect(results[0].confidence).toBe(0.95);

    expect(results[1].filename).toBe('nautilus-side.png');
    expect(results[1].rowIndex).toBe(1);
    expect(results[1].confidence).toBe(0.8);

    expect(results[2].filename).toBe('random.jpg');
    expect(results[2].rowIndex).toBeNull();
    expect(results[2].confidence).toBe(0);
  });

  it('returns empty array for empty filenames', () => {
    const results = matchAllImages([], rows);
    expect(results).toHaveLength(0);
  });
});
