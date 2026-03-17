// src/pages/api/bags/claim-fees.ts
// Claim accumulated fees from Bags — supports both creator and partner claims.
//
// Two claim types:
//   1. "creator" — Claim creator fees for a specific token (1% of trade volume, split per fee-share config)
//      Bags API: POST /token-launch/claim-txs/v3 { feeClaimer, tokenMint }
//
//   2. "partner" — Claim partner fees across all tokens (25% of Bags platform fees)
//      Bags API: POST /fee-share/partner-config/claim-tx { partnerWallet }
//
// Both return an array of transactions. The LAST transaction withdraws funds from the vault.
// Sign and send all transactions sequentially — ensure sufficient SOL for intermediate tx fees.
//
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminConfig } from '../../../lib/config/adminConfig';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

interface ClaimFeesRequest {
  adminWallet: string;
  type: 'creator' | 'partner';
  // Required for creator claims
  tokenMint?: string;
  claimerWallet?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { adminWallet, type, tokenMint, claimerWallet } = req.body as ClaimFeesRequest;

    if (!adminWallet || !type) {
      return res.status(400).json({
        error: 'Missing required fields: adminWallet, type ("creator" or "partner")',
      });
    }

    const bagsApiKey = process.env.BAGS_API_KEY;
    if (!bagsApiKey) {
      return res.status(500).json({ error: 'BAGS_API_KEY not configured' });
    }

    // Verify admin
    const adminConfig = getAdminConfig();
    if (!adminConfig.isAdmin(adminWallet)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (type === 'creator') {
      // ── Creator fee claim (per token) ──
      if (!tokenMint) {
        return res.status(400).json({
          error: 'tokenMint required for creator claims',
        });
      }

      const feeClaimer =
        claimerWallet || process.env.NEXT_PUBLIC_LUXHUB_WALLET;

      if (!feeClaimer) {
        return res.status(500).json({
          error: 'No claimer wallet. Provide claimerWallet or set NEXT_PUBLIC_LUXHUB_WALLET.',
        });
      }

      const response = await fetch(`${BAGS_API_BASE}/token-launch/claim-txs/v3`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({ feeClaimer, tokenMint }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(500).json({
          error: 'Failed to get creator claim transactions',
          details: errorData,
        });
      }

      const result = await response.json();
      const claimTxs = result.response || result;
      const transactions = Array.isArray(claimTxs) ? claimTxs : [claimTxs];

      return res.status(200).json({
        success: true,
        claimType: 'creator',
        tokenMint,
        feeClaimer,
        transactions: transactions.map((tx: any, i: number) => ({
          step: i + 1,
          total: transactions.length,
          isWithdrawal: i === transactions.length - 1,
          transaction: tx.tx || tx.transaction,
          blockhash: tx.blockhash,
        })),
        transactionCount: transactions.length,
        message: `${transactions.length} claim transaction(s) ready. Sign and send sequentially.`,
        important:
          'The LAST transaction withdraws SOL to your wallet. Earlier transactions are setup steps — ensure you have SOL for their fees.',
      });
    } else if (type === 'partner') {
      // ── Partner fee claim (across all tokens) ──
      const partnerWallet =
        claimerWallet ||
        process.env.BAGS_PARTNER_WALLET ||
        process.env.NEXT_PUBLIC_LUXHUB_WALLET;

      if (!partnerWallet) {
        return res.status(500).json({
          error: 'No partner wallet configured.',
        });
      }

      const response = await fetch(`${BAGS_API_BASE}/fee-share/partner-config/claim-tx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': bagsApiKey,
        },
        body: JSON.stringify({ partnerWallet }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 400) {
          return res.status(200).json({
            success: true,
            claimType: 'partner',
            partnerWallet,
            transactions: [],
            transactionCount: 0,
            message: 'No unclaimed partner fees at this time.',
          });
        }
        return res.status(500).json({
          error: 'Failed to get partner claim transactions',
          details: errorData,
        });
      }

      const result = await response.json();
      const data = result.response || result;
      const transactions = data.transactions || [];

      return res.status(200).json({
        success: true,
        claimType: 'partner',
        partnerWallet,
        transactions: transactions.map((tx: any, i: number) => ({
          step: i + 1,
          total: transactions.length,
          isWithdrawal: i === transactions.length - 1,
          transaction: tx.transaction,
          blockhash: tx.blockhash,
        })),
        transactionCount: transactions.length,
        message:
          transactions.length > 0
            ? `${transactions.length} claim transaction(s) ready. Sign and send sequentially.`
            : 'No unclaimed partner fees.',
        important:
          transactions.length > 0
            ? 'The LAST transaction withdraws SOL to your wallet. Earlier transactions are setup steps.'
            : undefined,
      });
    } else {
      return res.status(400).json({
        error: `Invalid claim type: "${type}". Must be "creator" or "partner".`,
      });
    }
  } catch (error: any) {
    console.error('[/api/bags/claim-fees] Error:', error);
    return res.status(500).json({
      error: 'Failed to claim fees',
      details: error?.message || 'Unknown error',
    });
  }
}
