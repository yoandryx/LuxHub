// src/utils/jupiterSwap.ts
// Jupiter V6 swap utility for SOL → USDC conversion during purchases
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

// ─── Constants ───────────────────────────────────────────────────
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const JUPITER_QUOTE_API = 'https://public.jupiterapi.com/quote';
const JUPITER_SWAP_API = 'https://public.jupiterapi.com/swap';

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

// ─── Types ───────────────────────────────────────────────────────
export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

export interface SwapResult {
  success: boolean;
  txSignature?: string;
  usdcReceived?: number; // in atomic units (6 decimals)
  error?: string;
}

// ─── Get Jupiter Quote ───────────────────────────────────────────
// Gets a quote for swapping inputMint → outputMint
// amount is in the input token's smallest unit (lamports for SOL)
export async function getJupiterQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  slippageBps: number = 100 // 1% default
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: inputMint.toBase58(),
    outputMint: outputMint.toBase58(),
    amount: Math.floor(amount).toString(),
    slippageBps: slippageBps.toString(),
    swapMode: 'ExactIn',
  });

  const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ─── Get SOL → USDC Quote ────────────────────────────────────────
// Convenience: get quote for swapping SOL to a specific USDC amount
// Returns the quote with the SOL amount needed (input) to get desired USDC (output)
export async function getSOLtoUSDCQuote(
  usdcAmountAtomic: number,
  slippageBps: number = 100
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint: SOL_MINT.toBase58(),
    outputMint: USDC_MINT.toBase58(),
    amount: Math.floor(usdcAmountAtomic).toString(),
    slippageBps: slippageBps.toString(),
    swapMode: 'ExactOut', // We want exactly this much USDC out
  });

  const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ─── Build Swap Transaction ──────────────────────────────────────
// Takes a Jupiter quote and returns a serialized VersionedTransaction
export async function buildSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: PublicKey
): Promise<VersionedTransaction> {
  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPublicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter swap build failed: ${response.status} - ${errorText}`);
  }

  const { swapTransaction } = await response.json();
  const txBuf = Buffer.from(swapTransaction, 'base64');
  return VersionedTransaction.deserialize(txBuf);
}

// ─── Execute Full Swap ───────────────────────────────────────────
// Executes a Jupiter swap: gets quote → builds tx → signs → sends
export async function executeSwap(
  connection: Connection,
  wallet: {
    publicKey: PublicKey;
    signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  },
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  slippageBps: number = 100
): Promise<SwapResult> {
  try {
    // 1. Get quote
    const quote = await getJupiterQuote(inputMint, outputMint, amount, slippageBps);

    // 2. Build transaction
    const swapTx = await buildSwapTransaction(quote, wallet.publicKey);

    // 3. Sign
    const signedTx = await wallet.signTransaction(swapTx);

    // 4. Send and confirm
    const txSignature = await connection.sendTransaction(signedTx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // 5. Confirm
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: txSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });

    return {
      success: true,
      txSignature,
      usdcReceived: Number(quote.outAmount),
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Swap failed',
    };
  }
}

// ─── Balance Helpers ─────────────────────────────────────────────

// Get USDC balance for a wallet (returns atomic units, 6 decimals)
export async function getUSDCBalance(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(USDC_MINT, walletPubkey);
    const balance = await connection.getTokenAccountBalance(ata);
    return Number(balance.value.amount);
  } catch {
    return 0; // ATA doesn't exist = 0 balance
  }
}

// Get SOL balance (returns lamports)
export async function getSOLBalance(
  connection: Connection,
  walletPubkey: PublicKey
): Promise<number> {
  return connection.getBalance(walletPubkey);
}

// Check if wallet has enough to cover purchase
// Returns { sufficient, balance, needed, shortfall }
export async function checkSufficientFunds(
  connection: Connection,
  walletPubkey: PublicKey,
  paymentToken: 'SOL' | 'USDC',
  priceUsdcAtomic: number // price in USDC atomic units
): Promise<{
  sufficient: boolean;
  balance: number;
  needed: number;
  shortfall: number;
  balanceFormatted: string;
  neededFormatted: string;
}> {
  if (paymentToken === 'USDC') {
    const balance = await getUSDCBalance(connection, walletPubkey);
    const sufficient = balance >= priceUsdcAtomic;
    return {
      sufficient,
      balance,
      needed: priceUsdcAtomic,
      shortfall: sufficient ? 0 : priceUsdcAtomic - balance,
      balanceFormatted: `${(balance / 10 ** USDC_DECIMALS).toFixed(2)} USDC`,
      neededFormatted: `${(priceUsdcAtomic / 10 ** USDC_DECIMALS).toFixed(2)} USDC`,
    };
  }

  // For SOL: get a Jupiter quote to know how much SOL is needed
  const solBalance = await getSOLBalance(connection, walletPubkey);

  try {
    // ExactOut quote: how much SOL do I need for this much USDC?
    const quote = await getSOLtoUSDCQuote(priceUsdcAtomic, 100);
    const solNeeded = Number(quote.inAmount);
    // Add buffer for tx fees (~0.01 SOL)
    const solNeededWithFees = solNeeded + 10_000_000; // +0.01 SOL
    const sufficient = solBalance >= solNeededWithFees;

    return {
      sufficient,
      balance: solBalance,
      needed: solNeededWithFees,
      shortfall: sufficient ? 0 : solNeededWithFees - solBalance,
      balanceFormatted: `${(solBalance / 1e9).toFixed(4)} SOL`,
      neededFormatted: `~${(solNeededWithFees / 1e9).toFixed(4)} SOL`,
    };
  } catch {
    // If Jupiter quote fails, fall back to a rough estimate
    // This shouldn't block the user — they'll get a proper error at swap time
    return {
      sufficient: solBalance > 0,
      balance: solBalance,
      needed: 0,
      shortfall: 0,
      balanceFormatted: `${(solBalance / 1e9).toFixed(4)} SOL`,
      neededFormatted: 'Unable to estimate',
    };
  }
}

// ─── Ensure USDC ATA Exists ──────────────────────────────────────
// Returns the ATA address and an instruction to create it if needed
export async function ensureUsdcAta(
  connection: Connection,
  walletPubkey: PublicKey,
  payer: PublicKey
): Promise<{
  ata: PublicKey;
  instruction: ReturnType<typeof createAssociatedTokenAccountInstruction> | null;
}> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, walletPubkey);

  try {
    await connection.getTokenAccountBalance(ata);
    return { ata, instruction: null }; // Already exists
  } catch {
    // ATA doesn't exist, create it
    const instruction = createAssociatedTokenAccountInstruction(
      payer,
      ata,
      walletPubkey,
      USDC_MINT
    );
    return { ata, instruction };
  }
}

// ─── USD to USDC Atomic Units ────────────────────────────────────
export function usdToUsdcAtomic(usdAmount: number): number {
  return Math.round(usdAmount * 10 ** USDC_DECIMALS);
}

export function usdcAtomicToUsd(atomicAmount: number): number {
  return atomicAmount / 10 ** USDC_DECIMALS;
}
