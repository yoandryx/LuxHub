import React, { useState, useMemo } from 'react';
import { FiBarChart2 } from 'react-icons/fi';
import PoolCard from './PoolCard';
import { usePools, Pool } from '../../hooks/usePools';
import styles from '../../styles/PoolList.module.css';

interface PoolListProps {
  onPoolSelect: (pool: Pool) => void;
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'funded', label: 'Funded' },
  { key: 'active', label: 'Active' },
  { key: 'tradeable', label: 'Tradeable' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

const PoolList: React.FC<PoolListProps> = ({ onPoolSelect }) => {
  const { pools, isLoading, isError, error, mutate } = usePools();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'progress' | 'roi' | 'volume'>('newest');

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
      if (sortBy === 'progress') {
        return b.sharesSold / b.totalShares - a.sharesSold / a.totalShares;
      }
      if (sortBy === 'roi') {
        return (b.projectedROI || 1) - (a.projectedROI || 1);
      }
      if (sortBy === 'volume') {
        return (b.totalVolumeUSD || 0) - (a.totalVolumeUSD || 0);
      }
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

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading pools...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <p>Failed to load pools</p>
          <span>{(error as any)?.message || 'Something went wrong'}</span>
          <button onClick={() => mutate()} className={styles.retryBtn}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Filter & Sort Bar */}
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${styles.filterPill} ${filter === f.key ? styles.filterActive : ''}`}
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

        <div className={styles.sortWrap}>
          <FiBarChart2 className={styles.sortIcon} />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className={styles.sortSelect}
          >
            <option value="newest">Newest</option>
            <option value="progress">Progress</option>
            <option value="roi">Projected ROI</option>
            <option value="volume">Volume</option>
          </select>
        </div>
      </div>

      {/* Pool Grid */}
      {sortedPools.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No pools match this filter.</p>
          {filter !== 'all' && (
            <button className={styles.clearBtn} onClick={() => setFilter('all')}>
              Show All Pools
            </button>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {sortedPools.map((pool, index) => (
            <div
              key={pool._id}
              className={styles.gridItem}
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              <PoolCard pool={pool} onClick={() => onPoolSelect(pool)} />
            </div>
          ))}
        </div>
      )}

      {/* Bottom Stats Summary */}
      <div className={styles.summary}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Total Pools</span>
          <span className={styles.summaryValue}>{summaryStats.totalPools}</span>
        </div>
        <div className={styles.summarySep} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Open</span>
          <span className={styles.summaryValue}>{summaryStats.openPools}</span>
        </div>
        <div className={styles.summarySep} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Tradeable</span>
          <span className={styles.summaryValue}>{summaryStats.tradeablePools}</span>
        </div>
        <div className={styles.summarySep} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>TVL</span>
          <span className={`${styles.summaryValue} ${styles.summaryAccent}`}>
            ${summaryStats.tvl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className={styles.summarySep} />
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>Volume</span>
          <span className={`${styles.summaryValue} ${styles.summaryAccent}`}>
            ${summaryStats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PoolList;
