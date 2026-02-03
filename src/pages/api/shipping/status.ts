// src/pages/api/shipping/status.ts
// Check EasyPost configuration status
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  isConfigured,
  getMode,
  PARCEL_PRESETS,
  TEST_ADDRESSES,
} from '../../../lib/shipping/easypost';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const configured = isConfigured();
    const mode = getMode();

    return res.status(200).json({
      success: true,
      configured,
      mode,
      features: {
        addressVerification: configured,
        rateComparison: true, // Always available (demo mode if not configured)
        labelGeneration: configured,
        tracking: configured,
        insurance: configured,
      },
      parcelPresets: Object.keys(PARCEL_PRESETS),
      testAddresses: mode === 'test' || mode === 'demo' ? TEST_ADDRESSES : null,
      message: configured
        ? `EasyPost is configured in ${mode} mode`
        : 'EasyPost API key not configured. Running in demo mode with simulated responses.',
    });
  } catch (error: any) {
    console.error('[/api/shipping/status] Error:', error);
    return res.status(500).json({
      error: 'Failed to check shipping status',
      details: error?.message || 'Unknown error',
    });
  }
}
