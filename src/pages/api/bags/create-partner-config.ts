// src/pages/api/bags/create-partner-config.ts
// One-time setup: Create LuxHub's partner config on Bags.
//
// A partner key enables LuxHub to earn 25% of Bags platform fees on every token
// launched with our partner config PDA. This is SEPARATE from the 1% creator fee.
//
// Only one partner key can be created per wallet.
//
// Bags API: POST /fee-share/partner-config/creation-tx { partnerWallet }
// Returns: { transaction (base58), blockhash } — sign and send to activate.
//
// After creation, derive the partnerConfig PDA and store it in BAGS_PARTNER_CONFIG_PDA env var.
// Then include partner + partnerConfig in every fee-share/config call.
//
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminConfig } from '../../../lib/config/adminConfig';
import { getTreasury } from '../../../lib/config/treasuryConfig';

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1';

interface CreatePartnerConfigRequest {
  adminWallet: string;
  partnerWallet?: string; // Defaults to BAGS_PARTNER_WALLET or LUXHUB_WALLET
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { adminWallet, partnerWallet } = req.body as CreatePartnerConfigRequest;

    if (!adminWallet) {
      return res.status(400).json({ error: 'Missing required field: adminWallet' });
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

    let finalPartnerWallet: string;
    try {
      finalPartnerWallet = partnerWallet || getTreasury('partner');
    } catch {
      return res.status(500).json({
        error: 'No partner wallet configured. Set TREASURY_PARTNER env var.',
      });
    }

    // Check if partner config already exists
    const existingPda = process.env.BAGS_PARTNER_CONFIG_PDA;
    if (existingPda) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        partnerWallet: finalPartnerWallet,
        partnerConfigPda: existingPda,
        message:
          'Partner config PDA already set in environment. If this is wrong, remove BAGS_PARTNER_CONFIG_PDA and retry.',
      });
    }

    // Create partner config transaction via Bags API
    const response = await fetch(`${BAGS_API_BASE}/fee-share/partner-config/creation-tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': bagsApiKey,
      },
      body: JSON.stringify({ partnerWallet: finalPartnerWallet }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 400 might mean config already exists
      if (response.status === 400) {
        return res.status(400).json({
          error: 'Partner config may already exist for this wallet',
          details: errorData,
          hint: 'Only one partner key can be created per wallet. Check the Bags dashboard at dev.bags.fm.',
        });
      }
      return res.status(500).json({
        error: 'Failed to create partner config via Bags API',
        details: errorData,
      });
    }

    const result = await response.json();
    const data = result.response || result;

    return res.status(200).json({
      success: true,
      partnerWallet: finalPartnerWallet,
      transaction: data.transaction, // base58 encoded
      blockhash: data.blockhash,
      message: 'Partner config creation transaction ready. Sign and send to activate.',
      nextSteps: [
        'Sign the transaction with the partner wallet',
        'Send to Solana network and wait for confirmation',
        'After confirmation, derive the partner config PDA:',
        '  import { deriveBagsFeeShareV2PartnerConfigPda } from Bags SDK',
        '  OR check dev.bags.fm dashboard for the PDA',
        'Set BAGS_PARTNER_CONFIG_PDA=<pda> in your environment',
        'All future token launches will include the partner config for fee earning',
      ],
    });
  } catch (error: any) {
    console.error('[/api/bags/create-partner-config] Error:', error);
    return res.status(500).json({
      error: 'Failed to create partner config',
      details: error?.message || 'Unknown error',
    });
  }
}
