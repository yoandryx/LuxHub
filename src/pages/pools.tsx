// src/pages/pools.tsx
// Investment Pools – Clean Minimalist Design
// LuxHub × Bags — Fractional Luxury Asset Ownership
import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';

import Link from 'next/link';
import { useEffectiveWallet } from '../hooks/useEffectiveWallet';
import { useUserRole } from '../hooks/useUserRole';
import { FiTrendingUp, FiTrendingDown, FiRefreshCw, FiBarChart2, FiImage, FiDroplet } from 'react-icons/fi';
import { usePlatformStats, usePools, useUserPortfolio, useLivePoolStats, Pool, LivePoolStats } from '../hooks/usePools';
import TvChart, { generatePriceHistory } from '../components/marketplace/TvChart';
import { getLifecycleStage, LIFECYCLE_STAGES } from '../components/pool/LifecycleStepper';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUtils';
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
    liveStats,
    onClick,
    globalChartMode = false,
  }: {
    pool: Pool;
    liveStats?: LivePoolStats;
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
    const { publicKey, signTransaction, sendVersionedTransaction } = useEffectiveWallet();
    const poolRouter = useRouter();

    // Reset local override when global mode changes
    useEffect(() => {
      setLocalToggle(null);
    }, [globalChartMode]);
    const { prices: priceHistory, dexData } = usePoolPriceHistory(pool);

    const executeQuickTrade = useCallback(
      async () => {
        if (!publicKey || !sendVersionedTransaction) {
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
        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        const inputMint = SOL_MINT;
        const outputMint = pool.bagsTokenMint;
        // SOL amount as decimal string — trade-quote expects human-readable amount
        const amount = solAmount;
        const slippageBps = '100'; // 1% default — matches TradeWidget

        setTradeStatus('loading');
        setTradeMsg(`Buying ${solAmount} SOL...`);

        try {
          // 1. Get quote (pass poolId so server can validate + look up mint)
          const quoteParams = new URLSearchParams({
            poolId: pool._id,
            inputMint,
            outputMint,
            amount,
            slippageBps,
          });
          const quoteRes = await fetch(`/api/bags/trade-quote?${quoteParams.toString()}`);
          if (!quoteRes.ok) {
            const errBody = await quoteRes.json().catch(() => ({}));
            throw new Error(errBody?.details || errBody?.error || 'Quote failed');
          }
          const quoteData = await quoteRes.json();

          // 2. Build swap tx
          const swapRes = await fetch('/api/bags/execute-trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              poolId: pool._id,
              inputMint,
              outputMint,
              amount,
              userWallet: publicKey.toString(),
              slippageBps,
            }),
          });
          if (!swapRes.ok) {
            const errBody = await swapRes.json().catch(() => ({}));
            throw new Error(errBody?.details || errBody?.error || 'Swap build failed');
          }
          const swapData = await swapRes.json();

          // 3. Deserialize tx and sign+send via wallet adapter (avoids Privy/Phantom bridge bugs)
          const { VersionedTransaction, Connection } = await import('@solana/web3.js');
          const binaryStr = atob(swapData.transaction.serialized);
          const txBytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) txBytes[i] = binaryStr.charCodeAt(i);
          const tx = VersionedTransaction.deserialize(txBytes);

          const connection = new Connection(
            process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.mainnet-beta.solana.com'
          );
          await sendVersionedTransaction(tx, connection);

          setTradeStatus('success');
          setTradeMsg(`Bought! ✓`);
          setTimeout(() => setTradeStatus('idle'), 3000);
        } catch (err: any) {
          console.error('[PoolCard] Trade error:', err);
          console.error('[PoolCard] Error name:', err?.name, 'message:', err?.message);
          console.error('[PoolCard] Error stack:', err?.stack);
          setTradeStatus('error');
          setTradeMsg(err?.message?.slice(0, 40) || 'Trade failed');
          setTimeout(() => setTradeStatus('idle'), 5000);
        }
      },
      [publicKey, sendVersionedTransaction, pool._id, pool.bagsTokenMint, selectedSol]
    );

    // Progress = vendor funding from accumulated trading fees (1% of all trades → Pools Treasury).
    // This is the REAL "funding the watch" metric — how much the pool has earned toward paying the vendor.
    //
    // Live on-chain data (liveStats) for price/mcap/holders. Funding progress from MongoDB (webhook-tracked).
    const hasToken = !!pool.bagsTokenMint;
    const isGraduated = liveStats?.graduated ?? pool.graduated ?? false;
    const livePrice =
      liveStats?.priceUSD ||
      (dexData?.priceUsd ? parseFloat(dexData.priceUsd) : 0) ||
      pool.lastPriceUSD ||
      pool.currentBondingPrice ||
      pool.sharePriceUSD ||
      0;
    const marketCapUSD =
      liveStats?.marketCapUSD ||
      (hasToken && livePrice > 0 ? livePrice * (pool.totalShares || 0) : 0);

    // Vendor funding progress: accumulatedTradingFees / (watchPrice * 0.97)
    const vendorTarget = (pool.targetAmountUSD || 0) * 0.97;
    const accumulatedFees = pool.accumulatedTradingFees || 0;
    const vendorFundingPercent = vendorTarget > 0
      ? Math.min((accumulatedFees / vendorTarget) * 100, 100)
      : 0;
    const isVendorFunded = vendorFundingPercent >= 100;

    // Use vendor funding progress for the progress bar
    const percentFilled = vendorFundingPercent;

    const progressLabel = isVendorFunded
      ? 'Funded'
      : hasToken
        ? 'Funding Watch'
        : 'Pre-Launch';

    // Prefer on-chain holder count (liveStats) over stale participants[] (legacy invest flow)
    const investorCount = useMemo(() => {
      if (liveStats?.holderCount !== undefined && liveStats.holderCount > 0) {
        return liveStats.holderCount;
      }
      return new Set(pool.participants?.map((p) => p.wallet) || []).size;
    }, [liveStats?.holderCount, pool.participants]);

    // Resolve image through gateway (handles Irys TX IDs, IPFS CIDs, devnet URLs)
    const rawImage =
      pool.asset?.imageUrl ||
      pool.asset?.images?.[0] ||
      pool.asset?.imageIpfsUrls?.[0] ||
      pool.asset?.arweaveTxId ||
      '';
    const image = rawImage ? resolveImageUrl(rawImage) : PLACEHOLDER_IMAGE;
    const brand = pool.asset?.brand || '';
    const model = pool.asset?.model || 'Luxury Watch';
    const tokensLeft = pool.totalShares - pool.sharesSold;
    // Use on-chain 24h change from liveStats when available, then dex fallback, then projectedROI
    const realPriceChange =
      liveStats?.priceChange24h !== undefined && liveStats?.priceChange24h !== null
        ? liveStats.priceChange24h
        : dexData?.priceChange?.h24;
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

    const lifecycleStage = getLifecycleStage(pool);
    const lifecycleLabel = LIFECYCLE_STAGES.find((s) => s.key === lifecycleStage)?.label || lifecycleStage;

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
          {/* Consolidated badges — one primary (lifecycle) + optional warnings.
              Dropped: separate "Tradeable" pill (redundant with lifecycle=trade),
                       "DAO Coming Soon" (shown in detail page), raw status
                       (encoded in lifecycleLabel). */}
          <div className={styles.cardBadges}>
            <span className={`${styles.lifecyclePill} ${styles[statusClass]}`}>{lifecycleLabel}</span>
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
                  {['0.01', '0.1', '0.5', '1'].map((sol) => (
                    <button
                      key={sol}
                      className={`${styles.cardTradeChip} ${selectedSol === sol ? styles.cardTradeChipActive : ''}`}
                      onClick={() => setSelectedSol(selectedSol === sol ? null : sol)}
                    >
                      {sol}
                    </button>
                  ))}
                  <input
                    type="number"
                    className={`${styles.cardTradeChip} ${selectedSol && !['0.01','0.1','0.5','1'].includes(selectedSol) ? styles.cardTradeChipActive : ''}`}
                    placeholder="Custom"
                    min="0.001"
                    step="0.01"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && parseFloat(v) > 0) setSelectedSol(v);
                      else setSelectedSol(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
                <div className={styles.cardTradeActions}>
                  <button
                    className={styles.cardBuyBtn}
                    disabled={tradeStatus === 'loading'}
                    onClick={() => executeQuickTrade()}
                  >
                    Buy{selectedSol ? ` ${selectedSol}` : ''}
                  </button>
                  <button
                    className={styles.cardSellBtn}
                    disabled={tradeStatus === 'loading'}
                    onClick={(e) => {
                      e.stopPropagation();
                      poolRouter.push(`/pools/${pool._id}?side=sell`);
                    }}
                    title="Open detail page to sell tokens (needs precise token amount)"
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
              <span>{progressLabel}</span>
              <span className={styles.cardProgressPercent}>
                {isVendorFunded
                  ? `$${livePrice.toFixed(6)}`
                  : `${percentFilled.toFixed(1)}%`}
              </span>
            </div>
            {!isVendorFunded && (
              <div className={styles.cardProgressTrack}>
                <div
                  className={`${styles.cardProgressFill} ${percentFilled >= 80 ? styles.cardProgressFillHigh : ''}`}
                  style={{ width: `${Math.min(percentFilled, 100)}%` }}
                />
              </div>
            )}
            <div className={styles.cardProgressMeta}>
              <span>
                ${accumulatedFees >= 1000 ? `${(accumulatedFees / 1000).toFixed(1)}K` : accumulatedFees.toFixed(0)}
                {' / '}${vendorTarget >= 1000 ? `${(vendorTarget / 1000).toFixed(1)}K` : vendorTarget.toFixed(0)}
                {' earned'}
              </span>
              <span>
                {investorCount} holder{investorCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className={styles.cardStats}>
            <div className={styles.cardStat}>
              <span className={styles.cardStatLabel}>
                {liveStats?.priceUSD || dexData || pool.lastPriceUSD ? 'Price' : 'Entry'}
              </span>
              <span className={styles.cardStatValue}>
                {(() => {
                  const price =
                    liveStats?.priceUSD ||
                    (dexData?.priceUsd ? parseFloat(dexData.priceUsd) : 0) ||
                    pool.lastPriceUSD ||
                    pool.sharePriceUSD;
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
              <span className={styles.cardStatLabel}>Vol 24h</span>
              <span className={styles.cardStatValue}>
                $
                {(() => {
                  const vol =
                    liveStats?.volume24hUSD || dexData?.volume24h || pool.totalVolumeUSD || 0;
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
  const wallet = useEffectiveWallet();
  const { isVendor, isAdmin } = useUserRole();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'value' | 'volume'>('newest');
  const poolRouter = useRouter();
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

  // Pull live on-chain stats (holders, supply, price, mcap, volume) for all pools with Bags tokens.
  // Single batched call to /api/pool/live-stats; cards override stale DB fields with live data.
  const poolMints = useMemo(
    () => pools.map((p) => p.bagsTokenMint).filter((m): m is string => !!m),
    [pools]
  );
  const { getStats: getLiveStats } = useLivePoolStats(poolMints);

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
    // Navigate to dedicated pool detail page (D-05)
    poolRouter.push(`/pools/${pool._id}`);
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
            {(isVendor || isAdmin) && (
              <Link
                href="/vendor/pools"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(200,161,255,0.25)',
                  background: 'rgba(200,161,255,0.06)',
                  color: '#c8a1ff',
                  fontSize: '12px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                }}
              >
                <FiDroplet /> Manage My Pools
              </Link>
            )}
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
                    liveStats={getLiveStats(pool.bagsTokenMint)}
                    onClick={() => handlePoolClick(pool)}
                    globalChartMode={viewMode === 'chart'}
                  />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Pool detail now rendered at /pools/[id] dedicated page */}

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
