// src/lib/services/txVerification.ts
// On-chain transaction verification — ensures payments actually happened before updating MongoDB
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '@/lib/solana/clusterConfig';
import { ProcessedTransaction } from '@/lib/models/ProcessedTransaction';

export interface TxVerificationResult {
  verified: boolean;
  error?: string;
  slot?: number;
  blockTime?: number;
  fee?: number;
}

/**
 * Verify that a transaction signature exists on-chain and is confirmed.
 * Call this BEFORE updating MongoDB state for any fund-moving operation.
 */
export async function verifyTransaction(txSignature: string): Promise<TxVerificationResult> {
  if (!txSignature || txSignature.length < 32) {
    return { verified: false, error: 'Invalid transaction signature' };
  }

  try {
    const connection = getConnection();

    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on-chain' };
    }

    if (tx.meta?.err) {
      return {
        verified: false,
        error: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
      };
    }

    return {
      verified: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
      fee: tx.meta?.fee,
    };
  } catch (error: any) {
    return { verified: false, error: error?.message || 'Verification failed' };
  }
}

/**
 * Verify a transaction AND check that a specific wallet was involved (as signer or account).
 */
export async function verifyTransactionForWallet(
  txSignature: string,
  expectedWallet: string
): Promise<TxVerificationResult> {
  if (!txSignature || txSignature.length < 32) {
    return { verified: false, error: 'Invalid transaction signature' };
  }

  try {
    const connection = getConnection();

    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on-chain' };
    }

    if (tx.meta?.err) {
      return { verified: false, error: `Transaction failed on-chain` };
    }

    // Check that the expected wallet is in the transaction's account keys
    const accountKeys = tx.transaction.message.getAccountKeys();
    const walletPk = new PublicKey(expectedWallet);
    let walletFound = false;

    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys.get(i)?.equals(walletPk)) {
        walletFound = true;
        break;
      }
    }

    if (!walletFound) {
      return { verified: false, error: 'Wallet not found in transaction accounts' };
    }

    return {
      verified: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
      fee: tx.meta?.fee,
    };
  } catch (error: any) {
    return { verified: false, error: error?.message || 'Verification failed' };
  }
}

// --- Enhanced TX Verification (SEC-03, SEC-04) ---

export interface EnhancedTxVerificationParams {
  txSignature: string;
  expectedWallet: string;
  expectedProgramId?: string;
  expectedDestination?: string; // escrow PDA or vault — MUST be provided for fund-moving endpoints
  expectedMint?: string; // Pass getClusterConfig().usdcMint for USDC payments
  expectedAmountLamports?: number;
  amountTolerancePercent?: number; // default 1%
  endpoint: string; // API endpoint name for replay tracking
}

export interface EnhancedTxVerificationResult {
  verified: boolean;
  error?: string;
  slot?: number;
  blockTime?: number;
  fee?: number;
  actualAmount?: number;
}

/**
 * Enhanced transaction verification with program, amount, mint, PDA destination, and replay checks.
 * Use this for ALL fund-moving endpoints instead of verifyTransaction/verifyTransactionForWallet.
 */
export async function verifyTransactionEnhanced(
  params: EnhancedTxVerificationParams
): Promise<EnhancedTxVerificationResult> {
  const {
    txSignature,
    expectedWallet,
    expectedProgramId,
    expectedDestination,
    expectedMint,
    expectedAmountLamports,
    amountTolerancePercent = 1,
    endpoint,
  } = params;

  // Step 1: Basic validation
  if (!txSignature || txSignature.length < 32) {
    return { verified: false, error: 'Invalid transaction signature' };
  }

  try {
    // Step 2: Replay prevention — check if already processed
    const existing = await ProcessedTransaction.findOne({ txSignature });
    if (existing) {
      return { verified: false, error: 'Transaction already processed (replay rejected)' };
    }

    // Step 3: Fetch transaction from chain
    const connection = getConnection();
    const tx = await connection.getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on-chain' };
    }

    if (tx.meta?.err) {
      return {
        verified: false,
        error: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`,
      };
    }

    // Step 4: Verify expected wallet is a signer/account
    const accountKeys = tx.transaction.message.getAccountKeys();
    let walletFound = false;
    const accountKeyStrings: string[] = [];

    for (let i = 0; i < accountKeys.length; i++) {
      const key = accountKeys.get(i);
      if (key) {
        const keyStr = key.toBase58();
        accountKeyStrings.push(keyStr);
        if (keyStr === expectedWallet) {
          walletFound = true;
        }
      }
    }

    if (!walletFound) {
      return { verified: false, error: 'Expected wallet not found as signer in transaction' };
    }

    // Step 5: Verify expected program was invoked
    if (expectedProgramId) {
      const instructions = tx.transaction.message.compiledInstructions || [];
      let programInvoked = false;

      for (const ix of instructions) {
        const programKey = accountKeys.get(ix.programIdIndex);
        if (programKey && programKey.toBase58() === expectedProgramId) {
          programInvoked = true;
          break;
        }
      }

      if (!programInvoked) {
        return {
          verified: false,
          error: `Expected program ${expectedProgramId} not invoked in transaction`,
        };
      }
    }

    // Step 6: Verify transfer destination and amount
    let actualAmount: number | undefined;
    if (expectedAmountLamports !== undefined || expectedMint || expectedDestination) {
      const preTokenBalances = tx.meta?.preTokenBalances || [];
      const postTokenBalances = tx.meta?.postTokenBalances || [];

      if (expectedMint) {
        // SPL token path (USDC)
        if (expectedDestination) {
          const destPost = postTokenBalances.find(
            (b: any) => b.mint === expectedMint && b.owner === expectedDestination
          );
          const destPre = preTokenBalances.find(
            (b: any) => b.mint === expectedMint && b.owner === expectedDestination
          );
          const postAmt = destPost?.uiTokenAmount?.amount
            ? parseInt(destPost.uiTokenAmount.amount)
            : 0;
          const preAmt = destPre?.uiTokenAmount?.amount
            ? parseInt(destPre.uiTokenAmount.amount)
            : 0;
          actualAmount = postAmt - preAmt;

          if (actualAmount <= 0) {
            return {
              verified: false,
              error: `Expected destination ${expectedDestination} did not receive ${expectedMint} tokens`,
            };
          }
        }
      } else {
        // Native SOL transfer path — MUST also verify destination if provided
        if (expectedDestination) {
          const destIndex = accountKeyStrings.indexOf(expectedDestination);
          if (destIndex < 0 || !tx.meta) {
            return {
              verified: false,
              error: `Expected destination ${expectedDestination} not found in transaction`,
            };
          }
          const destPreBal = tx.meta.preBalances[destIndex];
          const destPostBal = tx.meta.postBalances[destIndex];
          actualAmount = destPostBal - destPreBal;

          if (actualAmount <= 0) {
            return {
              verified: false,
              error: `Expected destination ${expectedDestination} did not receive SOL`,
            };
          }
        } else {
          // Fallback: compute from sender's balance change
          const walletIndex = accountKeyStrings.indexOf(expectedWallet);
          if (walletIndex >= 0 && tx.meta) {
            const preBal = tx.meta.preBalances[walletIndex];
            const postBal = tx.meta.postBalances[walletIndex];
            actualAmount = preBal - postBal - (tx.meta.fee || 0);
          }
        }
      }

      // Verify amount within tolerance
      if (expectedAmountLamports !== undefined && actualAmount !== undefined) {
        const tolerance = expectedAmountLamports * (amountTolerancePercent / 100);
        if (Math.abs(actualAmount - expectedAmountLamports) > tolerance) {
          return {
            verified: false,
            error: `Amount mismatch: expected ${expectedAmountLamports}, got ${actualAmount} (tolerance: ${amountTolerancePercent}%)`,
            actualAmount,
          };
        }
      }
    }

    // Step 7: Record processed transaction (replay prevention)
    try {
      await ProcessedTransaction.create({
        txSignature,
        endpoint,
        wallet: expectedWallet,
        amount: actualAmount,
      });
    } catch (err: any) {
      // E11000 duplicate key = another request processed this tx concurrently (race condition)
      if (err?.code === 11000 || err?.message?.includes('E11000')) {
        return { verified: false, error: 'Transaction already processed (replay rejected)' };
      }
      // Other DB errors — log but don't block verification
      console.error('[txVerification] Failed to record processed tx:', err?.message);
    }

    return {
      verified: true,
      slot: tx.slot,
      blockTime: tx.blockTime || undefined,
      fee: tx.meta?.fee,
      actualAmount,
    };
  } catch (error: any) {
    return { verified: false, error: error?.message || 'Enhanced verification failed' };
  }
}
