/**
 * LuxHub Devnet Pool Trading Simulator
 *
 * Generates wallets, funds them, and simulates realistic trading
 * patterns on a Bags bonding curve pool via the LuxHub API.
 *
 * Usage:
 *   npx ts-node scripts/simulate-pool-trading.ts \
 *     --pool-id <mongoId> \
 *     --master-key <path-to-keypair.json> \
 *     [--wallets 50] [--rounds 5] [--api-base http://localhost:3000]
 */

// ── Load environment ────────────────────────────────────────────────
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import {
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import * as fs from 'fs';

// ── ANSI colors ─────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

function log(msg: string) {
  console.log(`${C.dim}[${new Date().toISOString().slice(11, 19)}]${C.reset} ${msg}`);
}
function logHeader(msg: string) {
  console.log(`\n${C.bold}${C.magenta}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.magenta}  ${msg}${C.reset}`);
  console.log(`${C.bold}${C.magenta}${'═'.repeat(60)}${C.reset}\n`);
}
function logSuccess(msg: string) {
  log(`${C.green}[OK]${C.reset} ${msg}`);
}
function logError(msg: string) {
  log(`${C.red}[ERR]${C.reset} ${msg}`);
}
function logWarn(msg: string) {
  log(`${C.yellow}[WARN]${C.reset} ${msg}`);
}
function logInfo(msg: string) {
  log(`${C.cyan}[INFO]${C.reset} ${msg}`);
}

// ── CLI argument parsing ────────────────────────────────────────────
function parseArgs(): {
  poolId: string;
  wallets: number;
  rounds: number;
  masterKeyPath: string | null;
  apiBase: string;
} {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const poolId = get('--pool-id');
  if (!poolId) {
    console.error(`${C.red}${C.bold}ERROR: --pool-id <id> is required${C.reset}`);
    console.error(`\nUsage: npx ts-node scripts/simulate-pool-trading.ts --pool-id <mongoId> --master-key <keypair.json> [--wallets 50] [--rounds 5]`);
    process.exit(1);
  }

  return {
    poolId,
    wallets: parseInt(get('--wallets') || '50', 10),
    rounds: parseInt(get('--rounds') || '5', 10),
    masterKeyPath: get('--master-key') || null,
    apiBase: get('--api-base') || 'http://localhost:3000',
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function lamportsToSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

function loadKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const WALLETS_FILE = resolve(__dirname, '.test-wallets.json');
const RESULTS_FILE = resolve(__dirname, '.simulation-results.json');

interface WalletState {
  keypair: Keypair;
  address: string;
  tokenBalance: number; // track approximate token holdings
  totalBought: number;
  totalSold: number;
  trades: number;
}

interface TradeResult {
  wallet: string;
  action: 'BUY' | 'SELL';
  amountSol: number;
  success: boolean;
  error?: string;
  txSignature?: string;
  outputAmount?: string;
}

// ── API helpers ─────────────────────────────────────────────────────

async function apiGet(base: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(path, base);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GET ${path} failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

async function apiPost(base: string, path: string, body: Record<string, unknown>): Promise<any> {
  const resp = await fetch(new URL(path, base).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`POST ${path} failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

// ── Phase 0: Setup ──────────────────────────────────────────────────

async function setupConnection(): Promise<Connection> {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!endpoint) {
    logError('NEXT_PUBLIC_SOLANA_ENDPOINT not set in .env.local');
    process.exit(1);
  }
  const connection = new Connection(endpoint, 'confirmed');
  const version = await connection.getVersion();
  logSuccess(`Connected to Solana (version ${version['solana-core']})`);
  return connection;
}

// ── Phase 1: Generate Wallets ───────────────────────────────────────

function generateWallets(count: number): WalletState[] {
  // Check for existing wallets file
  if (fs.existsSync(WALLETS_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
      if (Array.isArray(saved) && saved.length >= count) {
        logInfo(`Reusing ${count} wallets from ${WALLETS_FILE}`);
        return saved.slice(0, count).map((s: { secretKey: number[] }) => {
          const kp = Keypair.fromSecretKey(Uint8Array.from(s.secretKey));
          return {
            keypair: kp,
            address: kp.publicKey.toBase58(),
            tokenBalance: 0,
            totalBought: 0,
            totalSold: 0,
            trades: 0,
          };
        });
      }
    } catch {
      logWarn('Could not load saved wallets, generating fresh ones');
    }
  }

  logInfo(`Generating ${count} new wallets...`);
  const wallets: WalletState[] = [];
  for (let i = 0; i < count; i++) {
    const kp = Keypair.generate();
    wallets.push({
      keypair: kp,
      address: kp.publicKey.toBase58(),
      tokenBalance: 0,
      totalBought: 0,
      totalSold: 0,
      trades: 0,
    });
  }

  // Save for reuse (store secret keys)
  const toSave = wallets.map((w) => ({
    address: w.address,
    secretKey: Array.from(w.keypair.secretKey),
  }));
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(toSave, null, 2));
  logSuccess(`Saved ${count} wallets to ${WALLETS_FILE}`);

  // Print first few
  wallets.slice(0, 5).forEach((w, i) => logInfo(`  Wallet #${i + 1}: ${w.address}`));
  if (count > 5) logInfo(`  ... and ${count - 5} more`);

  return wallets;
}

// ── Phase 2: Fund Wallets ───────────────────────────────────────────

async function fundWallets(
  connection: Connection,
  master: Keypair,
  wallets: WalletState[],
  solPerWallet: number = 0.05,
): Promise<void> {
  const masterBalance = await connection.getBalance(master.publicKey);
  const totalNeeded = wallets.length * solPerWallet;
  logInfo(`Master wallet: ${master.publicKey.toBase58()}`);
  logInfo(`Master balance: ${lamportsToSol(masterBalance)} SOL`);
  logInfo(`Need: ${totalNeeded.toFixed(4)} SOL (${wallets.length} x ${solPerWallet} SOL)`);

  if (masterBalance < solToLamports(totalNeeded + 0.01)) {
    logError(
      `Insufficient master balance. Need at least ${(totalNeeded + 0.01).toFixed(4)} SOL. ` +
        `Fund the master wallet: ${master.publicKey.toBase58()}`,
    );
    process.exit(1);
  }

  // Filter out wallets that already have enough balance
  const walletsToFund: WalletState[] = [];
  const balanceChecks = await Promise.all(
    wallets.map(async (w) => {
      try {
        const bal = await connection.getBalance(new PublicKey(w.address));
        return { wallet: w, balance: bal };
      } catch {
        return { wallet: w, balance: 0 };
      }
    }),
  );

  for (const { wallet, balance } of balanceChecks) {
    if (balance < solToLamports(solPerWallet * 0.5)) {
      walletsToFund.push(wallet);
    }
  }

  if (walletsToFund.length === 0) {
    logSuccess('All wallets already funded');
    return;
  }

  logInfo(`Funding ${walletsToFund.length} wallets (${wallets.length - walletsToFund.length} already funded)...`);

  // Batch 5 transfers per transaction
  const BATCH_SIZE = 5;
  let funded = 0;

  for (let i = 0; i < walletsToFund.length; i += BATCH_SIZE) {
    const batch = walletsToFund.slice(i, i + BATCH_SIZE);
    const tx = new Transaction();

    for (const w of batch) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: master.publicKey,
          toPubkey: new PublicKey(w.address),
          lamports: solToLamports(solPerWallet),
        }),
      );
    }

    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [master], {
        commitment: 'confirmed',
      });
      funded += batch.length;
      log(
        `${C.green}[FUND]${C.reset} Batch ${Math.floor(i / BATCH_SIZE) + 1}: ` +
          `${batch.length} wallets funded (${funded}/${walletsToFund.length}) | tx: ${sig.slice(0, 16)}...`,
      );
    } catch (err: any) {
      logError(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${err.message}`);
      // Try individual transfers as fallback
      for (const w of batch) {
        try {
          const singleTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: master.publicKey,
              toPubkey: new PublicKey(w.address),
              lamports: solToLamports(solPerWallet),
            }),
          );
          await sendAndConfirmTransaction(connection, singleTx, [master], {
            commitment: 'confirmed',
          });
          funded++;
        } catch (e: any) {
          logError(`  Failed to fund ${w.address}: ${e.message}`);
        }
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < walletsToFund.length) {
      await sleep(500);
    }
  }

  logSuccess(`Funded ${funded}/${walletsToFund.length} wallets with ${solPerWallet} SOL each`);
}

// ── Phase 3: Verify Pool ────────────────────────────────────────────

interface PoolInfo {
  _id: string;
  bagsTokenMint: string;
  name: string;
  targetAmountUSD: number;
  totalShares: number;
  sharePriceUSD: number;
  bondingCurveActive: boolean;
  currentBondingPrice: number;
}

async function verifyPool(apiBase: string, poolId: string): Promise<PoolInfo> {
  logInfo(`Fetching pool ${poolId}...`);

  const data = await apiGet(apiBase, `/api/pool/${poolId}`);
  const pool = data.pool || data;

  if (!pool.bagsTokenMint) {
    logError('Pool does not have a bagsTokenMint. Launch the token first via /api/bags/create-pool-token');
    process.exit(1);
  }

  const info: PoolInfo = {
    _id: pool._id,
    bagsTokenMint: pool.bagsTokenMint,
    name: pool.title || pool.name || `Pool ${poolId.slice(-6)}`,
    targetAmountUSD: pool.targetAmountUSD || 0,
    totalShares: pool.totalShares || 0,
    sharePriceUSD: pool.sharePriceUSD || 0,
    bondingCurveActive: pool.bondingCurveActive || false,
    currentBondingPrice: pool.currentBondingPrice || pool.sharePriceUSD || 0,
  };

  logSuccess(`Pool verified: ${info.name}`);
  logInfo(`  Token Mint: ${info.bagsTokenMint}`);
  logInfo(`  Target: $${info.targetAmountUSD.toFixed(2)}`);
  logInfo(`  Bonding Curve: ${info.bondingCurveActive ? 'Active' : 'Inactive'}`);
  logInfo(`  Current Price: $${info.currentBondingPrice.toFixed(6)}`);

  return info;
}

// ── Phase 4: Execute Trades ─────────────────────────────────────────

async function executeTrade(
  connection: Connection,
  apiBase: string,
  wallet: WalletState,
  poolId: string,
  poolMint: string,
  action: 'BUY' | 'SELL',
  amountSol: number,
): Promise<TradeResult> {
  const result: TradeResult = {
    wallet: wallet.address,
    action,
    amountSol,
    success: false,
  };

  try {
    // For BUY: input = SOL, output = pool token
    // For SELL: input = pool token, output = SOL
    const inputMint = action === 'BUY' ? SOL_MINT : poolMint;
    const outputMint = action === 'BUY' ? poolMint : SOL_MINT;

    // Convert SOL amount to lamports for the API
    const amountLamports = solToLamports(amountSol).toString();

    // Step 1: Get trade quote
    const quoteData = await apiGet(apiBase, '/api/bags/trade-quote', {
      poolId,
      inputMint,
      outputMint,
      amount: amountLamports,
      slippageBps: '300', // 3% slippage for devnet volatility
    });

    if (!quoteData.success) {
      throw new Error(`Quote failed: ${JSON.stringify(quoteData)}`);
    }

    result.outputAmount = quoteData.quote?.outputAmount;

    // Step 2: Build swap transaction
    const swapData = await apiPost(apiBase, '/api/bags/execute-trade', {
      poolId,
      inputMint,
      outputMint,
      amount: amountLamports,
      userWallet: wallet.address,
      slippageBps: '300',
    });

    if (!swapData.success || !swapData.transaction?.serialized) {
      throw new Error(`Swap build failed: ${JSON.stringify(swapData)}`);
    }

    // Step 3: Deserialize, sign, and send
    const serialized = swapData.transaction.serialized;
    const txBuffer = Buffer.from(serialized, 'base64');

    let txSignature: string;

    if (swapData.transaction.isVersioned) {
      // VersionedTransaction
      const vTx = VersionedTransaction.deserialize(txBuffer);
      vTx.sign([wallet.keypair]);
      txSignature = await connection.sendRawTransaction(vTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
    } else {
      // Legacy Transaction
      const tx = Transaction.from(txBuffer);
      tx.partialSign(wallet.keypair);
      txSignature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
    }

    // Step 4: Confirm
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      {
        signature: txSignature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed',
    );

    result.success = true;
    result.txSignature = txSignature;

    // Update wallet state
    if (action === 'BUY') {
      wallet.tokenBalance += parseFloat(result.outputAmount || '0');
      wallet.totalBought += amountSol;
    } else {
      wallet.tokenBalance = Math.max(0, wallet.tokenBalance - amountSol);
      wallet.totalSold += amountSol;
    }
    wallet.trades++;
  } catch (err: any) {
    result.error = err.message?.slice(0, 200);
  }

  return result;
}

async function simulateTrading(
  connection: Connection,
  apiBase: string,
  wallets: WalletState[],
  poolId: string,
  poolMint: string,
  rounds: number,
): Promise<TradeResult[]> {
  const allResults: TradeResult[] = [];
  let totalSuccesses = 0;
  let totalFailures = 0;
  let consecutiveFailures = 0;

  for (let round = 1; round <= rounds; round++) {
    logHeader(`ROUND ${round} / ${rounds}`);

    const roundWallets = shuffle(wallets);
    let roundSuccesses = 0;
    let roundFailures = 0;
    let roundVolume = 0;

    for (let i = 0; i < roundWallets.length; i++) {
      const wallet = roundWallets[i];

      // Decide action: BUY weighted early, SELL weighted late
      const buyProbability = 0.7 - (round - 1) * (0.4 / (rounds - 1 || 1));
      const hasTokens = wallet.tokenBalance > 0;
      const isBuy = !hasTokens || Math.random() < buyProbability;
      const action: 'BUY' | 'SELL' = isBuy ? 'BUY' : 'SELL';

      // Random amount: 0.005 - 0.03 SOL
      const amountSol = parseFloat(randomBetween(0.005, 0.03).toFixed(6));

      const result = await executeTrade(connection, apiBase, wallet, poolId, poolMint, action, amountSol);
      allResults.push(result);

      if (result.success) {
        roundSuccesses++;
        totalSuccesses++;
        consecutiveFailures = 0;
        roundVolume += amountSol;

        // Progress output every 10 trades
        if ((i + 1) % 10 === 0 || i === roundWallets.length - 1) {
          log(
            `${C.green}[TRADE]${C.reset} Round ${round} progress: ` +
              `${i + 1}/${roundWallets.length} | ` +
              `${C.green}${roundSuccesses} OK${C.reset} / ${C.red}${roundFailures} FAIL${C.reset} | ` +
              `Vol: ${roundVolume.toFixed(4)} SOL`,
          );
        }
      } else {
        roundFailures++;
        totalFailures++;
        consecutiveFailures++;

        if ((i + 1) % 10 === 0) {
          logWarn(
            `Round ${round}: ${i + 1}/${roundWallets.length} | ` +
              `${roundSuccesses} OK / ${roundFailures} FAIL`,
          );
        }

        // Check failure rate
        const total = totalSuccesses + totalFailures;
        if (total >= 10 && totalFailures / total > 0.5) {
          logError(`Failure rate > 50% (${totalFailures}/${total}). Stopping simulation.`);
          logError(`Last error: ${result.error}`);
          return allResults;
        }

        // Stop on too many consecutive failures
        if (consecutiveFailures >= 15) {
          logError(`15 consecutive failures. Stopping simulation.`);
          logError(`Last error: ${result.error}`);
          return allResults;
        }
      }

      // Random delay between trades (500ms - 2000ms)
      const delayMs = Math.floor(randomBetween(500, 2000));
      await sleep(delayMs);
    }

    // Round summary
    console.log('');
    log(
      `${C.bold}${C.cyan}Round ${round} Summary:${C.reset} ` +
        `${C.green}${roundSuccesses} succeeded${C.reset} | ` +
        `${C.red}${roundFailures} failed${C.reset} | ` +
        `Volume: ${roundVolume.toFixed(4)} SOL`,
    );

    // Pause between rounds
    if (round < rounds) {
      logInfo(`Pausing 3s before next round...`);
      await sleep(3000);
    }
  }

  return allResults;
}

// ── Phase 5: Results ────────────────────────────────────────────────

async function printResults(
  apiBase: string,
  poolId: string,
  wallets: WalletState[],
  results: TradeResult[],
): Promise<void> {
  logHeader('SIMULATION RESULTS');

  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);
  const buys = successes.filter((r) => r.action === 'BUY');
  const sells = successes.filter((r) => r.action === 'SELL');
  const totalVolume = successes.reduce((sum, r) => sum + r.amountSol, 0);
  const uniqueTraders = new Set(successes.map((r) => r.wallet)).size;

  console.log(`${C.bold}Trading Summary${C.reset}`);
  console.log(`  Total trades attempted: ${results.length}`);
  console.log(`  ${C.green}Successful: ${successes.length}${C.reset}`);
  console.log(`  ${C.red}Failed: ${failures.length}${C.reset}`);
  console.log(`  Success rate: ${((successes.length / results.length) * 100).toFixed(1)}%`);
  console.log('');
  console.log(`${C.bold}Volume${C.reset}`);
  console.log(`  Total volume: ${totalVolume.toFixed(6)} SOL`);
  console.log(`  Buy trades: ${buys.length} (${buys.reduce((s, r) => s + r.amountSol, 0).toFixed(6)} SOL)`);
  console.log(`  Sell trades: ${sells.length} (${sells.reduce((s, r) => s + r.amountSol, 0).toFixed(6)} SOL)`);
  console.log(`  Unique traders: ${uniqueTraders}`);
  console.log('');

  // Estimated fee breakdown (based on Bags default fee structure)
  const estPlatformFee = totalVolume * 0.01; // 1% platform
  const estHolderFee = totalVolume * 0.01; // 1% holder dividends
  const estCreatorFee = totalVolume * 0.01; // 1% creator (LuxHub)
  console.log(`${C.bold}Estimated Fees${C.reset}`);
  console.log(`  Platform fee (~1%): ${estPlatformFee.toFixed(6)} SOL`);
  console.log(`  Holder dividends (~1%): ${estHolderFee.toFixed(6)} SOL`);
  console.log(`  Creator fee (~1%): ${estCreatorFee.toFixed(6)} SOL`);
  console.log('');

  // Top traders
  const traderStats = wallets
    .filter((w) => w.trades > 0)
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 10);

  console.log(`${C.bold}Top Traders${C.reset}`);
  traderStats.forEach((w, i) => {
    console.log(
      `  ${i + 1}. ${w.address.slice(0, 8)}... | ` +
        `${w.trades} trades | ` +
        `Bought: ${w.totalBought.toFixed(4)} SOL | ` +
        `Sold: ${w.totalSold.toFixed(4)} SOL`,
    );
  });
  console.log('');

  // Failure analysis
  if (failures.length > 0) {
    const errorCounts: Record<string, number> = {};
    for (const f of failures) {
      const errKey = (f.error || 'Unknown').slice(0, 80);
      errorCounts[errKey] = (errorCounts[errKey] || 0) + 1;
    }
    console.log(`${C.bold}${C.red}Failure Analysis${C.reset}`);
    Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .forEach(([err, count]) => {
        console.log(`  ${count}x: ${err}`);
      });
    console.log('');
  }

  // Try to fetch updated pool info
  try {
    const poolData = await apiGet(apiBase, `/api/pool/${poolId}`);
    const pool = poolData.pool || poolData;
    console.log(`${C.bold}Updated Pool State${C.reset}`);
    console.log(`  Current price: $${(pool.currentBondingPrice || pool.sharePriceUSD || 0).toFixed(6)}`);
    console.log(`  Bonding curve active: ${pool.bondingCurveActive || false}`);
    console.log(`  Token mint: ${pool.bagsTokenMint}`);
    console.log('');
  } catch {
    logWarn('Could not fetch updated pool state');
  }

  // Save results
  const resultsPayload = {
    timestamp: new Date().toISOString(),
    poolId,
    summary: {
      totalTrades: results.length,
      successes: successes.length,
      failures: failures.length,
      successRate: `${((successes.length / results.length) * 100).toFixed(1)}%`,
      totalVolumeSol: totalVolume,
      buyCount: buys.length,
      sellCount: sells.length,
      uniqueTraders,
      estimatedFees: {
        platform: estPlatformFee,
        holderDividends: estHolderFee,
        creator: estCreatorFee,
      },
    },
    trades: results.map((r) => ({
      wallet: r.wallet,
      action: r.action,
      amountSol: r.amountSol,
      success: r.success,
      txSignature: r.txSignature,
      error: r.error,
    })),
    wallets: wallets
      .filter((w) => w.trades > 0)
      .map((w) => ({
        address: w.address,
        trades: w.trades,
        totalBought: w.totalBought,
        totalSold: w.totalSold,
        tokenBalance: w.tokenBalance,
      })),
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(resultsPayload, null, 2));
  logSuccess(`Results saved to ${RESULTS_FILE}`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  logHeader('LuxHub Devnet Pool Trading Simulator');
  logInfo(`Pool ID:     ${args.poolId}`);
  logInfo(`Wallets:     ${args.wallets}`);
  logInfo(`Rounds:      ${args.rounds}`);
  logInfo(`API Base:    ${args.apiBase}`);
  logInfo(`Total trades: ~${args.wallets * args.rounds}`);
  console.log('');

  // Phase 0: Setup
  logHeader('PHASE 0: Setup');
  const connection = await setupConnection();

  // Load or generate master keypair
  let master: Keypair;
  if (args.masterKeyPath) {
    try {
      master = loadKeypair(args.masterKeyPath);
      logSuccess(`Master keypair loaded: ${master.publicKey.toBase58()}`);
    } catch (err: any) {
      logError(`Failed to load master keypair from ${args.masterKeyPath}: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Generate a temporary master keypair
    master = Keypair.generate();
    const masterFile = resolve(__dirname, '.master-keypair.json');
    fs.writeFileSync(masterFile, JSON.stringify(Array.from(master.secretKey)));
    console.log('');
    logWarn('No --master-key provided. Generated a temporary master wallet.');
    logWarn(`Address: ${C.bold}${master.publicKey.toBase58()}${C.reset}`);
    logWarn(`Saved to: ${masterFile}`);
    console.log('');
    logWarn('Fund this wallet with SOL on devnet before continuing.');
    logWarn('  Option 1: solana airdrop 2 ' + master.publicKey.toBase58() + ' --url devnet');
    logWarn('  Option 2: https://faucet.solana.com');
    console.log('');
    logWarn('Then re-run with: --master-key ' + masterFile);
    process.exit(0);
  }

  // Phase 1: Generate Wallets
  logHeader('PHASE 1: Generate Wallets');
  const wallets = generateWallets(args.wallets);

  // Phase 2: Fund Wallets
  logHeader('PHASE 2: Fund Wallets');
  await fundWallets(connection, master, wallets);

  // Phase 3: Verify Pool
  logHeader('PHASE 3: Verify Pool');
  const poolInfo = await verifyPool(args.apiBase, args.poolId);

  // Phase 4: Simulate Trading
  logHeader('PHASE 4: Simulate Trading');
  logInfo(`Starting ${args.rounds} rounds of trading with ${args.wallets} wallets...`);
  logInfo(`Buy/Sell amounts: 0.005 - 0.03 SOL per trade`);
  logInfo(`Delay between trades: 500ms - 2000ms`);
  console.log('');

  const results = await simulateTrading(
    connection,
    args.apiBase,
    wallets,
    args.poolId,
    poolInfo.bagsTokenMint,
    args.rounds,
  );

  // Phase 5: Results
  await printResults(args.apiBase, args.poolId, wallets, results);

  logHeader('SIMULATION COMPLETE');
}

main().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
