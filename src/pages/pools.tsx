// src/pages/pools.tsx
// Investment Pools – Clean Minimalist Design
// LuxHub × Bags — Fractional Luxury Asset Ownership
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import Head from 'next/head';
import Image from 'next/image';

import { useWallet } from '@solana/wallet-adapter-react';
import { FiTrendingUp, FiTrendingDown, FiRefreshCw, FiBarChart2, FiImage } from 'react-icons/fi';
import { usePlatformStats, usePools, useUserPortfolio, Pool } from '../hooks/usePools';
import PoolDetail from '../components/marketplace/PoolDetail';
import TvChart, { generatePriceHistory } from '../components/marketplace/TvChart';
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
// ─── Onboarding Tour ─────────────────────────────────────────────
interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'hero',
    title: 'Welcome to Luxury Pools',
    description:
      'Each pool is backed by a real, authenticated luxury timepiece held in secure custody. Contribute to a pool to become a participant and share in the proceeds when the asset appreciates or sells.',
    position: 'bottom',
  },
  {
    target: 'filters',
    title: 'Find the Right Pool',
    description:
      'Filter by status — Open pools are accepting contributions, Tradeable pools have live tokens on secondary markets, and Active pools hold custody of the asset. Use the sort dropdown to rank by newest, funding progress, or projected returns.',
    position: 'bottom',
  },
  {
    target: 'view-toggle',
    title: 'Image & Chart Views',
    description:
      'Switch between browsing watch images and analyzing price charts across all cards at once. In chart mode, you can zoom and scroll each chart like a trading terminal. You can also toggle individual cards independently.',
    position: 'bottom',
  },
  {
    target: 'pool-grid',
    title: 'Pool Cards',
    description:
      'Each card shows the watch, live price movement, funding progress, and holder count. Click any card to open a full detail view with candlestick charts, trade history, and pool specifications.',
    position: 'top',
  },
  {
    target: 'card-trade',
    title: 'Quick Trade',
    description:
      'Pick a preset SOL amount or enter a custom value, then tap Buy or Sell. Tokens are minted on Solana and can be traded on secondary markets once the pool reaches its funding target.',
    position: 'top',
  },
];

const PoolsTour: React.FC<{ onClose: () => void }> = memo(({ onClose }) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<globalThis.DOMRect | null>(null);

  // Find and scroll to the target element
  useEffect(() => {
    const target = document.querySelector(`[data-tour="${TOUR_STEPS[step].target}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Small delay to let scroll settle
      const timer = setTimeout(() => {
        setRect(target.getBoundingClientRect());
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setRect(null);
    }
  }, [step]);

  // Recalc on scroll/resize
  useEffect(() => {
    const update = () => {
      const target = document.querySelector(`[data-tour="${TOUR_STEPS[step].target}"]`);
      if (target) setRect(target.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [step]);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) setStep(step + 1);
    else handleDone();
  };

  const handleDone = () => {
    localStorage.setItem('luxhub_pools_tour_seen', '1');
    onClose();
  };

  const current = TOUR_STEPS[step];
  const pad = 8; // spotlight padding around element

  // Tooltip positioning
  const tooltipStyle: React.CSSProperties = {};
  if (rect) {
    const pos = current.position;
    if (pos === 'bottom') {
      tooltipStyle.top = rect.bottom + pad + 12;
      tooltipStyle.left = rect.left + rect.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'top') {
      tooltipStyle.bottom = window.innerHeight - rect.top + pad + 12;
      tooltipStyle.left = rect.left + rect.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'right') {
      tooltipStyle.top = rect.top + rect.height / 2;
      tooltipStyle.left = rect.right + pad + 12;
      tooltipStyle.transform = 'translateY(-50%)';
    } else {
      tooltipStyle.top = rect.top + rect.height / 2;
      tooltipStyle.right = window.innerWidth - rect.left + pad + 12;
      tooltipStyle.transform = 'translateY(-50%)';
    }
  }

  return createPortal(
    <div className={styles.tourOverlay}>
      {/* Dark backdrop with spotlight cutout via clip-path */}
      <div
        className={styles.tourBackdrop}
        onClick={handleDone}
        style={
          rect
            ? {
                clipPath: `polygon(
            0% 0%, 0% 100%, ${rect.left - pad}px 100%,
            ${rect.left - pad}px ${rect.top - pad}px,
            ${rect.right + pad}px ${rect.top - pad}px,
            ${rect.right + pad}px ${rect.bottom + pad}px,
            ${rect.left - pad}px ${rect.bottom + pad}px,
            ${rect.left - pad}px 100%, 100% 100%, 100% 0%
          )`,
              }
            : {}
        }
      />

      {/* Spotlight border ring */}
      {rect && (
        <div
          className={styles.tourSpotlight}
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}

      {/* Tooltip */}
      {rect && (
        <div className={styles.tourTooltip} style={tooltipStyle}>
          <div className={styles.tourTooltipHeader}>
            <span className={styles.tourTooltipStep}>
              {step + 1} of {TOUR_STEPS.length}
            </span>
            <button className={styles.tourTooltipSkip} onClick={handleDone}>
              Skip tour
            </button>
          </div>
          <h3 className={styles.tourTooltipTitle}>{current.title}</h3>
          <p className={styles.tourTooltipDesc}>{current.description}</p>
          <div className={styles.tourTooltipActions}>
            {step > 0 && (
              <button className={styles.tourBtnBack} onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button className={styles.tourBtnNext} onClick={handleNext}>
              {step === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
          {/* Progress dots */}
          <div className={styles.tourDots}>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`${styles.tourDot} ${i === step ? styles.tourDotActive : ''} ${i < step ? styles.tourDotDone : ''}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
});
PoolsTour.displayName = 'PoolsTour';

// Hook to fetch real price data — falls back to synthetic if no token launched
function usePoolPriceHistory(
  pool: { _id?: string; bagsTokenMint?: string; sharePriceUSD?: number },
  points = 30
) {
  const [prices, setPrices] = React.useState<number[]>([]);
  const [dexData, setDexData] = React.useState<any>(null);

  React.useEffect(() => {
    if (!pool.bagsTokenMint) {
      setPrices(generatePriceHistory(pool.sharePriceUSD || 0.01, points));
      return;
    }
    let cancelled = false;
    fetch(`/api/bags/price-history?mint=${pool.bagsTokenMint}&points=${points}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setPrices(data.priceHistory);
        setDexData(data.dexScreener);
      })
      .catch(() => {
        if (!cancelled) setPrices(generatePriceHistory(pool.sharePriceUSD || 0.01, points));
      });
    return () => {
      cancelled = true;
    };
  }, [pool.bagsTokenMint, pool.sharePriceUSD, points]);

  return { prices, dexData, hasRealData: !!pool.bagsTokenMint && prices.length > 0 };
}

// ─── Pool Card ──────────────────────────────────────────────────
const PoolCard = memo(
  ({
    pool,
    onClick,
    globalChartMode = false,
  }: {
    pool: Pool;
    onClick: () => void;
    globalChartMode?: boolean;
  }) => {
    const [localToggle, setLocalToggle] = useState<boolean | null>(null);
    const showChart = localToggle !== null ? localToggle : globalChartMode;
    const [selectedSol, setSelectedSol] = useState<string | null>(null);
    const [tradeStatus, setTradeStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
      'idle'
    );
    const [tradeMsg, setTradeMsg] = useState('');
    const { publicKey, signTransaction } = useWallet();

    // Reset local override when global mode changes
    useEffect(() => {
      setLocalToggle(null);
    }, [globalChartMode]);
    const { prices: priceHistory, dexData } = usePoolPriceHistory(pool);

    const executeQuickTrade = useCallback(
      async (side: 'buy' | 'sell') => {
        if (!publicKey || !signTransaction) {
          setTradeStatus('error');
          setTradeMsg('Connect wallet');
          setTimeout(() => setTradeStatus('idle'), 2000);
          return;
        }
        if (!pool.bagsTokenMint) {
          setTradeStatus('error');
          setTradeMsg('Token not launched');
          setTimeout(() => setTradeStatus('idle'), 2000);
          return;
        }
        const solAmount = selectedSol || '0.1';
        const lamports = Math.round(parseFloat(solAmount) * 1e9);
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const inputMint = side === 'buy' ? SOL_MINT : pool.bagsTokenMint;
        const outputMint = side === 'buy' ? pool.bagsTokenMint : SOL_MINT;
        // For sells, we need the token amount — use lamports as placeholder, user should use modal for precise sells
        const amount = side === 'buy' ? lamports.toString() : lamports.toString();

        setTradeStatus('loading');
        setTradeMsg(side === 'buy' ? `Buying ${solAmount} SOL...` : `Selling...`);

        try {
          // 1. Get quote
          const quoteRes = await fetch(
            `/api/bags/trade-quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`
          );
          if (!quoteRes.ok) throw new Error('Quote failed');
          const quoteData = await quoteRes.json();

          // 2. Build swap tx
          const swapRes = await fetch('/api/bags/execute-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              inputMint,
              outputMint,
              amount: amount,
              userWallet: publicKey.toString(),
            }),
          });
          if (!swapRes.ok) throw new Error('Swap build failed');
          const swapData = await swapRes.json();

          // 3. Sign with wallet
          const { VersionedTransaction } = await import('@solana/web3.js');
          const bs58 = (await import('bs58')).default;
          const txBytes = bs58.decode(swapData.transaction.serialized);
          const tx = VersionedTransaction.deserialize(txBytes);
          const signed = await signTransaction(tx);

          // 4. Send
          const { Connection } = await import('@solana/web3.js');
          const connection = new Connection(
            process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com'
          );
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: false,
          });

          setTradeStatus('success');
          setTradeMsg(side === 'buy' ? `Bought! ✓` : `Sold! ✓`);
          setTimeout(() => setTradeStatus('idle'), 3000);
        } catch (err: any) {
          setTradeStatus('error');
          setTradeMsg(err?.message?.slice(0, 30) || 'Trade failed');
          setTimeout(() => setTradeStatus('idle'), 3000);
        }
      },
      [publicKey, signTransaction, pool.bagsTokenMint, selectedSol]
    );

    const percentFilled = useMemo(
      () => (pool.totalShares > 0 ? (pool.sharesSold / pool.totalShares) * 100 : 0),
      [pool.totalShares, pool.sharesSold]
    );

    const investorCount = useMemo(
      () => new Set(pool.participants?.map((p) => p.wallet) || []).size,
      [pool.participants]
    );

    // Resolve image: prefer imageUrl, then resolve IPFS/Irys CIDs to full URLs
    const rawImage =
      pool.asset?.imageUrl ||
      pool.asset?.images?.[0] ||
      pool.asset?.imageIpfsUrls?.[0] ||
      pool.asset?.arweaveTxId ||
      '';
    const image = rawImage
      ? rawImage.startsWith('http')
        ? rawImage
        : `https://gateway.irys.xyz/${rawImage}`
      : '/images/placeholder-watch.png';
    const brand = pool.asset?.brand || '';
    const model = pool.asset?.model || 'Luxury Watch';
    const tokensLeft = pool.totalShares - pool.sharesSold;
    // Use real price change from DexScreener when available, fallback to projectedROI
    const realPriceChange = dexData?.priceChange?.h24;
    const hasRealChange = realPriceChange !== undefined && realPriceChange !== null;
    const changePercent = hasRealChange ? realPriceChange : (pool.projectedROI - 1) * 100;
    const changeIsPositive = changePercent >= 0;
    const isHot = pool.status === 'open' && percentFilled > 60;
    const isTradeable = !!pool.bagsTokenMint && pool.tokenStatus === 'unlocked';
    const statusClass = STATUS_STYLE[pool.status] || 'statusDefault';
    const isUnverified =
      pool.watchVerificationStatus === 'unverified' || pool.watchVerificationStatus === 'burned';
    const isGracePeriod =
      pool.watchVerificationStatus === 'grace_period' ||
      pool.watchVerificationStatus === 'unresponsive';

    // Format large token numbers (1B supply)
    const formatTokens = (n: number) => {
      if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return n.toLocaleString();
    };

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
        <div className={styles.cardImage} style={{ position: 'relative' }}>
          <Image
            src={image}
            alt={model}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            style={{ objectFit: 'cover' }}
            unoptimized
          />
          {showChart && priceHistory.length > 1 && (
            <div className={styles.cardChart}>
              <TvChart
                data={priceHistory}
                interactive={globalChartMode}
                showTimeframes={false}
                showToolbar={false}
              />
            </div>
          )}
          <button
            className={`${styles.chartToggle} ${showChart ? styles.chartToggleActive : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setLocalToggle(showChart ? false : true);
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
            {pool.status === 'graduated' && (
              <span className={styles.daoBadge}>DAO Coming Soon</span>
            )}
            {isUnverified && <span className={styles.unverifiedPill}>Unverified</span>}
            {isGracePeriod && <span className={styles.warningPill}>Verification Lapsing</span>}
          </div>
        </div>

        <div className={styles.cardBody}>
          {brand && <div className={styles.cardBrand}>{brand}</div>}
          <div className={styles.cardTitleRow}>
            <span className={styles.cardTitle}>{model}</span>
            {(hasRealChange || pool.projectedROI > 1) && changePercent !== 0 && (
              <span
                className={styles.cardRoi}
                style={
                  hasRealChange ? { color: changeIsPositive ? '#26a69a' : '#ef5350' } : undefined
                }
              >
                {changeIsPositive ? <FiTrendingUp size={11} /> : <FiTrendingDown size={11} />}
                {changeIsPositive ? '+' : ''}
                {changePercent.toFixed(1)}%
                {hasRealChange && (
                  <span style={{ fontSize: '9px', opacity: 0.6, marginLeft: '2px' }}>24h</span>
                )}
              </span>
            )}
          </div>

          <div
            className={styles.cardTrade}
            onClick={(e) => e.stopPropagation()}
            data-tour="card-trade"
          >
            {pool.bagsTokenMint && ((pool.status === 'open' && tokensLeft > 0) || isTradeable) ? (
              <>
                {tradeStatus !== 'idle' && (
                  <div
                    className={styles.cardTradeStatus}
                    style={{
                      color:
                        tradeStatus === 'success'
                          ? '#26a69a'
                          : tradeStatus === 'error'
                            ? '#ef5350'
                            : '#c8a1ff',
                    }}
                  >
                    {tradeStatus === 'loading' && <span className={styles.cardTradeSpinner} />}
                    {tradeMsg}
                  </div>
                )}
                <div className={styles.cardTradeAmounts}>
                  {['0.1', '0.5', '1', '5'].map((sol) => (
                    <button
                      key={sol}
                      className={`${styles.cardTradeChip} ${selectedSol === sol ? styles.cardTradeChipActive : ''}`}
                      onClick={() => setSelectedSol(selectedSol === sol ? null : sol)}
                    >
                      {sol} SOL
                    </button>
                  ))}
                </div>
                <div className={styles.cardTradeActions}>
                  <button
                    className={styles.cardBuyBtn}
                    disabled={tradeStatus === 'loading'}
                    onClick={() => executeQuickTrade('buy')}
                  >
                    Buy{selectedSol ? ` ${selectedSol}` : ''}
                  </button>
                  <button
                    className={styles.cardSellBtn}
                    disabled={tradeStatus === 'loading'}
                    onClick={onClick}
                    title="Open detail to sell tokens"
                  >
                    Sell
                  </button>
                </div>
              </>
            ) : (
              <button className={styles.cardCtaBtnSecondary} onClick={onClick}>
                View Details
                {timeAgo && <span className={styles.cardTime}>{timeAgo}</span>}
              </button>
            )}
          </div>

          {/* Live Trade Feed */}
          {pool.recentTrades && pool.recentTrades.length > 0 && (
            <div className={styles.cardTradeFeed}>
              {pool.recentTrades.slice(-3).map((trade, i) => (
                <div
                  key={`${trade.txSignature || i}`}
                  className={trade.type === 'sell' ? styles.tradeFeedSell : styles.tradeFeedBuy}
                >
                  <span
                    className={
                      trade.type === 'sell' ? styles.tradeFeedDotSell : styles.tradeFeedDotBuy
                    }
                  />
                  <span className={styles.tradeFeedWallet}>{trade.wallet}</span>
                  <span
                    className={
                      trade.type === 'sell' ? styles.tradeFeedAmountSell : styles.tradeFeedAmountBuy
                    }
                  >
                    {trade.type === 'sell' ? '-' : '+'}
                    {formatTokens(trade.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.cardProgress}>
            <div className={styles.cardProgressHeader}>
              <span>{pool.graduated ? 'Trading' : 'Funding'}</span>
              <span className={styles.cardProgressPercent}>
                {pool.graduated
                  ? `$${(pool.lastPriceUSD || 0).toFixed(6)}`
                  : `${percentFilled.toFixed(1)}%`}
              </span>
            </div>
            {!pool.graduated && (
              <div className={styles.cardProgressTrack}>
                <div
                  className={`${styles.cardProgressFill} ${percentFilled >= 80 ? styles.cardProgressFillHigh : ''}`}
                  style={{ width: `${Math.min(percentFilled, 100)}%` }}
                />
              </div>
            )}
            <div className={styles.cardProgressMeta}>
              <span>
                {formatTokens(pool.sharesSold)}/{formatTokens(pool.totalShares)}
              </span>
              <span>
                {investorCount} holder{investorCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className={styles.cardStats}>
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>
                {dexData ? 'Price' : pool.lastPriceUSD ? 'Price' : 'Entry'}
              </span>
              <span className={styles.cardStatValue}>
                {(() => {
                  const price = dexData?.priceUsd
                    ? parseFloat(dexData.priceUsd)
                    : pool.lastPriceUSD || pool.sharePriceUSD;
                  if (price >= 1) return `$${price.toFixed(2)}`;
                  if (price >= 0.001) return `$${price.toFixed(6)}`;
                  // Subscript zero notation for micro-prices
                  const str = price.toFixed(20).split('.')[1] || '';
                  let zeros = 0;
                  for (const ch of str) {
                    if (ch === '0') zeros++;
                    else break;
                  }
                  const sig = str.slice(zeros, zeros + 3);
                  const sub = zeros
                    .toString()
                    .split('')
                    .map(
                      (d) =>
                        '\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089'[
                          parseInt(d)
                        ] || d
                    )
                    .join('');
                  return `$0.0${sub}${sig}`;
                })()}
              </span>
            </div>
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>Target</span>
              <span className={styles.cardStatValue}>${pool.targetAmountUSD.toLocaleString()}</span>
            </div>
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>Vol</span>
              <span className={styles.cardStatValue}>
                $
                {(() => {
                  const vol = dexData?.volume24h || pool.totalVolumeUSD || 0;
                  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
                  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
                  return vol > 0 ? vol.toFixed(0) : '0';
                })()}
              </span>
            </div>
          </div>

          {/* Verification warning */}
          {isUnverified && (
            <div className={styles.cardWarning}>Asset verification lapsed — trade with caution</div>
          )}
        </div>
      </div>
    );
  }
);
PoolCard.displayName = 'PoolCard';

// ─── Main Page ──────────────────────────────────────────────────
const PoolsPage: React.FC = () => {
  const wallet = useWallet();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'value' | 'volume'>('newest');
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [viewMode, setViewMode] = useState<'image' | 'chart'>('image');

  // First-time user tour detection
  useEffect(() => {
    const seen = localStorage.getItem('luxhub_pools_tour_seen');
    if (!seen) setShowTour(true);
  }, []);

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
      if (sortBy === 'value') return (b.projectedROI || 1) - (a.projectedROI || 1);
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
        <title>Luxury Pools | LuxHub — Tokenized Watch Ownership</title>
        <meta
          name="description"
          content="Browse tokenized luxury watch pools on Solana. Own a piece of authenticated timepieces, trade anytime via Bags."
        />
      </Head>

      <div className={styles.page}>
        <main className={styles.main}>
          {/* ─── Page Header ─── */}
          <div className={styles.pageHeader} data-tour="hero">
            <div className={styles.pageHeaderLeft}>
              <h1 className={styles.pageTitle}>Luxury Pools</h1>
              <p className={styles.pageSub}>
                Own a piece of verified timepieces — trade tokens anytime on secondary markets
              </p>
            </div>
          </div>

          {/* ─── Toolbar ─── */}
          <div className={styles.toolbar} data-tour="filters">
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
              <div className={styles.viewToggle} data-tour="view-toggle">
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'image' ? styles.viewToggleBtnActive : ''}`}
                  onClick={() => setViewMode('image')}
                  title="Browse images"
                >
                  <FiImage size={15} />
                </button>
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'chart' ? styles.viewToggleBtnActive : ''}`}
                  onClick={() => setViewMode('chart')}
                  title="Analyze charts"
                >
                  <FiBarChart2 size={15} />
                </button>
              </div>
              <div className={styles.sortWrapper}>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className={styles.sortSelect}
                >
                  <option value="newest">Newest</option>
                  <option value="progress">Progress</option>
                  <option value="value">Est. Value</option>
                  <option value="volume">Volume</option>
                </select>
              </div>
              <button
                className={`${styles.refreshBtn} ${isRefreshing ? styles.refreshSpin : ''}`}
                onClick={handleRefresh}
                title="Refresh"
              >
                <FiRefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* ─── Portfolio Bar (only when connected + has positions) ─── */}
          {wallet.connected && positions && positions.length > 0 && (
            <div className={styles.portfolioBar}>
              <span className={styles.portfolioBarLabel}>Your Positions</span>
              <div className={styles.portfolioBarItems}>
                {positions.map((pos) => (
                  <div key={pos.poolId} className={styles.portfolioBarItem}>
                    <span className={styles.portfolioBarName}>{pos.assetModel}</span>
                    <span className={styles.portfolioBarTokens}>{pos.shares} tokens</span>
                    <span className={styles.portfolioBarValue}>
                      ${pos.currentValueUSD.toLocaleString()}
                    </span>
                    <span
                      className={`${styles.portfolioBarPnl} ${pos.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative}`}
                    >
                      {pos.pnl >= 0 ? '+' : ''}
                      {pos.pnlPercent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Pool Grid ─── */}
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
            <div className={styles.emptyState}>
              {filter !== 'all' ? (
                <>
                  <span className={styles.emptyText}>No pools match this filter</span>
                  <button className={styles.clearBtn} onClick={() => setFilter('all')}>
                    Show All
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.emptyText}>
                    Luxury watch pools will appear here once vendors list their authenticated
                    timepieces
                  </span>
                  <a href="/marketplace" className={styles.clearBtn}>
                    Browse Marketplace
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className={styles.poolGrid} data-tour="pool-grid">
              {sortedPools.map((pool, i) => (
                <div
                  key={pool._id}
                  className={styles.poolGridItem}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <PoolCard
                    pool={pool}
                    onClick={() => handlePoolClick(pool)}
                    globalChartMode={viewMode === 'chart'}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {selectedPool && (
        <PoolDetail
          pool={selectedPool}
          onClose={() => setSelectedPool(null)}
          onInvestmentComplete={handleTradeComplete}
        />
      )}

      {/* Onboarding Tour */}
      {showTour && typeof document !== 'undefined' && (
        <PoolsTour onClose={() => setShowTour(false)} />
      )}

      {/* Retake tour button */}
      {!showTour && (
        <button
          className={styles.retakeTourBtn}
          onClick={() => {
            localStorage.removeItem('luxhub_pools_tour_seen');
            setShowTour(true);
          }}
          title="Take the guided tour"
        >
          ?
        </button>
      )}
    </>
  );
};

export default PoolsPage;

// ISR: pre-render page shell at edge, revalidate every 30s
export async function getStaticProps() {
  return { props: {}, revalidate: 30 };
}
