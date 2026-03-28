// /api/jupiter/swap — Server-side proxy for Jupiter swap API (avoids CORS)
import type { NextApiRequest, NextApiResponse } from 'next';

const JUPITER_SWAP_API = 'https://public.jupiterapi.com/swap';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    console.error('[jupiter/swap] Proxy error:', error.message);
    return res.status(500).json({ error: 'Jupiter swap proxy failed' });
  }
}
