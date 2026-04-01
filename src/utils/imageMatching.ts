// src/utils/imageMatching.ts
// Shared image-to-row matching utility for bulk upload
// Pure function — no dependencies, usable in both API routes and React components

export interface MatchResult {
  rowIndex: number;
  confidence: number;
}

/**
 * Match an image filename to a row in the inventory data.
 *
 * Matching tiers:
 *   Tier 1: Exact reference number in filename (confidence 0.95)
 *   Tier 2: Model name substring in filename (confidence 0.8)
 *   Tier 3: Numeric index in filename matching row order (confidence 0.6)
 *
 * Returns null if no match is found.
 */
export function matchImageToRow(
  filename: string,
  rows: any[]
): MatchResult | null {
  // Strip file extension and lowercase for comparison
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();

  // Tier 1: Exact reference number match
  for (let i = 0; i < rows.length; i++) {
    const refNum = rows[i]?.referenceNumber;
    if (refNum && stem.includes(refNum.toString().toLowerCase())) {
      return { rowIndex: i, confidence: 0.95 };
    }
  }

  // Tier 2: Model name substring match
  for (let i = 0; i < rows.length; i++) {
    const model = rows[i]?.model;
    if (model && model.length >= 3 && stem.includes(model.toLowerCase())) {
      return { rowIndex: i, confidence: 0.8 };
    }
  }

  // Tier 3: Numeric index in filename (1-indexed)
  const numMatch = stem.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    // Interpret as 1-indexed row number
    const idx = num - 1;
    if (idx >= 0 && idx < rows.length) {
      return { rowIndex: idx, confidence: 0.6 };
    }
  }

  return null;
}

/**
 * Match an array of filenames to rows, returning results for each filename.
 */
export function matchAllImages(
  filenames: string[],
  rows: any[]
): Array<{ filename: string; rowIndex: number | null; confidence: number }> {
  return filenames.map((filename) => {
    const result = matchImageToRow(filename, rows);
    return {
      filename,
      rowIndex: result?.rowIndex ?? null,
      confidence: result?.confidence ?? 0,
    };
  });
}
