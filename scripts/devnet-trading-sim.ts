/**
 * LuxHub Comprehensive Devnet Trading Simulator
 *
 * Multi-scenario trading simulation covering:
 *   - Token creation via Bags API
 *   - Retail accumulation
 *   - Whale entry + price impact
 *   - Day trader scalp P&L
 *   - Sniper bot front-run + slippage
 *   - Mass sell pressure
 *
 * Usage:
 *   npx tsx scripts/devnet-trading-sim.ts
 *
 * Prerequisites:
 *   - Dev server running on localhost:3000
 *   - .env.local configured with BAGS_API_KEY, ADMIN_SECRET, NEXT_PUBLIC_SOLANA_ENDPOINT
 *   - Pool 69b7a18eabd030f2c972cf98 exists in MongoDB with status "open"
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);

config({ path: resolve(__dirname_local, '..', '.env.local') });

import {
  Keypair,
  Connection,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  Transaction,
  PublicKey,
} from '@solana/web3.js';
import * as fs from 'fs';

// ── Constants ──────────────────────────────────────────────────────
const POOL_ID = '69b7a18eabd030f2c972cf98';
const API_BASE = 'http://localhost:3000';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const REPORT_FILE = resolve(__dirname_local, '..', 'tasks', 'trading-sim-results.md');
const WALLETS_FILE = resolve(__dirname_local, '.devnet-sim-wallets.json');

// ── ANSI Colors ─────────────────────────────────────────────────────
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
};

function ts(): string {
  return `${C.dim}[${new Date().toISOString().slice(11, 19)}]${C.reset}`;
}
function log(msg: string) { console.log(`${ts()} ${msg}`); }
function logOk(msg: string) { log(`${C.green}[OK]${C.reset} ${msg}`); }
function logErr(msg: string) { log(`${C.red}[ERR]${C.reset} ${msg}`); }
function logWarn(msg: string) { log(`${C.yellow}[WARN]${C.reset} ${msg}`); }
function logInfo(msg: string) { log(`${C.cyan}[INFO]${C.reset} ${msg}`); }
function logTrade(msg: string) { log(`${C.magenta}[TRADE]${C.reset} ${msg}`); }
function header(title: string) {
  const bar = '='.repeat(70);
  console.log(`\n${C.bold}${C.magenta}${bar}${C.reset}`);
  console.log(`${C.bold}${C.magenta}  ${title}${C.reset}`);
  console.log(`${C.bold}${C.magenta}${bar}${C.reset}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function lamportsToSol(l: number): string {
  return (l / LAMPORTS_PER_SOL).toFixed(6);
}

function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// ── Types ───────────────────────────────────────────────────────────

interface SimWallet {
  name: string;
  keypair: Keypair;
  address: string;
  tokenBalance: number;
  solSpent: number;
  solReceived: number;
}

interface TradeLog {
  scenario: string;
  wallet: string;
  walletName: string;
  action: 'BUY' | 'SELL' | 'CREATE_TOKEN';
  amountSol?: number;
  tokenAmount?: number;
  success: boolean;
  txSignature?: string;
  outputAmount?: string;
  priceImpact?: string;
  pricePerToken?: string;
  error?: string;
  timestamp: string;
  rawResponse?: unknown;
}

// ── Globals ─────────────────────────────────────────────────────────

let connection: Connection;
let adminKeypair: Keypair;
let adminAddress: string;
const tradeLogs: TradeLog[] = [];
let bagsTokenMint: string | null = null;

const wallets: Record<string, SimWallet> = {};

// ── API Helpers ─────────────────────────────────────────────────────

async function apiPost(path: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const url = `${API_BASE}${path}`;
  logInfo(`POST ${path}`);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({ rawText: 'non-JSON response' }));
    if (!resp.ok) {
      logErr(`POST ${path} => ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`);
    } else {
      logOk(`POST ${path} => ${resp.status}`);
    }
    return { status: resp.status, data };
  } catch (err: any) {
    logErr(`POST ${path} => NETWORK ERROR: ${err.message}`);
    return { status: 0, data: { error: err.message } };
  }
}

async function apiGet(path: string, params?: Record<string, string>): Promise<{ status: number; data: any }> {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  logInfo(`GET ${url.pathname}${url.search}`);
  try {
    const resp = await fetch(url.toString());
    const data = await resp.json().catch(() => ({ rawText: 'non-JSON response' }));
    if (!resp.ok) {
      logErr(`GET ${path} => ${resp.status}: ${JSON.stringify(data).slice(0, 300)}`);
    } else {
      logOk(`GET ${path} => ${resp.status}`);
    }
    return { status: resp.status, data };
  } catch (err: any) {
    logErr(`GET ${path} => NETWORK ERROR: ${err.message}`);
    return { status: 0, data: { error: err.message } };
  }
}

// ── Airdrop Helper ──────────────────────────────────────────────────

async function requestAirdrop(wallet: string, solAmount: number = 2): Promise<boolean> {
  logInfo(`Requesting airdrop of ${solAmount} SOL to ${wallet.slice(0, 8)}...`);
  try {
    const sig = await connection.requestAirdrop(
      new PublicKey(wallet),
      solAmount * LAMPORTS_PER_SOL
    );
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature: sig,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');
    const balance = await connection.getBalance(new PublicKey(wallet));
    logOk(`Airdrop confirmed. Balance: ${lamportsToSol(balance)} SOL`);
    return true;
  } catch (err: any) {
    logErr(`Airdrop failed for ${wallet.slice(0, 8)}: ${err.message}`);
    // Try RPC method as fallback
    try {
      const resp = await fetch(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'requestAirdrop',
          params: [wallet, solAmount * LAMPORTS_PER_SOL],
        }),
      });
      const result = await resp.json();
      if (result.error) {
        logErr(`RPC airdrop fallback failed: ${JSON.stringify(result.error)}`);
        return false;
      }
      logOk(`RPC airdrop sent, sig: ${(result.result as string)?.slice(0, 16)}...`);
      await sleep(2000); // Wait for confirmation
      return true;
    } catch (e: any) {
      logErr(`RPC airdrop fallback error: ${e.message}`);
      return false;
    }
  }
}

// ── Transaction Signing & Sending ───────────────────────────────────

async function signAndSend(
  serializedTx: string,
  signer: Keypair,
  isVersioned?: boolean
): Promise<string | null> {
  try {
    const txBuffer = Buffer.from(serializedTx, 'base64');
    let txSignature: string;

    if (isVersioned) {
      const vTx = VersionedTransaction.deserialize(txBuffer);
      vTx.sign([signer]);
      txSignature = await connection.sendRawTransaction(vTx.serialize(), {
        skipPreflight: true,
        maxRetries: 3,
      });
    } else {
      // Try versioned first, fall back to legacy
      try {
        const vTx = VersionedTransaction.deserialize(txBuffer);
        vTx.sign([signer]);
        txSignature = await connection.sendRawTransaction(vTx.serialize(), {
          skipPreflight: true,
          maxRetries: 3,
        });
      } catch {
        const tx = Transaction.from(txBuffer);
        tx.partialSign(signer);
        txSignature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
          maxRetries: 3,
        });
      }
    }

    logInfo(`TX sent: ${txSignature.slice(0, 16)}...`);

    // Confirm
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction({
      signature: txSignature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    logOk(`TX confirmed: ${txSignature}`);
    return txSignature;
  } catch (err: any) {
    logErr(`TX sign/send failed: ${err.message}`);
    return null;
  }
}

// ── Pool State Query ────────────────────────────────────────────────

async function getPoolState(): Promise<any> {
  const { data } = await apiGet(`/api/pool/${POOL_ID}`);
  return data?.pool || data;
}

// ── Execute Buy ─────────────────────────────────────────────────────

async function executeBuy(
  scenario: string,
  wallet: SimWallet,
  solAmount: number
): Promise<TradeLog> {
  const tradeLog: TradeLog = {
    scenario,
    wallet: wallet.address,
    walletName: wallet.name,
    action: 'BUY',
    amountSol: solAmount,
    success: false,
    timestamp: new Date().toISOString(),
  };

  logTrade(`${wallet.name} buying with ${solAmount} SOL...`);

  const { status, data } = await apiPost('/api/pool/buy', {
    poolId: POOL_ID,
    buyerWallet: wallet.address,
    inputMint: SOL_MINT,
    inputAmount: solToLamports(solAmount).toString(),
    slippageBps: 300,
  });

  tradeLog.rawResponse = data;

  if (status === 200 && data.success) {
    tradeLog.success = true;
    tradeLog.outputAmount = data.quote?.outputAmount;
    tradeLog.priceImpact = data.quote?.priceImpact;
    tradeLog.pricePerToken = data.quote?.pricePerToken;

    logOk(`Quote: output=${data.quote?.outputAmount} tokens, impact=${data.quote?.priceImpact}, price=${data.quote?.pricePerToken}`);

    // Try to sign and send
    if (data.transaction) {
      const sig = await signAndSend(
        data.transaction.serialized || data.transaction,
        wallet.keypair,
        data.transaction.isVersioned
      );
      if (sig) {
        tradeLog.txSignature = sig;
        wallet.tokenBalance += parseFloat(data.quote?.outputAmount || '0');
        wallet.solSpent += solAmount;
      } else {
        tradeLog.error = 'Transaction signing/sending failed';
        logWarn('Could not sign/send TX - logging quote data only');
      }
    } else {
      logWarn('No transaction returned in response - API may not have built swap TX');
      tradeLog.error = 'No transaction in response';
    }
  } else {
    tradeLog.error = data?.error || `HTTP ${status}`;
    tradeLog.success = false;
    logErr(`Buy failed: ${tradeLog.error}`);
  }

  tradeLogs.push(tradeLog);
  return tradeLog;
}

// ── Execute Sell ────────────────────────────────────────────────────

async function executeSell(
  scenario: string,
  wallet: SimWallet,
  tokenAmount: number
): Promise<TradeLog> {
  const tradeLog: TradeLog = {
    scenario,
    wallet: wallet.address,
    walletName: wallet.name,
    action: 'SELL',
    tokenAmount,
    success: false,
    timestamp: new Date().toISOString(),
  };

  logTrade(`${wallet.name} selling ${tokenAmount} tokens...`);

  const { status, data } = await apiPost('/api/pool/sell', {
    poolId: POOL_ID,
    sellerWallet: wallet.address,
    tokenAmount,
    slippageBps: 300,
  });

  tradeLog.rawResponse = data;

  if (status === 200 && data.success) {
    tradeLog.success = true;
    tradeLog.outputAmount = data.quote?.outputAmount || data.sell?.netOutputUSD?.toString();
    tradeLog.priceImpact = data.quote?.priceImpact;
    tradeLog.pricePerToken = data.quote?.pricePerToken || data.sell?.pricePerToken?.toString();

    logOk(`Sell quote: output=${tradeLog.outputAmount}, impact=${tradeLog.priceImpact}`);

    // Try to sign and send
    if (data.transaction) {
      const sig = await signAndSend(
        data.transaction.serialized || data.transaction,
        wallet.keypair,
        data.transaction.isVersioned
      );
      if (sig) {
        tradeLog.txSignature = sig;
        wallet.tokenBalance = Math.max(0, wallet.tokenBalance - tokenAmount);
        wallet.solReceived += parseFloat(tradeLog.outputAmount || '0') / LAMPORTS_PER_SOL;
      } else {
        tradeLog.error = 'Transaction signing/sending failed (sell)';
      }
    } else {
      // Fallback mode (MongoDB-only) -- already processed server-side
      logInfo('Sell processed in fallback mode (MongoDB accounting)');
      wallet.tokenBalance = Math.max(0, wallet.tokenBalance - tokenAmount);
      wallet.solReceived += parseFloat(data.sell?.netOutputUSD || '0');
    }
  } else {
    tradeLog.error = data?.error || `HTTP ${status}`;
    logErr(`Sell failed: ${tradeLog.error}`);
  }

  tradeLogs.push(tradeLog);
  return tradeLog;
}

// ══════════════════════════════════════════════════════════════════════
// STEP 1: RECONNAISSANCE (done at import time by reading source files)
// ══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// STEP 2: GENERATE TEST WALLETS
// ══════════════════════════════════════════════════════════════════════

function generateTestWallets(): void {
  header('STEP 2: Generate Test Wallets');

  const walletDefs: Array<{ name: string; label: string }> = [
    { name: 'whale', label: 'Whale (large buys)' },
    { name: 'retail1', label: 'Retail Trader 1 (small buys)' },
    { name: 'retail2', label: 'Retail Trader 2 (small buys)' },
    { name: 'dayTrader', label: 'Day Trader (rapid buy/sell)' },
    { name: 'sniper', label: 'Sniper (fast entry/exit)' },
  ];

  // Check for saved wallets
  let savedWallets: Record<string, number[]> | null = null;
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      savedWallets = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
      logInfo('Found saved test wallets, reusing...');
    }
  } catch { /* generate fresh */ }

  for (const def of walletDefs) {
    let kp: Keypair;
    if (savedWallets && savedWallets[def.name]) {
      kp = Keypair.fromSecretKey(Uint8Array.from(savedWallets[def.name]));
      logInfo(`Restored ${def.label}: ${kp.publicKey.toBase58()}`);
    } else {
      kp = Keypair.generate();
      logOk(`Generated ${def.label}: ${kp.publicKey.toBase58()}`);
    }

    wallets[def.name] = {
      name: def.name,
      keypair: kp,
      address: kp.publicKey.toBase58(),
      tokenBalance: 0,
      solSpent: 0,
      solReceived: 0,
    };
  }

  // Save wallets for reuse
  const toSave: Record<string, number[]> = {};
  for (const [name, w] of Object.entries(wallets)) {
    toSave[name] = Array.from(w.keypair.secretKey);
  }
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(toSave, null, 2));
  logOk(`Wallets saved to ${WALLETS_FILE}`);
}

async function fundTestWallets(): Promise<void> {
  header('STEP 2b: Fund Test Wallets (Devnet Airdrop)');

  for (const [name, wallet] of Object.entries(wallets)) {
    const balance = await connection.getBalance(new PublicKey(wallet.address));
    const balSol = balance / LAMPORTS_PER_SOL;
    logInfo(`${name}: ${lamportsToSol(balance)} SOL`);

    if (balSol < 1) {
      // Need more SOL -- request airdrop
      const needed = name === 'whale' ? 2 : 1;
      const ok = await requestAirdrop(wallet.address, needed);
      if (!ok) {
        logWarn(`Could not airdrop to ${name}. Will try to continue anyway.`);
      }
      // Rate limit: devnet limits airdrops
      await sleep(1500);
    } else {
      logOk(`${name} already funded: ${balSol.toFixed(4)} SOL`);
    }
  }

  // Final balance check
  console.log('');
  logInfo('Final balances:');
  for (const [name, wallet] of Object.entries(wallets)) {
    const balance = await connection.getBalance(new PublicKey(wallet.address));
    logInfo(`  ${name.padEnd(12)} ${lamportsToSol(balance)} SOL  (${wallet.address.slice(0, 12)}...)`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// STEP 3: CREATE BAGS TOKEN
// ══════════════════════════════════════════════════════════════════════

async function createBagsToken(): Promise<void> {
  header('STEP 3: Create Bags Token for Pool');

  // First check current pool state
  const pool = await getPoolState();
  if (pool?.bagsTokenMint) {
    bagsTokenMint = pool.bagsTokenMint;
    logOk(`Pool already has token mint: ${bagsTokenMint}`);
    logInfo(`Bonding curve active: ${pool.bondingCurveActive}`);
    logInfo(`Token status: ${pool.tokenStatus}`);
    return;
  }

  logInfo('Pool has no token. Calling /api/bags/create-pool-token...');

  const { status, data } = await apiPost('/api/bags/create-pool-token', {
    poolId: POOL_ID,
    adminWallet: adminAddress,
    launchType: 'bonding_curve',
    bondingCurveType: 'exponential',
  });

  const tradeLog: TradeLog = {
    scenario: 'Token Creation',
    wallet: adminAddress,
    walletName: 'admin',
    action: 'CREATE_TOKEN',
    success: false,
    timestamp: new Date().toISOString(),
    rawResponse: data,
  };

  if (status === 200 && data.success) {
    tradeLog.success = true;
    bagsTokenMint = data.token?.mint;

    logOk(`Token created successfully!`);
    logInfo(`  Name:    ${data.token?.name}`);
    logInfo(`  Symbol:  ${data.token?.symbol}`);
    logInfo(`  Mint:    ${bagsTokenMint}`);
    logInfo(`  Type:    ${data.token?.launchType}`);
    if (data.token?.bondingCurve) {
      logInfo(`  Curve:   ${data.token.bondingCurve.type}`);
      logInfo(`  Initial: $${data.token.bondingCurve.initialPrice}`);
      logInfo(`  Target:  $${data.token.bondingCurve.targetMarketCap}`);
    }
    logInfo(`  Fee Share: ${data.feeShare?.configured ? 'Configured' : 'Not configured'}`);

    // Sign the launch transaction if returned
    if (data.transaction) {
      logInfo('Signing token launch transaction...');
      const sig = await signAndSend(
        typeof data.transaction === 'string' ? data.transaction : data.transaction.serialized || JSON.stringify(data.transaction),
        adminKeypair,
        data.transaction?.isVersioned
      );
      if (sig) {
        tradeLog.txSignature = sig;
        logOk(`Token launch TX confirmed: ${sig}`);
      } else {
        logWarn('Could not sign launch TX. Token info created but may not be on-chain yet.');
        tradeLog.error = 'Launch TX signing failed';
      }
    }

    // Sign fee share transaction if returned
    if (data.feeShare?.transaction) {
      logInfo('Signing fee share configuration transaction...');
      const feeSig = await signAndSend(
        typeof data.feeShare.transaction === 'string' ? data.feeShare.transaction : data.feeShare.transaction.serialized,
        adminKeypair,
        data.feeShare.transaction?.isVersioned
      );
      if (feeSig) {
        logOk(`Fee share TX confirmed: ${feeSig}`);
      }
    }
  } else if (status === 400 && data.bagsTokenMint) {
    // Token already exists
    bagsTokenMint = data.bagsTokenMint;
    tradeLog.success = true;
    logOk(`Token already exists: ${bagsTokenMint}`);
  } else {
    tradeLog.error = data?.error || `HTTP ${status}`;
    logErr(`Token creation failed: ${tradeLog.error}`);
    if (data?.details) {
      logErr(`  Details: ${JSON.stringify(data.details).slice(0, 500)}`);
    }
    logWarn('Continuing simulation -- buy/sell will use MongoDB fallback mode if no token.');
  }

  tradeLogs.push(tradeLog);
}

// ══════════════════════════════════════════════════════════════════════
// STEP 4: TRADING SCENARIOS
// ══════════════════════════════════════════════════════════════════════

async function scenarioA_RetailAccumulation(): Promise<void> {
  header('Scenario A: Retail Accumulation');

  logInfo('Retail trader 1 buys 0.1 SOL worth of tokens...');
  await executeBuy('A: Retail Accumulation', wallets.retail1, 0.1);
  await sleep(1000);

  // Check pool state
  const pool1 = await getPoolState();
  logInfo(`Pool after retail1 buy: shares=${pool1?.sharesSold}, price=$${pool1?.currentBondingPrice || pool1?.sharePriceUSD}`);

  await sleep(500);

  logInfo('Retail trader 2 buys 0.5 SOL worth of tokens...');
  await executeBuy('A: Retail Accumulation', wallets.retail2, 0.5);
  await sleep(1000);

  // Check pool state
  const pool2 = await getPoolState();
  logInfo(`Pool after retail2 buy: shares=${pool2?.sharesSold}, price=$${pool2?.currentBondingPrice || pool2?.sharePriceUSD}`);
}

async function scenarioB_WhaleEntry(): Promise<void> {
  header('Scenario B: Whale Entry');

  logInfo('Whale buying 5 SOL worth of tokens (large position)...');

  // Get pool state before
  const poolBefore = await getPoolState();
  const priceBefore = poolBefore?.currentBondingPrice || poolBefore?.sharePriceUSD || 0;
  logInfo(`Price before whale entry: $${priceBefore}`);

  await executeBuy('B: Whale Entry', wallets.whale, 5);
  await sleep(1500);

  // Get pool state after
  const poolAfter = await getPoolState();
  const priceAfter = poolAfter?.currentBondingPrice || poolAfter?.sharePriceUSD || 0;
  logInfo(`Price after whale entry: $${priceAfter}`);

  const priceChange = priceBefore > 0 ? ((priceAfter - priceBefore) / priceBefore) * 100 : 0;
  logInfo(`Price impact from whale: ${priceChange.toFixed(2)}%`);
  logInfo(`Whale token balance: ${wallets.whale.tokenBalance}`);
}

async function scenarioC_DayTraderScalp(): Promise<void> {
  header('Scenario C: Day Trader Scalp');

  // Buy 1 SOL worth
  logInfo('Day trader buying 1 SOL worth...');
  const buyResult = await executeBuy('C: Day Trader Scalp', wallets.dayTrader, 1);
  const entryTokens = wallets.dayTrader.tokenBalance;
  logInfo(`Entry position: ${entryTokens} tokens`);
  await sleep(2000);

  // Sell 50%
  const halfTokens = Math.floor(entryTokens / 2);
  if (halfTokens > 0) {
    logInfo(`Day trader selling 50% (${halfTokens} tokens)...`);
    await executeSell('C: Day Trader Scalp (50%)', wallets.dayTrader, halfTokens);
    await sleep(1500);
  } else {
    logWarn('Day trader has 0 tokens to sell (buy may have failed). Skipping sell.');
  }

  // Sell remaining
  const remaining = wallets.dayTrader.tokenBalance;
  if (remaining > 0) {
    logInfo(`Day trader selling remaining ${remaining} tokens...`);
    await executeSell('C: Day Trader Scalp (remaining)', wallets.dayTrader, remaining);
    await sleep(1000);
  }

  // P&L
  const pnl = wallets.dayTrader.solReceived - wallets.dayTrader.solSpent;
  logInfo(`Day Trader P&L:`);
  logInfo(`  SOL spent: ${wallets.dayTrader.solSpent.toFixed(6)}`);
  logInfo(`  SOL received: ${wallets.dayTrader.solReceived.toFixed(6)}`);
  logInfo(`  Net P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(6)} SOL`);
  logInfo(`  Remaining tokens: ${wallets.dayTrader.tokenBalance}`);
}

async function scenarioD_SniperBot(): Promise<void> {
  header('Scenario D: Sniper Bot Simulation');

  // Sniper buys immediately after whale (front-run attempt)
  logInfo('Sniper attempting to buy right after whale...');
  const sniperBuy = await executeBuy('D: Sniper (entry)', wallets.sniper, 0.5);
  logInfo(`Sniper entry tokens: ${wallets.sniper.tokenBalance}`);

  // Check slippage
  if (sniperBuy.priceImpact) {
    logInfo(`Sniper price impact: ${sniperBuy.priceImpact}`);
  }

  await sleep(1000);

  // Sniper tries to sell immediately for profit
  const sniperTokens = wallets.sniper.tokenBalance;
  if (sniperTokens > 0) {
    logInfo(`Sniper selling ${sniperTokens} tokens immediately...`);
    await executeSell('D: Sniper (exit)', wallets.sniper, sniperTokens);
  } else {
    logWarn('Sniper has no tokens to sell.');
  }

  // P&L
  const pnl = wallets.sniper.solReceived - wallets.sniper.solSpent;
  logInfo(`Sniper P&L:`);
  logInfo(`  SOL spent: ${wallets.sniper.solSpent.toFixed(6)}`);
  logInfo(`  SOL received: ${wallets.sniper.solReceived.toFixed(6)}`);
  logInfo(`  Net P&L: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(6)} SOL`);
  logInfo(`  Slippage protection: ${sniperBuy.priceImpact ? 'Active' : 'Unknown'}`);
}

async function scenarioE_SellPressure(): Promise<void> {
  header('Scenario E: Mass Sell Pressure');

  // First, let's rebuy some tokens for wallets that sold
  logInfo('Reloading positions for mass sell test...');
  for (const name of ['retail1', 'retail2', 'whale']) {
    const w = wallets[name];
    if (w.tokenBalance <= 0) {
      const buyAmt = name === 'whale' ? 2 : 0.3;
      logInfo(`Reloading ${name} with ${buyAmt} SOL buy...`);
      await executeBuy('E: Reload for sell pressure', w, buyAmt);
      await sleep(1000);
    }
  }

  // Pool state before mass sell
  const poolBefore = await getPoolState();
  const priceBefore = poolBefore?.currentBondingPrice || poolBefore?.sharePriceUSD || 0;
  logInfo(`Price before mass sell: $${priceBefore}`);

  // All traders sell at once
  logInfo('All traders selling simultaneously...');
  const sellPromises: Promise<TradeLog>[] = [];

  for (const [name, w] of Object.entries(wallets)) {
    if (w.tokenBalance > 0) {
      logInfo(`  ${name}: selling ${w.tokenBalance} tokens`);
      // Execute sequentially to avoid overwhelming the API
      const result = await executeSell('E: Mass Sell Pressure', w, Math.floor(w.tokenBalance));
      sellPromises.push(Promise.resolve(result));
      await sleep(500);
    } else {
      logInfo(`  ${name}: no tokens to sell`);
    }
  }

  await sleep(2000);

  // Pool state after mass sell
  const poolAfter = await getPoolState();
  const priceAfter = poolAfter?.currentBondingPrice || poolAfter?.sharePriceUSD || 0;
  logInfo(`Price after mass sell: $${priceAfter}`);

  const priceChange = priceBefore > 0 ? ((priceAfter - priceBefore) / priceBefore) * 100 : 0;
  logInfo(`Price drop from mass sell: ${priceChange.toFixed(2)}%`);
  logInfo(`Pool status: ${poolAfter?.status}`);
  logInfo(`Shares sold: ${poolAfter?.sharesSold}`);
}

// ══════════════════════════════════════════════════════════════════════
// STEP 5: RESULTS REPORT
// ══════════════════════════════════════════════════════════════════════

async function generateReport(): Promise<void> {
  header('STEP 5: Generating Results Report');

  // Final pool state
  const pool = await getPoolState();

  const successes = tradeLogs.filter((t) => t.success);
  const failures = tradeLogs.filter((t) => !t.success);
  const buys = tradeLogs.filter((t) => t.action === 'BUY');
  const sells = tradeLogs.filter((t) => t.action === 'SELL');
  const buySuccesses = buys.filter((t) => t.success);
  const sellSuccesses = sells.filter((t) => t.success);

  // Build markdown report
  const lines: string[] = [];
  lines.push('# LuxHub Devnet Trading Simulation Results');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Pool ID:** ${POOL_ID}`);
  lines.push(`**Token Mint:** ${bagsTokenMint || 'NOT CREATED'}`);
  lines.push(`**Network:** Solana Devnet`);
  lines.push(`**Admin Wallet:** ${adminAddress}`);
  lines.push('');

  // Token creation
  lines.push('## Token Creation');
  const tokenLog = tradeLogs.find((t) => t.action === 'CREATE_TOKEN');
  if (tokenLog) {
    lines.push(`- **Status:** ${tokenLog.success ? 'SUCCESS' : 'FAILED'}`);
    lines.push(`- **Mint Address:** ${bagsTokenMint || 'N/A'}`);
    lines.push(`- **TX Signature:** ${tokenLog.txSignature || 'N/A'}`);
    if (tokenLog.error) {
      lines.push(`- **Error:** ${tokenLog.error}`);
    }
  } else {
    lines.push('- Token creation step was skipped (token may already exist)');
  }
  lines.push('');

  // Test Wallets
  lines.push('## Test Wallets');
  lines.push('');
  lines.push('| Name | Address | SOL Spent | SOL Received | Token Balance | Net P&L |');
  lines.push('|------|---------|-----------|--------------|---------------|---------|');
  for (const [name, w] of Object.entries(wallets)) {
    const pnl = w.solReceived - w.solSpent;
    lines.push(
      `| ${name} | \`${w.address.slice(0, 8)}...\` | ${w.solSpent.toFixed(4)} | ${w.solReceived.toFixed(4)} | ${w.tokenBalance.toFixed(0)} | ${pnl >= 0 ? '+' : ''}${pnl.toFixed(4)} |`
    );
  }
  lines.push('');

  // Trade Summary
  lines.push('## Trade Summary');
  lines.push('');
  lines.push(`- **Total trades attempted:** ${tradeLogs.length}`);
  lines.push(`- **Successful:** ${successes.length}`);
  lines.push(`- **Failed:** ${failures.length}`);
  lines.push(`- **Success rate:** ${tradeLogs.length > 0 ? ((successes.length / tradeLogs.length) * 100).toFixed(1) : 0}%`);
  lines.push(`- **Buy trades:** ${buys.length} (${buySuccesses.length} succeeded)`);
  lines.push(`- **Sell trades:** ${sells.length} (${sellSuccesses.length} succeeded)`);
  lines.push('');

  // Detailed Trade Log
  lines.push('## Detailed Trade Log');
  lines.push('');
  lines.push('| # | Scenario | Wallet | Action | Amount | Success | Impact | TX |');
  lines.push('|---|----------|--------|--------|--------|---------|--------|----|');
  tradeLogs.forEach((t, i) => {
    const amount = t.action === 'BUY' ? `${t.amountSol} SOL` : t.action === 'SELL' ? `${t.tokenAmount} tokens` : 'N/A';
    const impact = t.priceImpact || '-';
    const tx = t.txSignature ? `\`${t.txSignature.slice(0, 12)}...\`` : t.error ? `ERR: ${t.error.slice(0, 40)}` : '-';
    lines.push(
      `| ${i + 1} | ${t.scenario.slice(0, 30)} | ${t.walletName} | ${t.action} | ${amount} | ${t.success ? 'YES' : 'NO'} | ${impact} | ${tx} |`
    );
  });
  lines.push('');

  // Scenario Results
  lines.push('## Scenario Analysis');
  lines.push('');

  // Group by scenario
  const scenarios = new Map<string, TradeLog[]>();
  for (const t of tradeLogs) {
    const key = t.scenario.split('(')[0].trim();
    if (!scenarios.has(key)) scenarios.set(key, []);
    scenarios.get(key)!.push(t);
  }

  for (const [scenario, trades] of scenarios) {
    const ok = trades.filter((t) => t.success).length;
    const fail = trades.filter((t) => !t.success).length;
    lines.push(`### ${scenario}`);
    lines.push(`- Trades: ${trades.length} (${ok} ok, ${fail} failed)`);
    for (const t of trades) {
      const status = t.success ? 'OK' : `FAIL: ${t.error?.slice(0, 80)}`;
      lines.push(`  - ${t.walletName} ${t.action} ${t.amountSol || t.tokenAmount || ''} => ${status}`);
      if (t.priceImpact) lines.push(`    - Price impact: ${t.priceImpact}`);
      if (t.outputAmount) lines.push(`    - Output: ${t.outputAmount}`);
    }
    lines.push('');
  }

  // Final Pool State
  lines.push('## Final Pool State');
  lines.push('');
  if (pool) {
    lines.push(`- **Status:** ${pool.status}`);
    lines.push(`- **Bags Token Mint:** ${pool.bagsTokenMint || 'NONE'}`);
    lines.push(`- **Bonding Curve Active:** ${pool.bondingCurveActive || false}`);
    lines.push(`- **Current Price:** $${pool.currentBondingPrice || pool.sharePriceUSD || 'unknown'}`);
    lines.push(`- **Shares Sold:** ${pool.sharesSold || 0} / ${pool.totalShares || 'unknown'}`);
    lines.push(`- **Total Trades:** ${pool.totalTrades || 0}`);
    lines.push(`- **Total Volume USD:** $${pool.totalVolumeUSD?.toFixed(2) || 0}`);
    lines.push(`- **Accumulated Fees:** $${pool.accumulatedTradingFees?.toFixed(2) || 0}`);
    lines.push(`- **Participants:** ${pool.participants?.length || 0}`);
    lines.push(`- **Target Amount:** $${pool.targetAmountUSD || 0}`);
  } else {
    lines.push('Could not fetch final pool state.');
  }
  lines.push('');

  // Errors / Issues
  if (failures.length > 0) {
    lines.push('## Errors and Issues');
    lines.push('');
    const errorCounts: Record<string, number> = {};
    for (const f of failures) {
      const key = (f.error || 'Unknown').slice(0, 100);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    for (const [err, count] of Object.entries(errorCounts).sort(([, a], [, b]) => b - a)) {
      lines.push(`- **${count}x:** ${err}`);
    }
    lines.push('');
  }

  // What Worked vs What Needs Fixing
  lines.push('## Assessment');
  lines.push('');
  lines.push('### What Worked');
  if (bagsTokenMint) {
    lines.push('- Token creation via Bags API');
  }
  if (buySuccesses.length > 0) {
    lines.push('- Buy trades via bonding curve API');
  }
  if (sellSuccesses.length > 0) {
    lines.push('- Sell trades via bonding curve / fallback');
  }
  if (successes.length === 0) {
    lines.push('- (No trades succeeded -- see errors above)');
  }
  lines.push('');

  lines.push('### What Needs Fixing');
  if (!bagsTokenMint) {
    lines.push('- Bags token creation failed -- pool has no on-chain token');
  }
  if (buySuccesses.length === 0) {
    lines.push('- Buy endpoint not returning successful trades');
  }
  if (sellSuccesses.length === 0 && sells.length > 0) {
    lines.push('- Sell endpoint not returning successful trades');
  }
  for (const f of failures.slice(0, 5)) {
    if (f.error && !f.error.includes('HTTP')) {
      lines.push(`- ${f.scenario}: ${f.error.slice(0, 100)}`);
    }
  }
  lines.push('');

  // Raw API Responses (first few)
  lines.push('## Raw API Responses (sample)');
  lines.push('');
  const sampled = tradeLogs.slice(0, 6);
  for (const t of sampled) {
    lines.push(`### ${t.scenario} - ${t.walletName} ${t.action}`);
    lines.push('```json');
    lines.push(JSON.stringify(t.rawResponse, null, 2)?.slice(0, 1500) || 'null');
    lines.push('```');
    lines.push('');
  }

  // Write report
  const reportContent = lines.join('\n');

  // Ensure tasks directory exists
  const tasksDir = resolve(__dirname_local, '..', 'tasks');
  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  fs.writeFileSync(REPORT_FILE, reportContent);
  logOk(`Report written to ${REPORT_FILE}`);

  // Also print summary to console
  console.log('');
  header('SIMULATION COMPLETE');
  console.log(`Total trades: ${tradeLogs.length}`);
  console.log(`Successes: ${C.green}${successes.length}${C.reset}`);
  console.log(`Failures: ${C.red}${failures.length}${C.reset}`);
  console.log(`Token mint: ${bagsTokenMint || 'NONE'}`);
  console.log(`Report: ${REPORT_FILE}`);
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

async function main() {
  header('LuxHub Comprehensive Devnet Trading Simulator');
  logInfo(`Pool ID: ${POOL_ID}`);
  logInfo(`API Base: ${API_BASE}`);
  logInfo(`RPC: ${process.env.NEXT_PUBLIC_SOLANA_ENDPOINT?.slice(0, 40)}...`);

  // ── Setup Connection ──
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT;
  if (!endpoint) {
    logErr('NEXT_PUBLIC_SOLANA_ENDPOINT not set in .env.local');
    process.exit(1);
  }
  connection = new Connection(endpoint, 'confirmed');
  try {
    const version = await connection.getVersion();
    logOk(`Connected to Solana (v${version['solana-core']})`);
  } catch (err: any) {
    logErr(`Cannot connect to Solana: ${err.message}`);
    process.exit(1);
  }

  // ── Load Admin Keypair ──
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    logErr('ADMIN_SECRET not set in .env.local');
    process.exit(1);
  }
  try {
    const secretKey = new Uint8Array(JSON.parse(adminSecret));
    adminKeypair = Keypair.fromSecretKey(secretKey);
    adminAddress = adminKeypair.publicKey.toBase58();
    logOk(`Admin wallet: ${adminAddress}`);
  } catch (err: any) {
    logErr(`Failed to parse ADMIN_SECRET: ${err.message}`);
    process.exit(1);
  }

  // ── Check Dev Server ──
  logInfo('Checking dev server...');
  const { status: serverStatus } = await apiGet('/api/pool/list');
  if (serverStatus === 0) {
    logErr('Dev server not reachable at localhost:3000. Start it with: npm run dev');
    logWarn('Continuing anyway -- API calls will fail but script structure will be validated.');
  } else {
    logOk('Dev server is running');
  }

  // ── Run Steps ──
  generateTestWallets();
  await fundTestWallets();
  await createBagsToken();

  // Check pool state before trading
  const poolCheck = await getPoolState();
  logInfo(`Pool status: ${poolCheck?.status}`);
  logInfo(`Pool token: ${poolCheck?.bagsTokenMint || 'NONE'}`);

  // Run scenarios
  await scenarioA_RetailAccumulation();
  await scenarioB_WhaleEntry();
  await scenarioC_DayTraderScalp();
  await scenarioD_SniperBot();
  await scenarioE_SellPressure();

  // Generate report
  await generateReport();
}

main().catch((err) => {
  logErr(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
