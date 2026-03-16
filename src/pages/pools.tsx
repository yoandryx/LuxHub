// src/pages/pools.tsx
// Investment Pools – Clean Minimalist Design
// LuxHub × Bags — Fractional Luxury Asset Ownership
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import Head from 'next/head';
import Image from 'next/image';

import { useWallet } from '@solana/wallet-adapter-react';
import { FiTrendingUp, FiRefreshCw, FiBarChart2, FiImage } from 'react-icons/fi';
import { usePlatformStats, usePools, useUserPortfolio, Pool } from '../hooks/usePools';
import PoolDetail from '../components/marketplace/PoolDetail';
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

// ─── TradingView Mini Chart ──────────────────────────────────────
type ChartType = 'area' | 'candlestick' | 'line';

const TvChart = memo(
  ({
    data,
    chartType = 'area',
    interactive = false,
  }: {
    data: number[];
    chartType?: ChartType;
    interactive?: boolean;
  }) => {
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
            visible: interactive,
          },
          handleScale: interactive,
          handleScroll: interactive,
        });

        const now = Math.floor(Date.now() / 1000);

        if (chartType === 'candlestick') {
          const series = chart.addSeries(lc.CandlestickSeries, {
            upColor: '#4ade80',
            downColor: '#f87171',
            borderUpColor: '#4ade80',
            borderDownColor: '#f87171',
            wickUpColor: 'rgba(74, 222, 128, 0.5)',
            wickDownColor: 'rgba(248, 113, 113, 0.5)',
            priceLineVisible: false,
            lastValueVisible: true,
          });
          const chartData = data.map((value, i) => {
            const open = i > 0 ? data[i - 1] : value;
            const high = Math.max(open, value) * (1 + Math.random() * 0.005);
            const low = Math.min(open, value) * (1 - Math.random() * 0.005);
            return {
              time: (now - (data.length - 1 - i) * 60) as any,
              open,
              high,
              low,
              close: value,
            };
          });
          series.setData(chartData);
          seriesRef.current = series;
        } else if (chartType === 'line') {
          const series = chart.addSeries(lc.LineSeries, {
            color: lineColor,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: lineColor,
            crosshairMarkerBackgroundColor: '#0a0a0f',
          });
          const chartData = data.map((value, i) => ({
            time: (now - (data.length - 1 - i) * 60) as any,
            value,
          }));
          series.setData(chartData);
          seriesRef.current = series;
        } else {
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
          const chartData = data.map((value, i) => ({
            time: (now - (data.length - 1 - i) * 60) as any,
            value,
          }));
          series.setData(chartData);
          seriesRef.current = series;
        }

        chart.timeScale().fitContent();
        chartRef.current = chart;

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
    }, [data, chartType, interactive]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
  }
);
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

    // Reset local override when global mode changes
    useEffect(() => {
      setLocalToggle(null);
    }, [globalChartMode]);
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
          {showChart && (
            <div className={styles.cardChart}>
              <TvChart data={priceHistory} interactive={showChart && globalChartMode} />
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
            {pool.projectedROI > 1 && (
              <span className={styles.cardRoi}>
                <FiTrendingUp size={11} />
                {roiPercent}%
              </span>
            )}
          </div>

          <div
            className={styles.cardTrade}
            onClick={(e) => e.stopPropagation()}
            data-tour="card-trade"
          >
            {(pool.status === 'open' && tokensLeft > 0) || isTradeable ? (
              <>
                <div className={styles.cardTradeAmounts}>
                  {['0.1', '0.5', '1', '5'].map((sol) => (
                    <button key={sol} className={styles.cardTradeChip} onClick={onClick}>
                      {sol} SOL
                    </button>
                  ))}
                </div>
                <div className={styles.cardTradeActions}>
                  <button className={styles.cardBuyBtn} onClick={onClick}>
                    Buy
                  </button>
                  <button className={styles.cardSellBtn} onClick={onClick}>
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
              <span className={styles.cardStatLabel}>{pool.lastPriceUSD ? 'Price' : 'Entry'}</span>
              <span className={styles.cardStatValue}>
                $
                {pool.lastPriceUSD
                  ? pool.lastPriceUSD.toFixed(6)
                  : pool.sharePriceUSD.toLocaleString()}
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
                {pool.totalVolumeUSD
                  ? pool.totalVolumeUSD >= 1000
                    ? `${(pool.totalVolumeUSD / 1000).toFixed(1)}K`
                    : pool.totalVolumeUSD.toFixed(0)
                  : '0'}
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
