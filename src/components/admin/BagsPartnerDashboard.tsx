// src/components/admin/BagsPartnerDashboard.tsx
// Partner earnings and stats dashboard powered by Bags
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/BagsPartnerDashboard.module.css';

interface PartnerStats {
  totalEarnings: number;
  totalTransactions: number;
  pendingClaims: number;
  lastClaimed: string | null;
}

interface PoolWithBags {
  _id: string;
  poolNumber?: string;
  bagsTokenMint?: string;
  bagsFeeShareConfigId?: string;
  asset?: {
    model?: string;
  };
  status: string;
  totalShares: number;
  sharesSold: number;
  createdAt: string;
}

interface RecentTrade {
  poolId: string;
  poolName: string;
  type: 'buy' | 'sell';
  amount: number;
  fee: number;
  timestamp: string;
  txSignature: string;
}

const BagsPartnerDashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [pools, setPools] = useState<PoolWithBags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'pools' | 'activity'>('overview');

  // Mock recent trades for demo (would come from real API)
  const [recentTrades] = useState<RecentTrade[]>([
    {
      poolId: '1',
      poolName: 'Rolex Daytona Pool',
      type: 'buy',
      amount: 500,
      fee: 15,
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      txSignature: 'abc123...',
    },
    {
      poolId: '2',
      poolName: 'Patek Philippe Pool',
      type: 'sell',
      amount: 1200,
      fee: 36,
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      txSignature: 'def456...',
    },
  ]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/bags/partner-stats');
      const data = await response.json();

      if (!response.ok) {
        // Don't throw error for unconfigured API, just show defaults
        if (data.error?.includes('not configured')) {
          setStats({
            totalEarnings: 0,
            totalTransactions: 0,
            pendingClaims: 0,
            lastClaimed: null,
          });
          return;
        }
        throw new Error(data.error || 'Failed to fetch stats');
      }

      setStats(data.summary);
    } catch (err: any) {
      console.error('Stats fetch error:', err);
      // Set default stats on error
      setStats({
        totalEarnings: 0,
        totalTransactions: 0,
        pendingClaims: 0,
        lastClaimed: null,
      });
    }
  }, []);

  const fetchPools = useCallback(async () => {
    try {
      const response = await fetch('/api/pool/list?includeBags=true');
      const data = await response.json();

      if (response.ok) {
        // Filter pools that have Bags integration
        const bagsEnabledPools = (data.pools || []).filter(
          (p: PoolWithBags) => p.bagsTokenMint || p.bagsFeeShareConfigId
        );
        setPools(bagsEnabledPools);
      }
    } catch (err) {
      console.error('Pools fetch error:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchStats(), fetchPools()]);
      setLoading(false);
    };

    loadData();
  }, [fetchStats, fetchPools]);

  const handleClaimFees = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      // This would call the Bags claim API
      // For now, simulate the claim
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Refresh stats after claim
      await fetchStats();
    } catch (err: any) {
      setError(err.message || 'Failed to claim fees');
    } finally {
      setClaiming(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <span>Loading Bags Partner Data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <div className={styles.bagsLogo}>
            <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsIcon} />
            <span>Bags Partner Program</span>
          </div>
          <h2>Revenue Dashboard</h2>
          <p>Track your earnings from pool share trading via Bags</p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={() => {
            fetchStats();
            fetchPools();
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>💰</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Total Earnings</span>
            <span className={styles.statValue}>{formatCurrency(stats?.totalEarnings || 0)}</span>
            <span className={styles.statSubtext}>Lifetime revenue from 3% fees</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>📊</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Total Transactions</span>
            <span className={styles.statValue}>
              {stats?.totalTransactions?.toLocaleString() || 0}
            </span>
            <span className={styles.statSubtext}>Pool share trades processed</span>
          </div>
        </div>

        <div className={`${styles.statCard} ${styles.claimCard}`}>
          <div className={styles.statIcon}>🎁</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Pending Claims</span>
            <span className={styles.statValue}>{formatCurrency(stats?.pendingClaims || 0)}</span>
            {(stats?.pendingClaims || 0) > 0 && (
              <button className={styles.claimButton} onClick={handleClaimFees} disabled={claiming}>
                {claiming ? 'Claiming...' : 'Claim Now'}
              </button>
            )}
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>🏦</div>
          <div className={styles.statContent}>
            <span className={styles.statLabel}>Active Pools</span>
            <span className={styles.statValue}>{pools.length}</span>
            <span className={styles.statSubtext}>Pools with Bags tokens</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'overview' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'pools' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('pools')}
        >
          Tokenized Pools
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'activity' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Recent Activity
        </button>
      </div>

      {/* Tab Content */}
      <div className={styles.tabContent}>
        {activeTab === 'overview' && (
          <div className={styles.overviewContent}>
            {/* Fee Breakdown */}
            <div className={styles.section}>
              <h3>Fee Structure</h3>
              <div className={styles.feeBreakdown}>
                <div className={styles.feeItem}>
                  <div className={styles.feeLabel}>
                    <span className={styles.feeDot} style={{ background: '#8b5cf6' }}></span>
                    LuxHub Treasury
                  </div>
                  <div className={styles.feeValue}>3%</div>
                  <div className={styles.feeDesc}>On every pool share trade</div>
                </div>
                <div className={styles.feeFlow}>
                  <div className={styles.flowStep}>
                    <span>1</span>
                    <p>User trades pool shares via Bags</p>
                  </div>
                  <div className={styles.flowArrow}>→</div>
                  <div className={styles.flowStep}>
                    <span>2</span>
                    <p>Bags Fee Share auto-routes 3%</p>
                  </div>
                  <div className={styles.flowArrow}>→</div>
                  <div className={styles.flowStep}>
                    <span>3</span>
                    <p>Fees accumulate in treasury</p>
                  </div>
                  <div className={styles.flowArrow}>→</div>
                  <div className={styles.flowStep}>
                    <span>4</span>
                    <p>Claim anytime via dashboard</p>
                  </div>
                </div>
              </div>
            </div>

            {/* How It Works */}
            <div className={styles.section}>
              <h3>How Bags Integration Works</h3>
              <div className={styles.infoGrid}>
                <div className={styles.infoCard}>
                  <div className={styles.infoIcon}>🪙</div>
                  <h4>Token Launch</h4>
                  <p>Pool shares are minted as SPL tokens via Bags Token Launch API</p>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIcon}>💱</div>
                  <h4>Secondary Trading</h4>
                  <p>Investors can buy/sell shares on the open market via Bags Trade API</p>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIcon}>💸</div>
                  <h4>Auto Fee Routing</h4>
                  <p>3% fee automatically sent to LuxHub on every trade via Bags Fee Share</p>
                </div>
                <div className={styles.infoCard}>
                  <div className={styles.infoIcon}>📈</div>
                  <h4>Partner Analytics</h4>
                  <p>Real-time tracking of earnings and transactions via Bags Partner API</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pools' && (
          <div className={styles.poolsContent}>
            {pools.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📦</div>
                <h4>No Tokenized Pools Yet</h4>
                <p>Pools will appear here once they have Bags tokens created</p>
              </div>
            ) : (
              <div className={styles.poolsList}>
                {pools.map((pool) => (
                  <div key={pool._id} className={styles.poolItem}>
                    <div className={styles.poolInfo}>
                      <span className={styles.poolName}>
                        {pool.asset?.model || `Pool #${pool.poolNumber || pool._id.slice(-6)}`}
                      </span>
                      <span className={styles.poolMint}>
                        Token: {pool.bagsTokenMint?.slice(0, 8)}...{pool.bagsTokenMint?.slice(-6)}
                      </span>
                    </div>
                    <div className={styles.poolStats}>
                      <div className={styles.poolStat}>
                        <span>Shares Sold</span>
                        <strong>
                          {pool.sharesSold} / {pool.totalShares}
                        </strong>
                      </div>
                      <div className={styles.poolStat}>
                        <span>Status</span>
                        <strong className={styles[pool.status]}>{pool.status}</strong>
                      </div>
                    </div>
                    <div className={styles.poolBadges}>
                      {pool.bagsTokenMint && <span className={styles.badge}>Tokenized</span>}
                      {pool.bagsFeeShareConfigId && (
                        <span className={styles.badge}>Fee Share Active</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className={styles.activityContent}>
            {recentTrades.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📜</div>
                <h4>No Recent Activity</h4>
                <p>Trades will appear here once pool shares are traded</p>
              </div>
            ) : (
              <div className={styles.activityList}>
                {recentTrades.map((trade, index) => (
                  <div key={index} className={styles.activityItem}>
                    <div className={`${styles.activityIcon} ${styles[trade.type]}`}>
                      {trade.type === 'buy' ? '↗' : '↘'}
                    </div>
                    <div className={styles.activityInfo}>
                      <span className={styles.activityTitle}>
                        {trade.type === 'buy' ? 'Buy' : 'Sell'} - {trade.poolName}
                      </span>
                      <span className={styles.activityTime}>{formatDate(trade.timestamp)}</span>
                    </div>
                    <div className={styles.activityAmount}>
                      <span className={styles.tradeAmount}>{formatCurrency(trade.amount)}</span>
                      <span className={styles.feeAmount}>+{formatCurrency(trade.fee)} fee</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Footer Attribution */}
      <div className={styles.footer}>
        <span>Partner analytics powered by</span>
        <a href="https://bags.fm" target="_blank" rel="noopener noreferrer">
          <img src="/images/bags-logo.svg" alt="Bags" className={styles.bagsLogoFull} />
        </a>
      </div>
    </div>
  );
};

export default BagsPartnerDashboard;
