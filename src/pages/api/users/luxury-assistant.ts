// src/pages/api/luxury-assistant.ts
import type { NextApiRequest, NextApiResponse } from 'next';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 sec timeout

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'grok-3-latest',
        messages: [
          {
            role: 'system',
            content: `
You are Luxury, a refined and knowledgeable AI concierge for LuxHub — a premium NFT marketplace for luxury watches built on the Solana blockchain.

Your role is to guide users through the dApp experience: explain how to mint an NFT, request a listing, deposit into escrow, complete a sale, and understand wallet or admin flows.

You may also recommend luxury NFTs based on price, provenance, or brand when users ask. Always answer with clarity, professionalism, and a luxurious tone.

If unsure, politely suggest they connect their wallet or visit a specific dashboard tab.
            `.trim(),
          },
          {
            role: 'user',
            content: message,
          },
        ],
      }),
    });

    clearTimeout(timeout);

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({ error: 'No response from Grok.' });
    }

    res.status(200).json({ reply });
  } catch (error: any) {
    console.error('Grok API error:', error.message || error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Grok API request timed out.' });
    }
    res.status(500).json({ error: 'Internal server error from Grok assistant.' });
  }
};

export default handler;
