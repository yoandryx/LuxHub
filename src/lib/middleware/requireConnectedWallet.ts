// src/lib/middleware/requireConnectedWallet.ts
// Lightweight wallet gate for expensive public endpoints (AI, Arweave uploads).
//
// Requires the caller to send X-Wallet-Address with a valid base58 PublicKey
// belonging to either an admin (env ADMIN_WALLETS / SUPER_ADMIN_WALLETS) or
// an approved vendor (VendorProfile.approved = true).
//
// This is NOT cryptographic proof — a determined attacker could send any known
// approved wallet. The point is to stop generic bots cold and force any abuser
// to do meaningful work (find a valid approved wallet, then race the per-IP
// rate limit). Pair with rateLimit middleware for defense-in-depth.
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { PublicKey } from '@solana/web3.js';
import dbConnect from '../database/mongodb';
import VendorProfile from '../models/VendorProfile';
import { getAdminConfig } from '../config/adminConfig';

function readWallet(req: NextApiRequest): string | null {
  const headerWallet = req.headers['x-wallet-address'];
  if (typeof headerWallet === 'string' && headerWallet.trim()) {
    return headerWallet.trim();
  }
  if (Array.isArray(headerWallet) && headerWallet[0]) {
    return headerWallet[0].trim();
  }
  // Fallback to body (for JSON callers that prefer body over headers)
  if (req.body && typeof req.body === 'object' && typeof (req.body as any).wallet === 'string') {
    return (req.body as any).wallet.trim();
  }
  return null;
}

function isValidPublicKey(wallet: string): boolean {
  try {
    new PublicKey(wallet);
    return true;
  } catch {
    return false;
  }
}

export function requireConnectedWallet(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const wallet = readWallet(req);

    if (!wallet) {
      return res.status(401).json({
        error: 'Wallet required. Connect a wallet to use this feature.',
      });
    }

    if (!isValidPublicKey(wallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    // Admin shortcut — env-configured admins always pass without a DB lookup
    if (getAdminConfig().isAdmin(wallet)) {
      (req as any).wallet = wallet;
      (req as any).walletRole = 'admin';
      return handler(req, res);
    }

    // Otherwise must be an approved vendor
    try {
      await dbConnect();
      const vendor = await VendorProfile.findOne({ wallet, approved: true })
        .select('wallet approved')
        .lean();

      if (!vendor) {
        return res.status(403).json({
          error: 'Wallet not authorized. Apply to become a vendor at /vendor/apply.',
        });
      }

      (req as any).wallet = wallet;
      (req as any).walletRole = 'vendor';
      return handler(req, res);
    } catch (err) {
      console.error('[requireConnectedWallet] DB lookup error:', err);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}
