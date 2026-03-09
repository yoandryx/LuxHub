// src/pages/pools.tsx
// Investment Pools – Clean Minimalist Design
// LuxHub × Bags — Fractional Luxury Asset Ownership
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import Head from 'next/head';

import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import {
  FiTrendingUp,
  FiRefreshCw,
  FiLock,
  FiBarChart2,
  FiPieChart,
  FiImage,
} from 'react-icons/fi';
import { usePlatformStats, usePools, useUserPortfolio, Pool } from '../hooks/usePools';
import styles from '../styles/PoolsNew.module.css';

// ─── Status Config ──────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  open: 'statusOpen',
  filled: 'statusFilled',
  funded: 'statusFunded',
  custody: 'statusCustody',
  active: 'statusActive',
  graduated: 'statusGraduated',
  listed: 'statusListed',
  sold: 'statusSold',
  distributed: 'statusDefault',
  closed: 'statusDefault',
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  filled: 'Filled',
  funded: 'Funded',
  custody: 'Custody',
  active: 'Active',
  graduated: 'Graduated',
  listed: 'Listed',
  sold: 'Sold',
  distributed: 'Distributed',
  closed: 'Closed',
};

// ─── Filters ────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all', label: 'All Pools' },
  { key: 'open', label: 'Open' },
  { key: 'funded', label: 'Funded' },
  { key: 'active', label: 'Active' },
  { key: 'tradeable', label: 'Tradeable' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

// ─── Steps ──────────────────────────────────────────────────────
const LIFECYCLE = [
  { num: '1', title: 'Browse & Invest', desc: 'Choose a pool and take a position' },
  { num: '2', title: 'Pool Fills', desc: 'Asset funded by investors' },
  { num: '3', title: 'Custody Verified', desc: 'Asset shipped & secured' },
  { num: '4', title: 'Trade or Earn', desc: 'Trade positions, earn on resale' },
];

// ─── TradingView Mini Chart ──────────────────────────────────────
const TvChart = memo(({ data }: { data: number[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || data.length < 2) return;
    let cancelled = false;

    import('lightweight-charts').then((lc) => {
      if (cancelled || !containerRef.current) return;

      // Clean up previous chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }

      const isUp = data[data.length - 1] >= data[0];
      const lineColor = isUp ? '#4ade80' : '#f87171';
      const topColor = isUp ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)';
      const bottomColor = isUp ? 'rgba(74, 222, 128, 0)' : 'rgba(248, 113, 113, 0)';

      const chart = lc.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
        layout: {
          background: { type: lc.ColorType.Solid, color: 'transparent' },
          textColor: 'rgba(255,255,255,0.4)',
          fontSize: 9,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: 'rgba(255,255,255,0.04)', style: 3 },
        },
        crosshair: {
          vertLine: { color: 'rgba(200,161,255,0.3)', labelVisible: false },
          horzLine: { color: 'rgba(200,161,255,0.3)', labelVisible: true },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.05 },
        },
        timeScale: {
          borderVisible: false,
          visible: false,
        },
        handleScale: false,
        handleScroll: false,
      });

      const series = chart.addSeries(lc.AreaSeries, {
        lineColor,
        topColor,
        bottomColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: lineColor,
        crosshairMarkerBackgroundColor: '#0a0a0f',
      });

      // Map data to time series — use synthetic timestamps
      const now = Math.floor(Date.now() / 1000);
      const chartData = data.map((value, i) => ({
        time: (now - (data.length - 1 - i) * 60) as any,
        value,
      }));
      series.setData(chartData);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      seriesRef.current = series;

      // Resize observer
      const ro = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
      });
      ro.observe(containerRef.current);

      return () => ro.disconnect();
    });

    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [data]);

  // Update data without recreating the chart
  useEffect(() => {
    if (!seriesRef.current || data.length < 2) return;
    const now = Math.floor(Date.now() / 1000);
    const chartData = data.map((value, i) => ({
      time: (now - (data.length - 1 - i) * 60) as any,
      value,
    }));
    seriesRef.current.setData(chartData);
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});
TvChart.displayName = 'TvChart';

// Generate simulated price history from a starting price
function generatePriceHistory(basePrice: number, points: number = 30): number[] {
  const prices: number[] = [basePrice];
  for (let i = 1; i < points; i++) {
    const change = (Math.random() - 0.42) * basePrice * 0.04; // slight upward bias
    prices.push(Math.max(basePrice * 0.7, prices[i - 1] + change));
  }
  return prices;
}

// ─── Pool Card ──────────────────────────────────────────────────
const PoolCard = memo(({ pool, onClick }: { pool: Pool; onClick: () => void }) => {
  const [showChart, setShowChart] = useState(false);
  const priceHistory = useMemo(
    () => generatePriceHistory(pool.sharePriceUSD),
    [pool.sharePriceUSD]
  );

  const percentFilled = useMemo(
    () => (pool.totalShares > 0 ? (pool.sharesSold / pool.totalShares) * 100 : 0),
    [pool.totalShares, pool.sharesSold]
  );

  const investorCount = useMemo(
    () => new Set(pool.participants?.map((p) => p.wallet) || []).size,
    [pool.participants]
  );

  const image =
    pool.asset?.imageIpfsUrls?.[0] || pool.asset?.images?.[0] || '/images/placeholder-watch.png';
  const brand = pool.asset?.brand || '';
  const model = pool.asset?.model || 'Luxury Watch';
  const tokensLeft = pool.totalShares - pool.sharesSold;
  const roiPercent = ((pool.projectedROI - 1) * 100).toFixed(0);
  const isHot = pool.status === 'open' && percentFilled > 60;
  const isTradeable = !!pool.bagsTokenMint && pool.tokenStatus === 'unlocked';
  const statusClass = STATUS_STYLE[pool.status] || 'statusDefault';

  const timeAgo = useMemo(() => {
    if (!pool.createdAt) return '';
    const diff = Date.now() - new Date(pool.createdAt).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Now';
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }, [pool.createdAt]);

  return (
    <div className={`${styles.card} ${isHot ? styles.cardHot : ''}`} onClick={onClick}>
      <div className={styles.cardImage}>
        <img src={image} alt={model} loading="lazy" />
        {showChart && (
          <div className={styles.cardChart}>
            <TvChart data={priceHistory} />
          </div>
        )}
        <button
          className={`${styles.chartToggle} ${showChart ? styles.chartToggleActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowChart(!showChart);
          }}
          title={showChart ? 'Show image' : 'Show chart'}
        >
          {showChart ? <FiImage size={13} /> : <FiBarChart2 size={13} />}
        </button>
        <div className={styles.cardBadges}>
          <span className={`${styles.statusPill} ${styles[statusClass]}`}>
            {STATUS_LABEL[pool.status] || pool.status}
          </span>
          {isTradeable && <span className={styles.tradeablePill}>Tradeable</span>}
        </div>
      </div>

      <div className={styles.cardBody}>
        {brand && <div className={styles.cardBrand}>{brand}</div>}
        <div className={styles.cardTitleRow}>
          <span className={styles.cardTitle}>{model}</span>
          {pool.projectedROI > 1 && (
            <span className={styles.cardRoi}>
              <FiTrendingUp size={11} />
              {roiPercent}%
            </span>
          )}
        </div>

        <div className={styles.cardTrade} onClick={(e) => e.stopPropagation()}>
          {pool.status === 'open' && tokensLeft > 0 ? (
            <>
              <div className={styles.cardTradeAmounts}>
                {['0.1', '0.5', '1', '5'].map((sol) => (
                  <button key={sol} className={styles.cardTradeChip}>
                    {sol} SOL
                  </button>
                ))}
              </div>
              <div className={styles.cardTradeActions}>
                <button className={styles.cardBuyBtn}>Buy</button>
                <button className={styles.cardSellBtn}>Sell</button>
              </div>
            </>
          ) : (
            <button className={styles.cardCtaBtnSecondary} onClick={onClick}>
              View Details
              {timeAgo && <span className={styles.cardTime}>{timeAgo}</span>}
            </button>
          )}
        </div>

        <div className={styles.cardProgress}>
          <div className={styles.cardProgressHeader}>
            <span>Funding</span>
            <span className={styles.cardProgressPercent}>{percentFilled.toFixed(1)}%</span>
          </div>
          <div className={styles.cardProgressTrack}>
            <div
              className={`${styles.cardProgressFill} ${percentFilled >= 80 ? styles.cardProgressFillHigh : ''}`}
              style={{ width: `${Math.min(percentFilled, 100)}%` }}
            />
          </div>
          <div className={styles.cardProgressMeta}>
            <span>
              {pool.sharesSold}/{pool.totalShares} tokens
            </span>
            <span>
              {investorCount} holder{investorCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className={styles.cardStats}>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Entry</span>
            <span className={styles.cardStatValue}>${pool.sharePriceUSD.toLocaleString()}</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Target</span>
            <span className={styles.cardStatValue}>${pool.targetAmountUSD.toLocaleString()}</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Min</span>
            <span className={styles.cardStatValue}>${pool.minBuyInUSD.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
PoolCard.displayName = 'PoolCard';

// ─── Demo Pool Cards (Animated with on-chain NFTs) ──────────────
const DEMO_WALLETS = [
  '7xKp...3mFv',
  'Bq2R...9nTz',
  '4vWs...kL8j',
  'mN6d...2pYx',
  'Ht5a...wQ7c',
  '9gFr...sV4b',
  'Zk3e...dM1n',
  'Jw8u...hR6f',
];

interface DemoPoolData {
  brand: string;
  model: string;
  image: string;
  totalTokens: number;
  startTokens: number;
  tokenPriceUSD: number;
  minBuyInUSD: number;
  projectedROI: number;
  status: string;
}

const DEMO_POOLS: DemoPoolData[] = [
  {
    brand: 'ROLEX',
    model: 'Daytona Rainbow',
    image: '/images/rolex-daytona-rainbow.jpg',
    totalTokens: 1000,
    startTokens: 420,
    tokenPriceUSD: 485,
    minBuyInUSD: 485,
    projectedROI: 24,
    status: 'open',
  },
  {
    brand: 'RICHARD MILLE',
    model: 'RM 027 Tourbillon',
    image: '/images/rm-027.jpg',
    totalTokens: 500,
    startTokens: 310,
    tokenPriceUSD: 2500,
    minBuyInUSD: 2500,
    projectedROI: 18,
    status: 'open',
  },
  {
    brand: 'AUDEMARS PIGUET',
    model: 'Royal Oak Offshore',
    image: '/images/ap-offshore.jpg',
    totalTokens: 800,
    startTokens: 650,
    tokenPriceUSD: 72,
    minBuyInUSD: 72,
    projectedROI: 31,
    status: 'open',
  },
  {
    brand: 'CARTIER',
    model: 'Roadster Rose Gold',
    image: '/images/cartier-crash.jpg',
    totalTokens: 400,
    startTokens: 180,
    tokenPriceUSD: 81,
    minBuyInUSD: 81,
    projectedROI: 15,
    status: 'open',
  },
];

const DemoPoolCard = memo(({ pool: demoPool }: { pool: DemoPoolData }) => {
  const [tokensSold, setTokensSold] = useState(demoPool.startTokens);
  const [holders, setHolders] = useState(Math.floor(demoPool.startTokens / 25) + 3);
  const [feed, setFeed] = useState<
    { wallet: string; amount: number; type: 'buy' | 'sell'; id: number }[]
  >([]);
  const [showChart, setShowChart] = useState(false);
  const [priceHistory, setPriceHistory] = useState<number[]>(() =>
    generatePriceHistory(demoPool.tokenPriceUSD, 20)
  );
  const nextId = useRef(0);
  const percentFilled = (tokensSold / demoPool.totalTokens) * 100;
  const targetUSD = demoPool.totalTokens * demoPool.tokenPriceUSD;
  const isHot = percentFilled > 60;

  useEffect(() => {
    const interval = setInterval(
      () => {
        const isSell = Math.random() < 0.25;
        const wallet = DEMO_WALLETS[Math.floor(Math.random() * DEMO_WALLETS.length)];
        const amount = Math.floor(Math.random() * 12) + 1;
        const id = nextId.current++;

        if (isSell && tokensSold > demoPool.startTokens * 0.3) {
          setTokensSold((prev: number) => Math.max(prev - amount, demoPool.startTokens * 0.3));
          setFeed((prev) => [...prev.slice(-2), { wallet, amount, type: 'sell', id }]);
          // Price dips on sell
          setPriceHistory((prev) => {
            const last = prev[prev.length - 1];
            const next = last * (1 - Math.random() * 0.015);
            return [...prev.slice(-39), next];
          });
        } else {
          setTokensSold((prev: number) => {
            if (prev >= demoPool.totalTokens) return demoPool.startTokens;
            return Math.min(prev + amount, demoPool.totalTokens);
          });
          setHolders((prev: number) => {
            if (prev >= 60) return Math.floor(demoPool.startTokens / 25) + 3;
            return prev + (Math.random() > 0.6 ? 1 : 0);
          });
          setFeed((prev) => [...prev.slice(-2), { wallet, amount, type: 'buy', id }]);
          // Price bumps on buy
          setPriceHistory((prev) => {
            const last = prev[prev.length - 1];
            const next = last * (1 + Math.random() * 0.02);
            return [...prev.slice(-39), next];
          });
        }
      },
      1800 + Math.random() * 1200
    );
    return () => clearInterval(interval);
  }, [demoPool, tokensSold]);

  const formatTarget = (val: number) => {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
    return `$${val}`;
  };

  return (
    <div className={`${styles.card} ${isHot ? styles.cardHot : ''}`}>
      <div className={styles.cardImage}>
        <img src={demoPool.image} alt={demoPool.model} loading="lazy" />
        {showChart && (
          <div className={styles.cardChart}>
            <TvChart data={priceHistory} />
          </div>
        )}
        <button
          className={`${styles.chartToggle} ${showChart ? styles.chartToggleActive : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setShowChart(!showChart);
          }}
          title={showChart ? 'Show image' : 'Show chart'}
        >
          {showChart ? <FiImage size={13} /> : <FiBarChart2 size={13} />}
        </button>
        <div className={styles.cardBadges}>
          <span className={`${styles.statusPill} ${styles.statusOpen}`}>Open</span>
        </div>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardBrand}>{demoPool.brand}</div>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardTitle}>{demoPool.model}</span>
          <span className={styles.cardRoi}>
            <FiTrendingUp size={11} />
            {demoPool.projectedROI}%
          </span>
        </div>

        <div className={styles.cardTrade}>
          <div className={styles.cardTradeAmounts}>
            {['0.1', '0.5', '1', '5'].map((sol) => (
              <button key={sol} className={styles.cardTradeChip}>
                {sol} SOL
              </button>
            ))}
          </div>
          <div className={styles.cardTradeActions}>
            <button className={styles.cardBuyBtn}>Buy</button>
            <button className={styles.cardSellBtn}>Sell</button>
          </div>
        </div>

        <div className={styles.cardProgress}>
          <div className={styles.cardProgressHeader}>
            <span>Funding</span>
            <span className={styles.cardProgressPercent}>{percentFilled.toFixed(1)}%</span>
          </div>
          <div className={styles.cardProgressTrack}>
            <div
              className={`${styles.cardProgressFill} ${percentFilled >= 80 ? styles.cardProgressFillHigh : ''}`}
              style={{ width: `${Math.min(percentFilled, 100)}%` }}
            />
          </div>
          <div className={styles.cardProgressMeta}>
            <span>
              {Math.round(tokensSold)}/{demoPool.totalTokens} tokens
            </span>
            <span>{holders} holders</span>
          </div>
        </div>

        <div className={styles.demoBuyFeed}>
          {feed.map((item) => (
            <div
              key={item.id}
              className={item.type === 'sell' ? styles.demoSellRow : styles.demoBuyRow}
            >
              <span className={item.type === 'sell' ? styles.demoSellDot : styles.demoBuyDot} />
              <span className={styles.demoBuyWallet}>{item.wallet}</span>
              <span className={item.type === 'sell' ? styles.demoSellShares : styles.demoBuyShares}>
                {item.type === 'sell' ? '-' : '+'}
                {item.amount} tokens
              </span>
            </div>
          ))}
        </div>

        <div className={styles.cardStats}>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Entry</span>
            <span className={styles.cardStatValue}>${demoPool.tokenPriceUSD.toLocaleString()}</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Target</span>
            <span className={styles.cardStatValue}>{formatTarget(targetUSD)}</span>
          </div>
          <div className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Min</span>
            <span className={styles.cardStatValue}>${demoPool.minBuyInUSD.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
DemoPoolCard.displayName = 'DemoPoolCard';

// ─── Bags Trade Panel (Sidebar) ─────────────────────────────────
const BagsTradePanel: React.FC<{ pool: Pool | null; onTradeComplete?: () => void }> = ({
  pool,
  onTradeComplete,
}) => {
  const { publicKey, signTransaction, connected } = useWallet();
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [outputToken, setOutputToken] = useState<'USDC' | 'SOL'>('USDC');
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  const poolTokenMint = pool?.bagsTokenMint;
  const hasToken = !!poolTokenMint;
  const tokenStatus = pool?.tokenStatus || 'pending';
  const liquidityModel = pool?.liquidityModel || 'p2p';
  const isTokenTradeable = hasToken && tokenStatus === 'unlocked';
  const isTokenLocked = hasToken && tokenStatus === 'minted';
  const isAmmEnabled =
    pool?.ammEnabled && (liquidityModel === 'amm' || liquidityModel === 'hybrid');

  // Fetch quote
  const fetchQuote = useCallback(async () => {
    if (!pool || !poolTokenMint || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    setError(null);
    try {
      const outputMint = outputToken === 'USDC' ? USDC_MINT : SOL_MINT;
      const params = new URLSearchParams({
        poolId: pool._id,
        amount,
        slippageBps: '100',
      });
      if (tradeType === 'sell') {
        params.set('inputMint', poolTokenMint);
        params.set('outputMint', outputMint);
      } else {
        params.set('inputMint', outputMint);
        params.set('outputMint', poolTokenMint);
      }
      const res = await fetch(`/api/bags/trade-quote?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get quote');
      setQuote(data.quote);
    } catch (err: any) {
      setError(err.message);
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [pool, poolTokenMint, amount, tradeType, outputToken]);

  // Debounced quote
  useEffect(() => {
    if (!hasToken || !amount || !isTokenTradeable) return;
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote, hasToken, amount, isTokenTradeable]);

  // Execute trade
  const executeTrade = async () => {
    if (!connected || !publicKey || !signTransaction || !quote || !pool || !poolTokenMint) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const outputMint = outputToken === 'USDC' ? USDC_MINT : SOL_MINT;
      const res = await fetch('/api/bags/execute-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          inputMint: tradeType === 'sell' ? poolTokenMint : outputMint,
          outputMint: tradeType === 'sell' ? outputMint : poolTokenMint,
          amount,
          userWallet: publicKey.toBase58(),
          slippageBps: '100',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to build transaction');
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'
      );
      const txBuffer = Buffer.from(data.transaction.serialized, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);
      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, 'confirmed');
      setTxSignature(signature);
      setSuccess('Trade executed successfully!');
      onTradeComplete?.();
    } catch (err: any) {
      setError(err.message || 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  // No pool selected
  if (!pool) {
    return (
      <div className={styles.tradePanel}>
        <div className={styles.tradePanelHeader}>
          <div className={styles.tradePanelTitle}>
            <h3>Trade</h3>
            <span className={styles.tradePanelBagsChip}>
              <img src="/images/bags-icon.png" alt="" className={styles.tradePanelBagsIcon} />
              Bags
            </span>
          </div>
        </div>
        <div className={styles.tradeNoPool}>
          <div className={styles.tradeNoPoolIcon}>
            <FiBarChart2 />
          </div>
          <p className={styles.tradeNoPoolText}>Select a pool to trade</p>
          <p className={styles.tradeNoPoolSub}>Click any pool card to view trading options</p>
        </div>
      </div>
    );
  }

  // No token yet
  if (!hasToken) {
    return (
      <div className={styles.tradePanel}>
        <div className={styles.tradePanelHeader}>
          <div className={styles.tradePanelTitle}>
            <h3>Trade</h3>
            <span className={styles.tradePanelBagsChip}>
              <img src="/images/bags-icon.png" alt="" className={styles.tradePanelBagsIcon} />
              Bags
            </span>
          </div>
        </div>
        <div className={styles.tradeNoPool}>
          <div className={styles.tradeNoPoolIcon}>
            <FiLock />
          </div>
          <p className={styles.tradeNoPoolText}>Not yet tokenized</p>
          <p className={styles.tradeNoPoolSub}>
            Trading for {pool.asset?.model || 'this pool'} will be available once tokenized via Bags
          </p>
        </div>
      </div>
    );
  }

  // Locked tokens
  if (isTokenLocked) {
    return (
      <div className={styles.tradePanel}>
        <div className={styles.tradePanelHeader}>
          <div className={styles.tradePanelTitle}>
            <h3>Trade</h3>
            <span className={styles.tradePanelBagsChip}>
              <img src="/images/bags-icon.png" alt="" className={styles.tradePanelBagsIcon} />
              Bags
            </span>
          </div>
        </div>
        <div className={styles.tradeLocked}>
          <div className={styles.tradeLockedIcon}>🔐</div>
          <p className={styles.tradeLockedTitle}>Trading Locked</p>
          <p className={styles.tradeLockedDesc}>
            Tokens are minted but locked until asset custody is verified
          </p>
          <div className={styles.tradeLockedSteps}>
            <div className={styles.tradeLockedStep}>
              <span className={styles.tradeLockedStepNum}>1</span>
              <span>Pool fills to 100%</span>
            </div>
            <div className={styles.tradeLockedStep}>
              <span className={styles.tradeLockedStepNum}>2</span>
              <span>Vendor ships to LuxHub</span>
            </div>
            <div className={styles.tradeLockedStep}>
              <span className={styles.tradeLockedStepNum}>3</span>
              <span>Asset verified in custody</span>
            </div>
            <div className={styles.tradeLockedStep}>
              <span className={styles.tradeLockedStepNum}>4</span>
              <span>Trading unlocks</span>
            </div>
          </div>
          <div className={styles.tradeLiquidityChip}>
            {liquidityModel === 'amm'
              ? `AMM (${pool.ammLiquidityPercent || 30}%)`
              : liquidityModel === 'hybrid'
                ? 'Hybrid'
                : 'P2P'}
          </div>
          <div className={styles.tradeTokenMint}>
            {poolTokenMint?.slice(0, 8)}...{poolTokenMint?.slice(-6)}
          </div>
        </div>
      </div>
    );
  }

  // Frozen or burned
  if (tokenStatus === 'frozen' || tokenStatus === 'burned') {
    return (
      <div className={styles.tradePanel}>
        <div className={styles.tradePanelHeader}>
          <div className={styles.tradePanelTitle}>
            <h3>Trade</h3>
            <span className={styles.tradePanelBagsChip}>
              <img src="/images/bags-icon.png" alt="" className={styles.tradePanelBagsIcon} />
              Bags
            </span>
          </div>
        </div>
        <div className={styles.tradeNoPool}>
          <div className={styles.tradeNoPoolIcon}>{tokenStatus === 'frozen' ? '❄️' : '🔥'}</div>
          <p className={styles.tradeNoPoolText}>
            {tokenStatus === 'frozen' ? 'Trading Halted' : 'Pool Closed'}
          </p>
          <p className={styles.tradeNoPoolSub}>
            {tokenStatus === 'frozen'
              ? 'Trading temporarily halted'
              : 'Tokens burned, proceeds distributed'}
          </p>
        </div>
      </div>
    );
  }

  // Active trading
  return (
    <div className={styles.tradePanel}>
      <div className={styles.tradePanelHeader}>
        <div className={styles.tradePanelTitle}>
          <h3>{pool.asset?.model || 'Trade'}</h3>
          <span className={styles.tradePanelBagsChip}>
            <img src="/images/bags-icon.png" alt="" className={styles.tradePanelBagsIcon} />
            Bags
          </span>
        </div>
        {isAmmEnabled ? (
          <span className={`${styles.liquidityChip} ${styles.liquidityAmm}`}>
            AMM {pool.ammLiquidityPercent || 30}%
          </span>
        ) : (
          <span className={`${styles.liquidityChip} ${styles.liquidityP2p}`}>P2P</span>
        )}
      </div>

      <div className={styles.tradeTabs}>
        <button
          className={`${styles.tradeTab} ${tradeType === 'buy' ? styles.tradeTabActive : ''}`}
          onClick={() => setTradeType('buy')}
        >
          Buy
        </button>
        <button
          className={`${styles.tradeTab} ${tradeType === 'sell' ? styles.tradeTabActive : ''}`}
          onClick={() => setTradeType('sell')}
        >
          Sell
        </button>
      </div>

      <div className={styles.tradeBody}>
        <div className={styles.tradeInputGroup}>
          <span className={styles.tradeInputLabel}>
            {tradeType === 'buy' ? 'Amount to spend' : 'Tokens to sell'}
          </span>
          <div className={styles.tradeInputWrap}>
            <input
              type="number"
              className={styles.tradeInput}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              step={tradeType === 'sell' ? '1' : '0.01'}
            />
            {tradeType === 'buy' ? (
              <select
                value={outputToken}
                onChange={(e) => setOutputToken(e.target.value as 'USDC' | 'SOL')}
                className={styles.tradeTokenSelect}
              >
                <option value="USDC">USDC</option>
                <option value="SOL">SOL</option>
              </select>
            ) : (
              <span className={styles.tradeShareLabel}>Tokens</span>
            )}
          </div>
        </div>

        {quoteLoading ? (
          <div className={styles.tradeQuoteLoading}>
            <div className={styles.tradeSpinner} />
            <span>Getting quote...</span>
          </div>
        ) : quote ? (
          <div className={styles.tradeQuote}>
            <div className={styles.tradeQuoteHeader}>
              <span className={styles.tradeQuoteLabel}>Quote</span>
              <button className={styles.tradeQuoteRefresh} onClick={fetchQuote}>
                ↻
              </button>
            </div>
            <div className={styles.tradeQuoteRow}>
              <span>You {tradeType === 'buy' ? 'pay' : 'sell'}</span>
              <strong>
                {parseFloat(amount).toLocaleString()}{' '}
                {tradeType === 'sell' ? 'Tokens' : outputToken}
              </strong>
            </div>
            <div className={styles.tradeQuoteRow}>
              <span>You receive</span>
              <strong className={styles.tradeQuoteReceive}>
                {parseFloat(quote.outputAmount).toLocaleString()}{' '}
                {tradeType === 'buy' ? 'Tokens' : outputToken}
              </strong>
            </div>
            <div className={styles.tradeQuoteDetails}>
              <div className={styles.tradeQuoteDetail}>
                <span>Impact</span>
                <span
                  className={
                    parseFloat(quote.priceImpact) > 1 ? styles.tradeQuoteHighImpact : undefined
                  }
                >
                  {quote.priceImpact}
                </span>
              </div>
              <div className={styles.tradeQuoteDetail}>
                <span>Slippage</span>
                <span>{(parseInt(quote.slippageBps) / 100).toFixed(2)}%</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.tradeFee}>
          <span>Platform Fee</span>
          <span>3%</span>
        </div>

        {error && <div className={styles.tradeError}>{error}</div>}
        {success && (
          <div className={styles.tradeSuccess}>
            <p>{success}</p>
            {txSignature && (
              <a
                href={`https://solscan.io/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tradeSuccessLink}
              >
                View on Solscan →
              </a>
            )}
          </div>
        )}

        <button
          className={styles.tradeExecuteBtn}
          onClick={executeTrade}
          disabled={loading || !quote || !connected}
        >
          {loading ? (
            <>
              <div className={styles.tradeBtnSpinner} />
              Processing...
            </>
          ) : !connected ? (
            'Connect Wallet'
          ) : (
            `${tradeType === 'buy' ? 'Buy' : 'Sell'} Tokens`
          )}
        </button>
      </div>

      <div className={styles.tradeAttribution}>
        <span>Powered by</span>
        <a href="https://bags.fm" target="_blank" rel="noopener noreferrer">
          <img src="/images/bags-logo.svg" alt="Bags" className={styles.tradeAttrLogo} />
        </a>
      </div>
    </div>
  );
};

// ─── Main Page ──────────────────────────────────────────────────
const PoolsPage: React.FC = () => {
  const wallet = useWallet();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'roi' | 'volume'>('newest');
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { mutate: refreshStats } = usePlatformStats();
  const { pools, isLoading: poolsLoading, isError, error, mutate: refreshPools } = usePools();
  const { positions } = useUserPortfolio(wallet.publicKey?.toBase58() || null);

  // Filter & sort
  const filteredPools = useMemo(() => {
    return pools.filter((pool) => {
      if (filter === 'all') return true;
      if (filter === 'open') return pool.status === 'open';
      if (filter === 'funded') return ['filled', 'funded', 'custody'].includes(pool.status);
      if (filter === 'active') return ['active', 'listed'].includes(pool.status);
      if (filter === 'tradeable') return !!pool.bagsTokenMint && pool.tokenStatus === 'unlocked';
      return true;
    });
  }, [pools, filter]);

  const sortedPools = useMemo(() => {
    return [...filteredPools].sort((a, b) => {
      if (sortBy === 'progress') return b.sharesSold / b.totalShares - a.sharesSold / a.totalShares;
      if (sortBy === 'roi') return (b.projectedROI || 1) - (a.projectedROI || 1);
      if (sortBy === 'volume') return (b.totalVolumeUSD || 0) - (a.totalVolumeUSD || 0);
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredPools, sortBy]);

  const summaryStats = useMemo(() => {
    const totalPools = pools.length;
    const openPools = pools.filter((p) => p.status === 'open').length;
    const tradeablePools = pools.filter(
      (p) => p.bagsTokenMint && p.tokenStatus === 'unlocked'
    ).length;
    const tvl = pools.reduce((sum, p) => sum + (p.sharesSold || 0) * (p.sharePriceUSD || 0), 0);
    const totalVolume = pools.reduce((sum, p) => sum + (p.totalVolumeUSD || 0), 0);
    return { totalPools, openPools, tradeablePools, tvl, totalVolume };
  }, [pools]);

  const handlePoolClick = (pool: Pool) => {
    setSelectedPool(pool);
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshStats(), refreshPools()]);
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshStats, refreshPools]);

  const handleTradeComplete = useCallback(() => {
    refreshStats();
    refreshPools();
  }, [refreshStats, refreshPools]);

  return (
    <>
      <Head>
        <title>Pools | LuxHub — Fractional Luxury Ownership</title>
        <meta
          name="description"
          content="Invest in fractional ownership of authenticated luxury watches on Solana. Trade positions anytime via Bags."
        />
      </Head>

      <div className={styles.page}>
        {/* ─── Hero ─── */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroLeft}>
              <div className={styles.heroBadge}>
                <span className={styles.heroBadgeDot} />
                Powered by Solana
              </div>
              <h1 className={styles.heroTitle}>Fractional Luxury Ownership</h1>
              <p className={styles.heroSub}>
                Each pool tokenizes a verified luxury watch into tradeable tokens via Bags. Buy
                tokens to own a fraction, trade anytime on secondary markets, and when the watch
                sells — holders split the proceeds proportionally. All secured by on-chain escrow
                and multisig custody.
              </p>
            </div>
          </div>
        </section>

        {/* ─── Lifecycle Steps ─── */}
        <section className={styles.lifecycle}>
          <div className={styles.lifecycleTrack}>
            {LIFECYCLE.map((step, i) => (
              <div key={i} className={styles.lifecycleStep}>
                <span className={styles.stepNum}>{step.num}</span>
                <div className={styles.stepContent}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepDesc}>{step.desc}</span>
                </div>
                {i < LIFECYCLE.length - 1 && <div className={styles.stepArrow} />}
              </div>
            ))}
          </div>
        </section>

        {/* ─── Main Content ─── */}
        <main className={styles.main}>
          <div className={styles.mainLayout}>
            {/* Pool Grid */}
            <div>
              {/* Toolbar */}
              <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      className={`${styles.filterPill} ${filter === f.key ? styles.filterPillActive : ''}`}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      {f.key === 'tradeable' && summaryStats.tradeablePools > 0 && (
                        <span className={styles.filterCount}>{summaryStats.tradeablePools}</span>
                      )}
                      {f.key === 'open' && summaryStats.openPools > 0 && (
                        <span className={styles.filterCount}>{summaryStats.openPools}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className={styles.toolbarRight}>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className={styles.sortSelect}
                  >
                    <option value="newest">Newest</option>
                    <option value="progress">Progress</option>
                    <option value="roi">ROI</option>
                    <option value="volume">Volume</option>
                  </select>
                  <button
                    className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshSpin : ''}`}
                    onClick={handleRefresh}
                    title="Refresh"
                  >
                    <FiRefreshCw size={15} />
                  </button>
                </div>
              </div>

              {/* States */}
              {poolsLoading ? (
                <div className={styles.loadingState}>
                  <div className={styles.spinner} />
                  <span className={styles.loadingText}>Loading pools...</span>
                </div>
              ) : isError ? (
                <div className={styles.errorState}>
                  <span className={styles.errorTitle}>Failed to load pools</span>
                  <span className={styles.errorMsg}>
                    {(error as any)?.message || 'Something went wrong'}
                  </span>
                  <button className={styles.retryBtn} onClick={() => refreshPools()}>
                    Try Again
                  </button>
                </div>
              ) : sortedPools.length === 0 ? (
                <>
                  <div className={styles.poolGrid}>
                    {DEMO_POOLS.map((dp, i) => (
                      <div
                        key={i}
                        className={styles.poolGridItem}
                        style={{ animationDelay: `${i * 0.05}s` }}
                      >
                        <DemoPoolCard pool={dp} />
                      </div>
                    ))}
                  </div>
                  <div className={styles.emptyState}>
                    <span className={styles.emptyText}>No pools match this filter</span>
                    {filter !== 'all' && (
                      <button className={styles.clearBtn} onClick={() => setFilter('all')}>
                        Show All
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.poolGrid}>
                  {DEMO_POOLS.map((dp, i) => (
                    <div
                      key={`demo-${i}`}
                      className={styles.poolGridItem}
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <DemoPoolCard pool={dp} />
                    </div>
                  ))}
                  {sortedPools.map((pool, i) => (
                    <div
                      key={pool._id}
                      className={styles.poolGridItem}
                      style={{ animationDelay: `${(i + DEMO_POOLS.length) * 0.05}s` }}
                    >
                      <PoolCard pool={pool} onClick={() => handlePoolClick(pool)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Sidebar ─── */}
            <div className={styles.sidebar}>
              {/* Portfolio */}
              <div className={styles.portfolioCard}>
                <div className={styles.portfolioHeader}>
                  <h3 className={styles.portfolioTitle}>Your Portfolio</h3>
                </div>
                {!wallet.connected || !positions || positions.length === 0 ? (
                  <div className={styles.portfolioEmpty}>
                    <div className={styles.portfolioEmptyIcon}>
                      <FiPieChart size={22} />
                    </div>
                    <p className={styles.portfolioEmptyText}>
                      {wallet.connected ? 'No investments yet' : 'Connect wallet to see portfolio'}
                    </p>
                  </div>
                ) : (
                  <div className={styles.portfolioList}>
                    {positions.map((pos) => (
                      <div key={pos.poolId} className={styles.positionRow}>
                        <div className={styles.positionInfo}>
                          <span className={styles.positionName}>{pos.assetModel}</span>
                          <span className={styles.positionShares}>
                            {pos.shares} tokens · {pos.ownershipPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className={styles.positionValue}>
                          <span className={styles.positionAmount}>
                            ${pos.currentValueUSD.toLocaleString()}
                          </span>
                          <span
                            className={`${styles.positionPnl} ${pos.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative}`}
                          >
                            {pos.pnl >= 0 ? '+' : ''}
                            {pos.pnlPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Trade Panel */}
              <BagsTradePanel pool={selectedPool} onTradeComplete={handleTradeComplete} />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default PoolsPage;
