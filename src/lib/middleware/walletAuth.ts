// src/lib/middleware/walletAuth.ts
// Middleware for verifying wallet ownership via signed messages
import type { NextApiRequest, NextApiResponse, NextApiHandler } from 'next';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

// In-memory nonce store (use Redis in production for multi-instance)
const nonceStore = new Map<string, { nonce: string; expires: number }>();

// Nonce expiry time (5 minutes)
const NONCE_EXPIRY_MS = 5 * 60 * 1000;

// Clean expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (value.expires < now) {
      nonceStore.delete(key);
    }
  }
}, 60 * 1000); // Every minute

/**
 * Generate a nonce for wallet authentication
 * Client must sign this nonce to prove wallet ownership
 */
export function generateNonce(wallet: string): string {
  const nonce = `LuxHub-Auth-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  nonceStore.set(wallet, {
    nonce,
    expires: Date.now() + NONCE_EXPIRY_MS,
  });
  return nonce;
}

/**
 * Verify a wallet signature
 * @param wallet - The wallet public key (base58)
 * @param signature - The signature (base58)
 * @param message - The message that was signed
 * @returns true if signature is valid
 */
export function verifyWalletSignature(wallet: string, signature: string, message: string): boolean {
  try {
    const publicKey = new PublicKey(wallet);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
  } catch (error) {
    console.error('[walletAuth] Signature verification failed:', error);
    return false;
  }
}

/**
 * Verify wallet ownership using nonce-based authentication
 * @param wallet - The wallet public key
 * @param signature - Signature of the nonce
 * @returns true if wallet ownership is verified
 */
export function verifyWalletOwnership(wallet: string, signature: string): boolean {
  const storedNonce = nonceStore.get(wallet);

  if (!storedNonce) {
    console.warn('[walletAuth] No nonce found for wallet:', wallet);
    return false;
  }

  if (storedNonce.expires < Date.now()) {
    nonceStore.delete(wallet);
    console.warn('[walletAuth] Nonce expired for wallet:', wallet);
    return false;
  }

  const isValid = verifyWalletSignature(wallet, signature, storedNonce.nonce);

  if (isValid) {
    // Delete nonce after successful verification (prevent replay)
    nonceStore.delete(wallet);
  }

  return isValid;
}

/**
 * Get the current nonce for a wallet (if exists and not expired)
 */
export function getNonce(wallet: string): string | null {
  const stored = nonceStore.get(wallet);
  if (!stored || stored.expires < Date.now()) {
    return null;
  }
  return stored.nonce;
}

export interface AuthenticatedRequest extends NextApiRequest {
  wallet: string;
}

/**
 * Middleware that requires wallet signature verification
 *
 * Client must include headers:
 * - x-wallet-address: The wallet public key (base58)
 * - x-wallet-signature: Signature of the nonce (base58)
 *
 * For GET requests, can also use query params:
 * - wallet: The wallet public key
 * - signature: Signature of the nonce
 */
export function withWalletAuth(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Extract wallet and signature from headers or query/body
    const wallet =
      (req.headers['x-wallet-address'] as string) ||
      (req.method === 'GET' ? (req.query.wallet as string) : req.body?.wallet);

    const signature =
      (req.headers['x-wallet-signature'] as string) ||
      (req.method === 'GET' ? (req.query.signature as string) : req.body?.signature);

    if (!wallet) {
      return res.status(401).json({
        error: 'Wallet address required',
        code: 'WALLET_REQUIRED',
      });
    }

    // Validate wallet format
    try {
      new PublicKey(wallet);
    } catch {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        code: 'INVALID_WALLET',
      });
    }

    if (!signature) {
      // If no signature, generate and return a nonce for the client to sign
      const nonce = generateNonce(wallet);
      return res.status(401).json({
        error: 'Signature required',
        code: 'SIGNATURE_REQUIRED',
        nonce,
        message: 'Sign this nonce with your wallet and include in x-wallet-signature header',
      });
    }

    // Verify the signature
    if (!verifyWalletOwnership(wallet, signature)) {
      return res.status(401).json({
        error: 'Invalid or expired signature',
        code: 'INVALID_SIGNATURE',
        hint: 'Request a new nonce and sign it with your wallet',
      });
    }

    // Attach verified wallet to request
    (req as AuthenticatedRequest).wallet = wallet;

    return handler(req, res);
  };
}

/**
 * Lightweight middleware that validates wallet format but doesn't require signature
 * Use for less sensitive endpoints where you want to know the wallet but don't need proof
 */
export function withWalletValidation(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const wallet =
      (req.headers['x-wallet-address'] as string) ||
      (req.method === 'GET' ? (req.query.wallet as string) : req.body?.wallet);

    if (!wallet) {
      return res.status(401).json({
        error: 'Wallet address required',
        code: 'WALLET_REQUIRED',
      });
    }

    try {
      new PublicKey(wallet);
    } catch {
      return res.status(400).json({
        error: 'Invalid wallet address format',
        code: 'INVALID_WALLET',
      });
    }

    (req as AuthenticatedRequest).wallet = wallet;
    return handler(req, res);
  };
}

/**
 * API endpoint handler for getting a nonce
 * Client calls this first, then signs the nonce, then calls the protected endpoint
 */
export async function handleNonceRequest(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = req.method === 'GET' ? (req.query.wallet as string) : req.body?.wallet;

  if (!wallet) {
    return res.status(400).json({ error: 'Wallet address required' });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const nonce = generateNonce(wallet);

  return res.status(200).json({
    success: true,
    nonce,
    expiresIn: NONCE_EXPIRY_MS / 1000,
    message: `Sign this message to authenticate: ${nonce}`,
  });
}
