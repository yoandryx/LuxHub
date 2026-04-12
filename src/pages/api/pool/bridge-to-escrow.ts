// src/pages/api/pool/bridge-to-escrow.ts
// POST /api/pool/bridge-to-escrow
// Admin-gated endpoint that triggers the SOL->USDC swap + exchange bridge
// for a graduated pool. Thin wrapper around poolBridgeService.bridgeToEscrow.
//
// Request body: { poolId: string, options?: { autoApprove?, slippageBps?, onlyDirectRoutes? } }
// Requires wallet query param or x-wallet-address header for admin auth.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminConfig } from '@/lib/config/adminConfig';
import { bridgeToEscrow } from '@/lib/services/poolBridgeService';
import { withErrorMonitoring } from '@/lib/monitoring/errorHandler';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Admin auth: check wallet from header or body
  const wallet =
    (req.headers['x-wallet-address'] as string) ||
    req.body?.wallet ||
    (req.query.wallet as string);

  if (!wallet) {
    return res.status(401).json({ error: 'Missing wallet for admin authentication' });
  }

  const adminConfig = getAdminConfig();
  if (!adminConfig.isAdmin(wallet)) {
    return res.status(401).json({ error: 'Unauthorized: admin wallet required' });
  }

  const { poolId, options } = req.body || {};

  if (!poolId || typeof poolId !== 'string') {
    return res.status(400).json({ error: 'Missing required field: poolId' });
  }

  try {
    const result = await bridgeToEscrow({
      poolId,
      adminWallet: wallet,
      options,
    });
    return res.status(200).json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[bridge-to-escrow] Error:', message);
    return res.status(400).json({ error: message });
  }
}

export default withErrorMonitoring(handler);
