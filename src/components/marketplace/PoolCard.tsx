import React from 'react';
import styles from '../../styles/PoolCard.module.css';

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
  // Bags integration fields
  bagsTokenMint?: string;
  bagsFeeShareConfigId?: string;
}

interface PoolCardProps {
  pool: Pool;
  onClick: () => void;
}

const PoolCard: React.FC<PoolCardProps> = ({ pool, onClick }) => {
  const percentFilled =
    pool.totalShares > 0 ? ((pool.sharesSold / pool.totalShares) * 100).toFixed(1) : '0';

  const sharesRemaining = pool.totalShares - pool.sharesSold;
  const assetImage =
    pool.asset?.imageIpfsUrls?.[0] || pool.asset?.images?.[0] || '/images/placeholder-watch.png';
  const assetModel = pool.asset?.model || 'Luxury Watch';
  const investorCount = new Set(pool.participants?.map((p) => p.wallet) || []).size;

  const statusColor =
    {
      open: '#00ff88',
      filled: '#ffd700',
      funded: '#00bfff',
      custody: '#ff69b4',
      active: '#9370db',
      listed: '#ff8c00',
      sold: '#32cd32',
      distributed: '#c0c0c0',
      closed: '#808080',
    }[pool.status] || '#c8a1ff';

  const hasBagsToken = !!pool.bagsTokenMint;

  return (
    <div className={styles.poolCard} onClick={onClick}>
      <div className={styles.imageContainer}>
        <img src={assetImage} alt={assetModel} className={styles.poolImage} />
        <div className={styles.statusBadge} style={{ backgroundColor: statusColor }}>
          {pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
        </div>
        {pool.poolNumber && <div className={styles.poolNumber}>#{pool.poolNumber}</div>}
        {/* Bags Token Badge */}
        {hasBagsToken && (
          <div className={styles.bagsBadge}>
            <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIconSmall} />
            Tradeable
          </div>
        )}
      </div>

      <div className={styles.poolContent}>
        <h3 className={styles.assetTitle}>{assetModel}</h3>

        {/* Progress Bar */}
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span>Funding Progress</span>
            <span className={styles.progressPercent}>{percentFilled}%</span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(parseFloat(percentFilled), 100)}%` }}
            />
          </div>
          <div className={styles.progressStats}>
            <span>
              {pool.sharesSold} / {pool.totalShares} shares sold
            </span>
            <span>{investorCount} investors</span>
          </div>
        </div>

        {/* Key Stats */}
        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Share Price</span>
            <span className={styles.statValue}>${pool.sharePriceUSD.toLocaleString()}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Target</span>
            <span className={styles.statValue}>${pool.targetAmountUSD.toLocaleString()}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Min Buy-In</span>
            <span className={styles.statValue}>${pool.minBuyInUSD.toLocaleString()}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Projected ROI</span>
            <span className={styles.statValue} style={{ color: '#00ff88' }}>
              {((pool.projectedROI - 1) * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* CTA */}
        {pool.status === 'open' && sharesRemaining > 0 ? (
          <button className={styles.investButton}>
            Invest Now - {sharesRemaining} Shares Left
          </button>
        ) : (
          <button className={styles.viewButton}>View Details</button>
        )}
      </div>
    </div>
  );
};

export default PoolCard;
