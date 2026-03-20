import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import {
  PublicKey,
  Connection,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { HiOutlineX } from 'react-icons/hi';
import {
  FiTrendingUp,
  FiTarget,
  FiDollarSign,
  FiUsers,
  FiShield,
  FiLoader,
  FiAlertTriangle,
  FiCheckCircle,
} from 'react-icons/fi';
import BagsPoolTrading from './BagsPoolTrading';
import TvChart, { generatePriceHistory } from './TvChart';
import { GovernanceDashboard } from '../governance';
import { usePoolStatus } from '../../hooks/usePools';
import { usePriceDisplay } from './PriceDisplay';
import { resolveAssetImage, handleImageError } from '../../utils/imageUtils';
import styles from '../../styles/PoolDetail.module.css';

interface Pool {
  _id: string;
  poolNumber?: string;
  asset?: {
    _id?: string;
    model?: string;
    brand?: string;
    priceUSD?: number;
    description?: string;
    serial?: string;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
    arweaveTxId?: string;
  };
  vendor?: { businessName?: string };
  vendorWallet?: string;
  status: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD: number;
  targetAmountUSD: number;
  minBuyInUSD: number;
  maxInvestors: number;
  projectedROI: number;
  participants?: Array<{
    wallet: string;
    shares: number;
    ownershipPercent: number;
    investedUSD: number;
  }>;
  custodyStatus?: string;
  resaleListingPriceUSD?: number;
  createdAt?: string;
  windDownStatus?: string;
  windDownDeadline?: string;
  windDownClaimDeadline?: string;
  windDownSnapshotHolders?: Array<{
    wallet: string;
    balance: number;
    ownershipPercent: number;
    choice: string;
  }>;
  bagsTokenMint?: string;
  tokenStatus?: string;
  liquidityModel?: string;
  ammEnabled?: boolean;
  graduated?: boolean;
  squadMultisigPda?: string;
  fundsInEscrow?: number;
  currentBondingPrice?: number;
  bondingCurveActive?: boolean;
  totalVolumeUSD?: number;
  lastPriceUSD?: number;
  totalTrades?: number;
  recentTrades?: Array<{
    wallet: string;
    type: 'buy' | 'sell';
    amount: number;
    amountUSD: number;
    timestamp: string;
    txSignature?: string;
  }>;
}

interface PoolDetailProps {
  pool: Pool;
  onClose: () => void;
  onInvestmentComplete?: () => void;
}

const fmt = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
};

/**
 * Format micro-prices like DexScreener: $0.0₅29 instead of $0.0000029
 * Shows subscript zero count for prices < $0.001
 */
const fmtPrice = (price: number, prefix = '$'): string => {
  if (price <= 0) return `${prefix}0`;
  if (price >= 1) return `${prefix}${price.toFixed(2)}`;
  if (price >= 0.001) return `${prefix}${price.toFixed(6)}`;

  // Count leading zeros after "0."
  const str = price.toFixed(20);
  const afterDot = str.split('.')[1] || '';
  let zeros = 0;
  for (const ch of afterDot) {
    if (ch === '0') zeros++;
    else break;
  }
  const sigFigs = afterDot.slice(zeros, zeros + 4);
  // Unicode subscript digits
  const subscriptMap: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
  };
  const sub = zeros
    .toString()
    .split('')
    .map((d) => subscriptMap[d] || d)
    .join('');
  return `${prefix}0.0${sub}${sigFigs}`;
};

/** Format SOL micro-prices */
const fmtSol = (price: number): string => fmtPrice(price, '') + ' SOL';

const PoolDetail: React.FC<PoolDetailProps> = ({ pool, onClose, onInvestmentComplete }) => {
  const wallet = useWallet();
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const privyAddr = privyWallets?.[0]?.address;
  const publicKey = useMemo(
    () => wallet.publicKey || (privyAddr ? new PublicKey(privyAddr) : null),
    [wallet.publicKey, privyAddr]
  );
  const connected = wallet.connected || (authenticated && !!privyAddr);

  // Unified send: prefer wallet adapter, fallback to Privy
  const sendTx = async (tx: Transaction, connection: Connection): Promise<string> => {
    if (wallet.connected && wallet.sendTransaction) {
      return wallet.sendTransaction(tx, connection);
    }
    // Privy wallet fallback
    const privyWallet = privyWallets?.[0];
    if (privyWallet) {
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey!;
      const signed = await (privyWallet as any).signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      return sig;
    }
    throw new Error('No wallet available to sign');
  };

  const { solPriceInUSD } = usePriceDisplay();
  const [solAmount, setSolAmount] = useState('');
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [chartView] = useState<'candle' | 'line' | 'area'>('candle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'buy' | 'trade' | 'governance'>('buy');

  const { poolStatus, mutate: refreshStatus } = usePoolStatus(pool._id);
  const p: Pool = { ...pool, ...(poolStatus || {}) };

  // Prices
  const curPriceUSD = p.currentBondingPrice || p.lastPriceUSD || p.sharePriceUSD;
  const curPriceSol = curPriceUSD / solPriceInUSD;
  const solIn = parseFloat(solAmount) || 0;
  const usdEquiv = solIn * solPriceInUSD;
  const tokensOut = curPriceSol > 0 ? Math.floor(solIn / curPriceSol) : 0;
  const available = p.totalShares - p.sharesSold;
  const raisedUSD = p.fundsInEscrow ?? p.sharesSold * p.sharePriceUSD;
  const raisedSol = raisedUSD / solPriceInUSD;
  const targetSol = p.targetAmountUSD / solPriceInUSD;
  const pct = p.targetAmountUSD > 0 ? Math.min((raisedUSD / p.targetAmountUSD) * 100, 100) : 0;
  const ownPct = p.totalShares > 0 ? (tokensOut / p.totalShares) * 100 : 0;
  const minSol = p.minBuyInUSD / solPriceInUSD;

  // Sell
  const sellTkns = parseFloat(solAmount) || 0;
  const sellSol = sellTkns * curPriceSol;
  const sellUsd = sellSol * solPriceInUSD;

  const userPos = p.participants?.find((x) => x.wallet === publicKey?.toBase58());
  const userTkns = userPos?.shares || 0;
  const hasToken = !!p.bagsTokenMint;
  const canTrade = hasToken && p.status !== 'open';
  const hasGov = p.graduated && !!p.squadMultisigPda;
  const holders = new Set(p.participants?.map((x) => x.wallet) || []).size;

  useEffect(() => {
    if (hasGov) setActiveTab('governance');
    else if (p.status !== 'open' && hasToken) setActiveTab('trade');
    else setActiveTab('buy');
  }, [p.status, hasToken, hasGov]);

  const assetImage = resolveAssetImage(p.asset);
  // Fetch real price data from DexScreener when token is live
  const [priceHistory, setPriceHistory] = useState<number[]>([]);
  const [dexScreenerData, setDexScreenerData] = useState<any>(null);
  useEffect(() => {
    if (p.bagsTokenMint) {
      fetch(`/api/bags/price-history?mint=${p.bagsTokenMint}&points=80`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.success) {
            setPriceHistory(data.priceHistory);
            setDexScreenerData(data.dexScreener);
          } else {
            setPriceHistory(generatePriceHistory(curPriceUSD, 80));
          }
        })
        .catch(() => setPriceHistory(generatePriceHistory(curPriceUSD, 80)));
    } else {
      setPriceHistory(generatePriceHistory(curPriceUSD, 80));
    }
  }, [p.bagsTokenMint, curPriceUSD]);

  const statusMap: Record<string, { label: string; color: string }> = {
    open: { label: 'Live', color: '#4ade80' },
    filled: { label: 'Filled', color: '#fbbf24' },
    funded: { label: 'Funded', color: '#60a5fa' },
    custody: { label: 'Custody', color: '#f472b6' },
    active: { label: 'Active', color: '#a78bfa' },
    graduated: { label: 'DAO', color: '#c8a1ff' },
    listed: { label: 'Listed', color: '#fb923c' },
    sold: { label: 'Sold', color: '#4ade80' },
    distributed: { label: 'Done', color: '#94a3b8' },
    winding_down: { label: 'Wind Down', color: '#f59e0b' },
    closed: { label: 'Closed', color: '#64748b' },
  };
  const st = statusMap[p.status] || { label: p.status, color: '#c8a1ff' };

  const handleBuy = async () => {
    if (!connected || !publicKey) return setError('Connect your wallet');
    if (solIn <= 0) return setError('Enter SOL amount');
    if (usdEquiv < p.minBuyInUSD) return setError(`Min ~${minSol.toFixed(4)} SOL`);

    setLoading(true);
    setError(null);
    try {
      const connection = new Connection(getClusterConfig().endpoint);

      if (p.bagsTokenMint && !p.graduated) {
        // ── Real Bags bonding curve buy ──
        // SOL mint address on Solana
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const lamports = Math.round(solIn * LAMPORTS_PER_SOL).toString();

        // 1. Get quote + swap transaction from Bags API
        const buyRes = await fetch('/api/pool/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id,
            buyerWallet: publicKey.toBase58(),
            inputMint: SOL_MINT,
            inputAmount: lamports,
            slippageBps: 200, // 2% slippage
          }),
        });
        const buyData = await buyRes.json();
        if (!buyRes.ok) throw new Error(buyData.error || 'Failed to get swap transaction');

        // 2. Deserialize and sign the transaction from Bags
        const txBuf = Buffer.from(buyData.transaction, 'base64');
        let sig: string;
        try {
          // Try VersionedTransaction first (Bags typically returns these)
          const vtx = VersionedTransaction.deserialize(txBuf);
          if (wallet.connected && wallet.signTransaction) {
            const signed = await wallet.signTransaction(vtx as any);
            sig = await connection.sendRawTransaction((signed as any).serialize());
          } else {
            const privyWallet = privyWallets?.[0];
            if (!privyWallet) throw new Error('No wallet available');
            const signed = await (privyWallet as any).signTransaction(vtx);
            sig = await connection.sendRawTransaction(signed.serialize());
          }
        } catch {
          // Fallback to legacy Transaction
          const tx = Transaction.from(txBuf);
          sig = await sendTx(tx, connection);
        }

        await connection.confirmTransaction(sig, 'confirmed');
        setSuccess(true);
        // Pool stats update via Bags webhook automatically
      } else {
        // ── Fallback: direct SOL transfer for pools without Bags token ──
        const treasury = new PublicKey(
          process.env.NEXT_PUBLIC_LUXHUB_WALLET || p.vendorWallet || ''
        );
        const tx = new Transaction().add(
          (await import('@solana/web3.js')).SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: treasury,
            lamports: Math.round(solIn * LAMPORTS_PER_SOL),
          })
        );
        const sig = await sendTx(tx, connection);
        await connection.confirmTransaction(sig, 'confirmed');

        // Record in MongoDB for non-Bags pools
        const investRes = await fetch('/api/pool/invest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id,
            investorWallet: publicKey.toBase58(),
            shares: tokensOut,
            investedUSD: usdEquiv,
            txSignature: sig,
          }),
        });
        const investData = await investRes.json();
        if (!investRes.ok) throw new Error(investData.error || 'Failed');
        setSuccess(true);
      }

      onInvestmentComplete?.();
      refreshStatus();
    } catch (err: any) {
      setError(err.message?.includes('User rejected') ? 'Cancelled' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!connected || !publicKey) return setError('Connect your wallet');
    if (sellTkns <= 0) return setError('Enter token amount');
    if (sellTkns > userTkns) return setError(`You only have ${fmt(userTkns)} tokens`);

    setLoading(true);
    setError(null);
    try {
      const connection = new Connection(getClusterConfig().endpoint);

      if (p.bagsTokenMint && !p.graduated) {
        // ── Real Bags bonding curve sell ──
        const sellRes = await fetch('/api/pool/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id,
            sellerWallet: publicKey.toBase58(),
            tokenAmount: sellTkns,
            slippageBps: 200, // 2% slippage
          }),
        });
        const sellData = await sellRes.json();
        if (!sellRes.ok) throw new Error(sellData.error || 'Sell failed');

        // If Bags returned a transaction to sign
        if (sellData.transaction) {
          const txBuf = Buffer.from(sellData.transaction, 'base64');
          let sig: string;
          try {
            const vtx = VersionedTransaction.deserialize(txBuf);
            if (wallet.connected && wallet.signTransaction) {
              const signed = await wallet.signTransaction(vtx as any);
              sig = await connection.sendRawTransaction((signed as any).serialize());
            } else {
              const privyWallet = privyWallets?.[0];
              if (!privyWallet) throw new Error('No wallet available');
              const signed = await (privyWallet as any).signTransaction(vtx);
              sig = await connection.sendRawTransaction(signed.serialize());
            }
          } catch {
            const tx = Transaction.from(txBuf);
            sig = await sendTx(tx, connection);
          }
          await connection.confirmTransaction(sig, 'confirmed');
        }

        setSuccess(true);
      } else {
        // ── Fallback for non-Bags pools ──
        const sellRes = await fetch('/api/pool/sell', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id,
            sellerWallet: publicKey.toBase58(),
            tokenAmount: sellTkns,
            minSolOutput: sellUsd * 0.97 * 0.98, // 3% fee + 2% slippage
          }),
        });
        const sellData = await sellRes.json();
        if (!sellRes.ok) throw new Error(sellData.error || 'Sell failed');
        setSuccess(true);
      }

      onInvestmentComplete?.();
      refreshStatus();
    } catch (err: any) {
      setError(err.message?.includes('User rejected') ? 'Cancelled' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.page} onClick={(e) => e.stopPropagation()}>
        {/* ── Top Bar ── */}
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <div className={styles.assetThumb} style={{ position: 'relative' }}>
              <Image
                src={assetImage}
                alt=""
                fill
                style={{ objectFit: 'cover' }}
                unoptimized
                onError={handleImageError}
              />
            </div>
            <div>
              <div className={styles.topTitle}>
                {p.asset?.brand && <span className={styles.topBrand}>{p.asset.brand}</span>}
                <span>{p.asset?.model || 'Luxury Watch'}</span>
              </div>
              <div className={styles.topMeta}>
                <span className={styles.topPool}>#{p.poolNumber || p._id.slice(-6)}</span>
                <span
                  className={styles.topStatus}
                  style={{ '--sc': st.color } as React.CSSProperties}
                >
                  {st.label}
                </span>
                {/* Live price from DexScreener if available, otherwise from DB */}
                {(() => {
                  const livePrice = dexScreenerData?.priceUsd
                    ? parseFloat(dexScreenerData.priceUsd)
                    : null;
                  const liveNative = dexScreenerData?.priceNative
                    ? parseFloat(dexScreenerData.priceNative)
                    : null;
                  const displayPriceSol = liveNative || curPriceSol;
                  const displayPriceUsd = livePrice || curPriceUSD;
                  const change24h = dexScreenerData?.priceChange?.h24;
                  const isUp = change24h !== undefined && change24h >= 0;
                  return (
                    <>
                      <span className={styles.topPrice}>{fmtSol(displayPriceSol)}</span>
                      <span className={styles.topUsd}>{fmtPrice(displayPriceUsd)}</span>
                      {change24h !== undefined && change24h !== null && (
                        <span
                          style={{
                            color: isUp ? '#26a69a' : '#ef5350',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {isUp ? '+' : ''}
                          {change24h.toFixed(2)}%
                        </span>
                      )}
                      {dexScreenerData && (
                        <span style={{ fontSize: '9px', color: '#6b7280' }}>LIVE</span>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          <div className={styles.topRight}>
            {/* Market cap — from DexScreener or calculated */}
            <div className={styles.topStat}>
              <span className={styles.topStatLabel}>MCap</span>
              <span className={styles.topStatVal}>
                {(() => {
                  const price = dexScreenerData?.priceUsd
                    ? parseFloat(dexScreenerData.priceUsd)
                    : curPriceUSD;
                  const mcap = price * (p.totalShares || 1_000_000_000);
                  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
                  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
                  return `$${mcap.toFixed(0)}`;
                })()}
              </span>
            </div>
            <div className={styles.topStat}>
              <span className={styles.topStatLabel}>Vol 24h</span>
              <span className={styles.topStatVal}>
                $
                {(() => {
                  const vol = dexScreenerData?.volume24h || p.totalVolumeUSD || 0;
                  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
                  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K`;
                  return vol.toFixed(0);
                })()}
              </span>
            </div>
            <div className={styles.topStat}>
              <span className={styles.topStatLabel}>Txns 24h</span>
              <span className={styles.topStatVal}>
                {dexScreenerData?.txns24h
                  ? `${dexScreenerData.txns24h.buys + dexScreenerData.txns24h.sells}`
                  : p.totalTrades || 0}
              </span>
            </div>
            <div className={styles.topStat}>
              <span className={styles.topStatLabel}>Holders</span>
              <span className={styles.topStatVal}>{holders}</span>
            </div>
            <div className={styles.topStat}>
              <span className={styles.topStatLabel}>Target</span>
              <span className={styles.topStatVal}>{targetSol.toFixed(1)} SOL</span>
            </div>
            <button className={styles.closeBtn} onClick={onClose}>
              <HiOutlineX />
            </button>
          </div>
        </div>

        {/* ── Main Grid: Chart + Sidebar ── */}
        <div className={styles.mainGrid}>
          {/* Chart Area */}
          <div className={styles.chartArea}>
            {/* Progress bar across top of chart */}
            <div className={styles.chartProgress}>
              <div className={styles.chartProgressFill} style={{ width: `${pct}%` }} />
              <span className={styles.chartProgressLabel}>{pct.toFixed(1)}% funded</span>
            </div>
            <div className={styles.chartContainer}>
              <TvChart
                data={priceHistory}
                interactive
                showTimeframes
                showToolbar
                totalSupply={p.totalShares || 1_000_000_000}
                chartType={
                  chartView === 'candle' ? 'candlestick' : chartView === 'line' ? 'line' : 'area'
                }
              />
            </div>
            {/* Chart controls now built into TvChart toolbar — no external buttons needed */}

            {/* Trade Feed — below chart */}
            <div className={styles.tradeFeed}>
              <span className={styles.tradeFeedLive}>
                <span className={styles.liveDot} /> Recent Trades
              </span>
              <div className={styles.tradeFeedList}>
                {p.recentTrades && p.recentTrades.length > 0 ? (
                  p.recentTrades.slice(-6).map((t, i) => (
                    <div
                      key={t.txSignature || i}
                      className={t.type === 'sell' ? styles.tradeFeedSell : styles.tradeFeedBuy}
                    >
                      <span
                        className={t.type === 'sell' ? styles.tradeDotSell : styles.tradeDotBuy}
                      />
                      <span className={styles.tradeWallet}>
                        {t.wallet.slice(0, 4)}...{t.wallet.slice(-4)}
                      </span>
                      <span className={styles.tradeType}>
                        {t.type === 'buy' ? 'bought' : 'sold'}
                      </span>
                      <span
                        className={
                          t.type === 'sell' ? styles.tradeAmountSell : styles.tradeAmountBuy
                        }
                      >
                        {t.type === 'sell' ? '-' : '+'}
                        {fmt(t.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className={styles.tradeFeedEmpty}>No trades yet</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Sidebar: Trading Tools ── */}
          <div className={styles.sidebar}>
            {/* Tabs */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'buy' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('buy')}
              >
                Buy / Sell
              </button>
              {hasToken && (
                <button
                  className={`${styles.tab} ${activeTab === 'trade' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('trade')}
                >
                  Trade
                </button>
              )}
              {hasGov && (
                <button
                  className={`${styles.tab} ${activeTab === 'governance' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('governance')}
                >
                  DAO
                </button>
              )}
            </div>

            {/* Buy/Sell Panel */}
            {activeTab === 'buy' && (
              <div className={styles.tradePanel}>
                {/* Toggle */}
                <div className={styles.buySellToggle}>
                  <button
                    className={`${styles.buySellBtn} ${tradeMode === 'buy' ? styles.buySellBuy : ''}`}
                    onClick={() => {
                      setTradeMode('buy');
                      setSolAmount('');
                    }}
                  >
                    Buy
                  </button>
                  <button
                    className={`${styles.buySellBtn} ${tradeMode === 'sell' ? styles.buySellSell : ''}`}
                    onClick={() => {
                      setTradeMode('sell');
                      setSolAmount('');
                    }}
                  >
                    Sell
                  </button>
                </div>

                {tradeMode === 'buy' ? (
                  <>
                    <div className={styles.inputPanel}>
                      <div className={styles.inputRow}>
                        <span className={styles.inputLabel}>You pay</span>
                        <div className={styles.inputField}>
                          <input
                            type="number"
                            value={solAmount}
                            onChange={(e) => setSolAmount(e.target.value)}
                            placeholder="0.00"
                            step="0.01"
                            min="0"
                            className={styles.numInput}
                          />
                          <span className={styles.inputBadge}>SOL</span>
                        </div>
                      </div>
                      <span className={styles.inputSub}>≈ ${usdEquiv.toFixed(2)} USD</span>
                    </div>
                    <div className={styles.quickRow}>
                      {[0.1, 0.5, 1, 5].map((a) => (
                        <button
                          key={a}
                          className={styles.quickBtn}
                          onClick={() => setSolAmount(String(a))}
                        >
                          {a} SOL
                        </button>
                      ))}
                    </div>
                    <div className={styles.receivePanel}>
                      <div className={styles.receiveRow}>
                        <span>You get</span>
                        <span className={styles.receiveVal}>{fmt(tokensOut)} tokens</span>
                      </div>
                      <div className={styles.receiveRow}>
                        <span>Ownership</span>
                        <span>{ownPct.toFixed(4)}%</span>
                      </div>
                      <div className={styles.receiveRow}>
                        <span>Price</span>
                        <span>{curPriceSol.toFixed(8)} SOL</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.inputPanel}>
                      <div className={styles.inputRow}>
                        <span className={styles.inputLabel}>You sell</span>
                        <div className={styles.inputField}>
                          <input
                            type="number"
                            value={solAmount}
                            onChange={(e) => setSolAmount(e.target.value)}
                            placeholder="0"
                            step="1"
                            min="0"
                            className={styles.numInput}
                          />
                          <span className={styles.inputBadge}>TOKENS</span>
                        </div>
                      </div>
                      <span className={styles.inputSub}>
                        ≈ {sellSol.toFixed(4)} SOL (${sellUsd.toFixed(2)})
                        {userTkns > 0 && ` · Hold: ${fmt(userTkns)}`}
                      </span>
                    </div>
                    <div className={styles.quickRow}>
                      {[25, 50, 75, 100].map((pc) => (
                        <button
                          key={pc}
                          className={styles.quickBtn}
                          onClick={() => setSolAmount(String(Math.floor((userTkns * pc) / 100)))}
                          disabled={userTkns <= 0}
                        >
                          {pc === 100 ? 'MAX' : `${pc}%`}
                        </button>
                      ))}
                    </div>
                    <div className={styles.receivePanel}>
                      <div className={styles.receiveRow}>
                        <span>You get</span>
                        <span className={styles.receiveValGreen}>{sellSol.toFixed(4)} SOL</span>
                      </div>
                      <div className={styles.receiveRow}>
                        <span>Remaining</span>
                        <span>{fmt(Math.max(0, userTkns - sellTkns))}</span>
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <div className={styles.errorMsg}>
                    <FiAlertTriangle /> {error}
                  </div>
                )}
                {success && (
                  <div className={styles.successMsg}>
                    <FiCheckCircle />{' '}
                    {tradeMode === 'buy' ? `Bought ${fmt(tokensOut)}` : `Sold ${fmt(sellTkns)}`}{' '}
                    tokens
                  </div>
                )}

                {tradeMode === 'buy' ? (
                  <button
                    className={styles.buyBtn}
                    onClick={handleBuy}
                    disabled={loading || !connected || success || solIn <= 0}
                  >
                    {loading ? (
                      <>
                        <FiLoader className={styles.spinner} /> Processing...
                      </>
                    ) : !connected ? (
                      'Connect Wallet'
                    ) : solIn <= 0 ? (
                      'Enter Amount'
                    ) : (
                      `Buy ${fmt(tokensOut)} Tokens`
                    )}
                  </button>
                ) : (
                  <button
                    className={styles.sellBtn}
                    onClick={handleSell}
                    disabled={
                      loading || !connected || success || sellTkns <= 0 || sellTkns > userTkns
                    }
                  >
                    {loading ? (
                      <>
                        <FiLoader className={styles.spinner} /> Processing...
                      </>
                    ) : !connected ? (
                      'Connect Wallet'
                    ) : sellTkns <= 0 ? (
                      'Enter Amount'
                    ) : (
                      `Sell for ${sellSol.toFixed(4)} SOL`
                    )}
                  </button>
                )}

                <div className={styles.escrowNotice}>
                  <FiShield className={styles.escrowIcon} />
                  <span>
                    {tradeMode === 'buy'
                      ? 'On-chain escrow. Exit before pool fills.'
                      : 'Tokens burned via bonding curve.'}
                  </span>
                </div>
              </div>
            )}

            {activeTab === 'trade' && (
              <div className={styles.tradePanel}>
                <BagsPoolTrading
                  pool={p}
                  userShares={userTkns}
                  onTradeComplete={() => {
                    refreshStatus();
                    onInvestmentComplete?.();
                  }}
                />
              </div>
            )}

            {activeTab === 'governance' && hasGov && (
              <div className={styles.tradePanel}>
                <GovernanceDashboard
                  pool={p}
                  onProposalCreated={refreshStatus}
                  onVoteComplete={refreshStatus}
                />
              </div>
            )}

            {/* Your Position */}
            {userPos && (
              <div className={styles.positionBar}>
                <span className={styles.positionTitle}>Your Position</span>
                <div className={styles.positionStats}>
                  <div>
                    <span>{fmt(userPos.shares)}</span>
                    <small>tokens</small>
                  </div>
                  <div>
                    <span>{userPos.ownershipPercent.toFixed(2)}%</span>
                    <small>ownership</small>
                  </div>
                  <div>
                    <span>${userPos.investedUSD.toLocaleString()}</span>
                    <small>spent</small>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolDetail;
