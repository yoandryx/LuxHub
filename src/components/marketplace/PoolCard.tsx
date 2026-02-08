import React, { memo, useMemo } from 'react';
import { FiTrendingUp, FiUsers, FiClock } from 'react-icons/fi';
import styles from '../../styles/PoolCard.module.css';

const POOL_STATUS_MAP: Record<string, { label: string; color: string; glow: string }> = {
  open: { label: 'Open', color: '#4ade80', glow: 'rgba(74, 222, 128, 0.3)' },
  filled: { label: 'Filled', color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.3)' },
  funded: { label: 'Funded', color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.3)' },
  custody: { label: 'In Custody', color: '#f472b6', glow: 'rgba(244, 114, 182, 0.3)' },
  active: { label: 'Active', color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.3)' },
  graduated: { label: 'Graduated', color: '#c8a1ff', glow: 'rgba(200, 161, 255, 0.3)' },
  listed: { label: 'Listed', color: '#fb923c', glow: 'rgba(251, 146, 60, 0.3)' },
  sold: { label: 'Sold', color: '#4ade80', glow: 'rgba(74, 222, 128, 0.3)' },
  distributed: { label: 'Distributed', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.2)' },
  closed: { label: 'Closed', color: '#64748b', glow: 'rgba(100, 116, 139, 0.2)' },
};

const DEFAULT_STATUS = { label: 'Unknown', color: '#c8a1ff', glow: 'rgba(200, 161, 255, 0.3)' };

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
    imageIpfsUrls?: string[];
    images?: string[];
  };
  vendor?: {
    businessName?: string;
  };
  vendorWallet?: string;
  status: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD: number;
  targetAmountUSD: number;
  minBuyInUSD: number;
  projectedROI: number;
  maxInvestors: number;
  participants?: Array<{
    wallet: string;
    shares: number;
    ownershipPercent: number;
    investedUSD: number;
  }>;
  custodyStatus?: string;
  resaleListingPriceUSD?: number;
  createdAt?: string;
  bagsTokenMint?: string;
  bagsFeeShareConfigId?: string;
}

interface PoolCardProps {
  pool: Pool;
  onClick: () => void;
}

const PoolCard: React.FC<PoolCardProps> = memo(({ pool, onClick }) => {
  const percentFilled = useMemo(
    () => (pool.totalShares > 0 ? (pool.sharesSold / pool.totalShares) * 100 : 0),
    [pool.totalShares, pool.sharesSold]
  );

  const sharesRemaining = pool.totalShares - pool.sharesSold;
  const assetImage =
    pool.asset?.imageIpfsUrls?.[0] || pool.asset?.images?.[0] || '/images/placeholder-watch.png';
  const assetModel = pool.asset?.model || 'Luxury Watch';
  const assetBrand = pool.asset?.brand || '';

  const investorCount = useMemo(
    () => new Set(pool.participants?.map((p) => p.wallet) || []).size,
    [pool.participants]
  );

  const statusInfo = POOL_STATUS_MAP[pool.status] || DEFAULT_STATUS;
  const hasBagsToken = !!pool.bagsTokenMint;
  const isHot = pool.status === 'open' && percentFilled > 60;
  const roiPercent = ((pool.projectedROI - 1) * 100).toFixed(0);

  // Time since creation
  const timeAgo = useMemo(() => {
    if (!pool.createdAt) return '';
    const diff = Date.now() - new Date(pool.createdAt).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [pool.createdAt]);

  return (
    <div className={styles.card} onClick={onClick}>
      {/* Hover shine effect */}
      <div className={styles.shine} />

      {/* Image Section */}
      <div className={styles.imageWrap}>
        <img src={assetImage} alt={assetModel} className={styles.image} loading="lazy" />
        <div className={styles.imageOverlay} />

        {/* Status Badge */}
        <div
          className={styles.statusBadge}
          style={{
            backgroundColor: statusInfo.color,
            boxShadow: `0 0 12px ${statusInfo.glow}`,
          }}
        >
          {statusInfo.label}
        </div>

        {/* Pool Number */}
        {pool.poolNumber && <div className={styles.poolNum}>#{pool.poolNumber}</div>}

        {/* Hot Badge */}
        {isHot && (
          <div className={styles.hotBadge}>
            <FiTrendingUp />
            Hot
          </div>
        )}

        {/* Tradeable Badge */}
        {hasBagsToken && <div className={styles.tradeableBadge}>Tradeable</div>}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Title Row */}
        <div className={styles.titleRow}>
          <div className={styles.titleInfo}>
            {assetBrand && <span className={styles.brand}>{assetBrand}</span>}
            <h3 className={styles.title}>{assetModel}</h3>
          </div>
          <div className={styles.roiBadge}>
            <FiTrendingUp />
            {roiPercent}%
          </div>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressWrap}>
          <div className={styles.progressTop}>
            <span className={styles.progressLabel}>Funding</span>
            <span className={styles.progressPercent}>{percentFilled.toFixed(1)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(percentFilled, 100)}%` }}
            />
          </div>
          <div className={styles.progressBottom}>
            <span>
              {pool.sharesSold}/{pool.totalShares} shares
            </span>
            <span>
              <FiUsers className={styles.inlineIcon} /> {investorCount}
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsRow}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Share Price</span>
            <span className={styles.statValue}>${pool.sharePriceUSD.toLocaleString()}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statLabel}>Target</span>
            <span className={styles.statValue}>${pool.targetAmountUSD.toLocaleString()}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.stat}>
            <span className={styles.statLabel}>Min Buy</span>
            <span className={styles.statValue}>${pool.minBuyInUSD.toLocaleString()}</span>
          </div>
        </div>

        {/* CTA */}
        {pool.status === 'open' && sharesRemaining > 0 ? (
          <button className={styles.ctaButton}>
            <span>Invest Now</span>
            <span className={styles.ctaShares}>{sharesRemaining} shares left</span>
          </button>
        ) : (
          <button className={styles.ctaButtonSecondary}>
            <span>View Details</span>
            {timeAgo && (
              <span className={styles.ctaTime}>
                <FiClock /> {timeAgo}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
});

PoolCard.displayName = 'PoolCard';

export default PoolCard;
