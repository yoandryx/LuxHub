import React, { useState, useMemo } from 'react';
import PoolCard from './PoolCard';
import { usePools, Pool } from '../../hooks/usePools';
import styles from '../../styles/PoolList.module.css';

interface PoolListProps {
  onPoolSelect: (pool: Pool) => void;
}

const PoolList: React.FC<PoolListProps> = ({ onPoolSelect }) => {
  const { pools, isLoading, isError, error, mutate } = usePools();
  const [filter, setFilter] = useState<'all' | 'open' | 'funded' | 'active' | 'tradeable'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'roi' | 'volume'>('newest');

  // Filter pools based on selected filter
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

  // Sort pools based on selected sort option
  const sortedPools = useMemo(() => {
    return [...filteredPools].sort((a, b) => {
      if (sortBy === 'progress') {
        const progressA = a.sharesSold / a.totalShares;
        const progressB = b.sharesSold / b.totalShares;
        return progressB - progressA;
      }
      if (sortBy === 'roi') {
        return (b.projectedROI || 1) - (a.projectedROI || 1);
      }
      if (sortBy === 'volume') {
        return (b.totalVolumeUSD || 0) - (a.totalVolumeUSD || 0);
      }
      // Default: newest (by createdAt)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [filteredPools, sortBy]);

  // Calculate summary stats
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

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading pools...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Error: {(error as any)?.message || 'Failed to load pools'}</p>
          <button onClick={() => mutate()} className={styles.retryButton}>
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
          {(['all', 'open', 'funded', 'active', 'tradeable'] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'tradeable' ? 'Tradeable' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'tradeable' && summaryStats.tradeablePools > 0 && (
                <span className={styles.filterCount}>{summaryStats.tradeablePools}</span>
              )}
            </button>
          ))}
        </div>

        <div className={styles.sortDropdown}>
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={styles.select}
          >
            <option value="newest">Newest</option>
            <option value="progress">Progress</option>
            <option value="roi">Projected ROI</option>
            <option value="volume">Trading Volume</option>
          </select>
        </div>
      </div>

      {/* Pool Grid */}
      {sortedPools.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No pools available with the selected filter.</p>
          {filter !== 'all' && (
            <button className={styles.clearFilter} onClick={() => setFilter('all')}>
              Clear filter
            </button>
          )}
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
          <span className={styles.summaryValue}>{summaryStats.totalPools}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Open for Investment</span>
          <span className={styles.summaryValue}>{summaryStats.openPools}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Tradeable Pools</span>
          <span className={styles.summaryValue}>{summaryStats.tradeablePools}</span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Value Locked</span>
          <span className={styles.summaryValue}>
            ${summaryStats.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Trading Volume</span>
          <span className={styles.summaryValue}>
            ${summaryStats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PoolList;
