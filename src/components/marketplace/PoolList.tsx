import React, { useState, useEffect } from 'react';
import PoolCard from './PoolCard';
import styles from '../../styles/PoolList.module.css';

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
}

interface PoolListProps {
  onPoolSelect: (pool: Pool) => void;
}

const PoolList: React.FC<PoolListProps> = ({ onPoolSelect }) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'funded' | 'active'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'roi'>('newest');

  useEffect(() => {
    fetchPools();
  }, []);

  const fetchPools = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pool/list');
      if (!response.ok) throw new Error('Failed to fetch pools');
      const data = await response.json();
      setPools(data.pools || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredPools = pools.filter((pool) => {
    if (filter === 'all') return true;
    if (filter === 'open') return pool.status === 'open';
    if (filter === 'funded') return ['filled', 'funded', 'custody'].includes(pool.status);
    if (filter === 'active') return ['active', 'listed'].includes(pool.status);
    return true;
  });

  const sortedPools = [...filteredPools].sort((a, b) => {
    if (sortBy === 'progress') {
      const progressA = a.sharesSold / a.totalShares;
      const progressB = b.sharesSold / b.totalShares;
      return progressB - progressA;
    }
    if (sortBy === 'roi') {
      return b.projectedROI - a.projectedROI;
    }
    // Default: newest
    return 0;
  });

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading pools...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Error: {error}</p>
          <button onClick={fetchPools} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Investment Pools</h2>
        <p className={styles.subtitle}>Fractional ownership of authenticated luxury watches</p>
      </div>

      {/* Filters & Sort */}
      <div className={styles.controls}>
        <div className={styles.filters}>
          {(['all', 'open', 'funded', 'active'] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className={styles.sortDropdown}>
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className={styles.select}
          >
            <option value="newest">Newest</option>
            <option value="progress">Progress</option>
            <option value="roi">Projected ROI</option>
          </select>
        </div>
      </div>

      {/* Pool Grid */}
      {sortedPools.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No pools available with the selected filter.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {sortedPools.map((pool) => (
            <PoolCard key={pool._id} pool={pool} onClick={() => onPoolSelect(pool)} />
          ))}
        </div>
      )}

      {/* Stats Summary */}
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Pools</span>
          <span className={styles.summaryValue}>{pools.length}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Open for Investment</span>
          <span className={styles.summaryValue}>
            {pools.filter((p) => p.status === 'open').length}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Value Locked</span>
          <span className={styles.summaryValue}>
            ${pools.reduce((sum, p) => sum + p.sharesSold * p.sharePriceUSD, 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PoolList;
