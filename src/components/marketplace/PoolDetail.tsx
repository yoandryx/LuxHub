import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import BagsPoolTrading from './BagsPoolTrading';
import { GovernanceDashboard } from '../governance';
import { usePoolStatus } from '../../hooks/usePools';
import styles from '../../styles/PoolDetail.module.css';

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
  maxInvestors: number;
  projectedROI: number;
  participants?: Array<{
    wallet: string;
    shares: number;
    ownershipPercent: number;
    investedUSD: number;
  }>;
  custodyStatus?: string;
  resaleListingPriceUSD?: number;
  createdAt?: string;
  // Bags integration
  bagsTokenMint?: string;
  tokenStatus?: string;
  liquidityModel?: string;
  ammEnabled?: boolean;
  ammLiquidityPercent?: number;
  // Squad DAO governance
  graduated?: boolean;
  squadMultisigPda?: string;
  squadVaultPda?: string;
  squadThreshold?: number;
  squadMembers?: Array<{
    wallet: string;
    tokenBalance: number;
    ownershipPercent: number;
    joinedAt: string;
    permissions: number;
  }>;
  squadCreatedAt?: string;
}

interface PoolDetailProps {
  pool: Pool;
  onClose: () => void;
  onInvestmentComplete?: () => void;
}

const PoolDetail: React.FC<PoolDetailProps> = ({ pool, onClose, onInvestmentComplete }) => {
  const { publicKey, connected } = useWallet();
  const [shares, setShares] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'invest' | 'trade' | 'governance'>('invest');

  // Use SWR for real-time pool status updates
  const { poolStatus, mutate: refreshStatus } = usePoolStatus(pool._id);

  // Merge pool prop with real-time status
  const poolData: Pool = {
    ...pool,
    ...(poolStatus || {}),
  };

  const availableShares = poolData.totalShares - poolData.sharesSold;
  const investmentAmount = shares * poolData.sharePriceUSD;
  const projectedReturn = investmentAmount * poolData.projectedROI;
  const ownershipPercent = (shares / poolData.totalShares) * 100;

  // Check if user already invested
  const userInvestment = poolData.participants?.find((p) => p.wallet === publicKey?.toBase58());
  const userShares = userInvestment?.shares || 0;

  // Determine if trading is available
  const hasToken = !!poolData.bagsTokenMint;
  const canTrade = hasToken && poolData.status !== 'open';
  const hasGovernance = poolData.graduated && !!poolData.squadMultisigPda;

  // Auto-switch tab based on pool status
  useEffect(() => {
    if (hasGovernance) {
      setActiveTab('governance');
    } else if (poolData.status !== 'open' && hasToken) {
      setActiveTab('trade');
    }
  }, [poolData.status, hasToken, hasGovernance]);

  const handleInvest = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet to invest');
      return;
    }

    if (shares < 1 || shares > availableShares) {
      setError(`Please select between 1 and ${availableShares} shares`);
      return;
    }

    if (investmentAmount < poolData.minBuyInUSD) {
      setError(`Minimum investment is $${poolData.minBuyInUSD}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/pool/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          investorWallet: publicKey.toBase58(),
          shares,
          investedUSD: investmentAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process investment');
      }

      setSuccess(true);
      onInvestmentComplete?.();

      // Refresh pool data via SWR
      refreshStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTradeComplete = () => {
    refreshStatus();
    onInvestmentComplete?.();
  };

  const getStatusInfo = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; description: string }> = {
      open: { label: 'Open', color: '#00ff88', description: 'Accepting investments' },
      filled: {
        label: 'Filled',
        color: '#ffd700',
        description: 'Target reached, pending vendor payment',
      },
      funded: { label: 'Funded', color: '#00bfff', description: 'Vendor paid, awaiting shipment' },
      custody: { label: 'In Custody', color: '#ff69b4', description: 'Asset shipped to LuxHub' },
      active: { label: 'Active', color: '#9370db', description: 'LuxHub holds asset securely' },
      graduated: {
        label: 'Graduated',
        color: '#c8a1ff',
        description: 'DAO governance active - token holders vote on asset decisions',
      },
      listed: { label: 'Listed', color: '#ff8c00', description: 'Listed for resale' },
      sold: { label: 'Sold', color: '#32cd32', description: 'Asset sold, pending distribution' },
      distributed: {
        label: 'Distributed',
        color: '#c0c0c0',
        description: 'Proceeds distributed to investors',
      },
      closed: { label: 'Closed', color: '#808080', description: 'Pool finalized' },
    };
    return statusMap[status] || { label: status, color: '#c8a1ff', description: '' };
  };

  const statusInfo = getStatusInfo(poolData.status);
  const assetImage =
    poolData.asset?.imageIpfsUrls?.[0] ||
    poolData.asset?.images?.[0] ||
    '/images/placeholder-watch.png';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>

        <div className={styles.content}>
          {/* Left: Asset Image */}
          <div className={styles.imageSection}>
            <img src={assetImage} alt={poolData.asset?.model} className={styles.assetImage} />
            <div className={styles.statusBadge} style={{ backgroundColor: statusInfo.color }}>
              {statusInfo.label}
            </div>
          </div>

          {/* Right: Details & Investment */}
          <div className={styles.detailsSection}>
            <div className={styles.header}>
              <span className={styles.poolId}>
                Pool #{poolData.poolNumber || poolData._id.slice(-6)}
              </span>
              <h2 className={styles.assetTitle}>{poolData.asset?.model || 'Luxury Watch'}</h2>
              {poolData.asset?.brand && (
                <span className={styles.brand}>{poolData.asset.brand}</span>
              )}
            </div>

            {/* Status Description */}
            <p className={styles.statusDescription}>{statusInfo.description}</p>

            {/* Progress */}
            <div className={styles.progressSection}>
              <div className={styles.progressHeader}>
                <span>Funding Progress</span>
                <span>{((poolData.sharesSold / poolData.totalShares) * 100).toFixed(1)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${Math.min((poolData.sharesSold / poolData.totalShares) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className={styles.progressMeta}>
                <span>
                  {poolData.sharesSold} / {poolData.totalShares} shares sold
                </span>
                <span>
                  ${(poolData.sharesSold * poolData.sharePriceUSD).toLocaleString()} raised
                </span>
              </div>
            </div>

            {/* Key Metrics */}
            <div className={styles.metricsGrid}>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Target Amount</span>
                <span className={styles.metricValue}>
                  ${poolData.targetAmountUSD.toLocaleString()}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Share Price</span>
                <span className={styles.metricValue}>
                  ${poolData.sharePriceUSD.toLocaleString()}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Min Investment</span>
                <span className={styles.metricValue}>${poolData.minBuyInUSD.toLocaleString()}</span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Projected ROI</span>
                <span className={styles.metricValue} style={{ color: '#00ff88' }}>
                  {((poolData.projectedROI - 1) * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            {/* User's Current Investment */}
            {userInvestment && (
              <div className={styles.userInvestment}>
                <h4>Your Investment</h4>
                <div className={styles.userStats}>
                  <div>
                    <span>Shares Owned</span>
                    <strong>{userInvestment.shares}</strong>
                  </div>
                  <div>
                    <span>Ownership</span>
                    <strong>{userInvestment.ownershipPercent.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>Invested</span>
                    <strong>${userInvestment.investedUSD.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs for Invest/Trade/Governance */}
            {(poolData.status === 'open' || canTrade || hasGovernance) && (
              <div className={styles.actionTabs}>
                <button
                  className={`${styles.actionTab} ${activeTab === 'invest' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('invest')}
                  disabled={poolData.status !== 'open'}
                >
                  Invest
                </button>
                <button
                  className={`${styles.actionTab} ${activeTab === 'trade' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('trade')}
                  disabled={!hasToken}
                >
                  Trade {!hasToken && '🔒'}
                </button>
                <button
                  className={`${styles.actionTab} ${activeTab === 'governance' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('governance')}
                  disabled={!hasGovernance}
                >
                  Governance {hasGovernance ? '🏛️' : '🔒'}
                </button>
              </div>
            )}

            {/* Investment Form */}
            {activeTab === 'invest' && poolData.status === 'open' && availableShares > 0 && (
              <div className={styles.investmentForm}>
                <h4>Buy Shares</h4>

                <div className={styles.sharesInput}>
                  <button
                    className={styles.shareBtn}
                    onClick={() => setShares(Math.max(1, shares - 1))}
                    disabled={shares <= 1}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) =>
                      setShares(
                        Math.min(availableShares, Math.max(1, parseInt(e.target.value) || 1))
                      )
                    }
                    min={1}
                    max={availableShares}
                    className={styles.shareInput}
                  />
                  <button
                    className={styles.shareBtn}
                    onClick={() => setShares(Math.min(availableShares, shares + 1))}
                    disabled={shares >= availableShares}
                  >
                    +
                  </button>
                </div>

                <div className={styles.investmentSummary}>
                  <div className={styles.summaryRow}>
                    <span>Investment Amount</span>
                    <span>${investmentAmount.toLocaleString()}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Ownership %</span>
                    <span>{ownershipPercent.toFixed(2)}%</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Projected Return</span>
                    <span style={{ color: '#00ff88' }}>${projectedReturn.toLocaleString()}</span>
                  </div>
                </div>

                {error && <p className={styles.error}>{error}</p>}
                {success && (
                  <p className={styles.success}>
                    Investment successful! You now own {shares} shares.
                  </p>
                )}

                <button
                  className={styles.investButton}
                  onClick={handleInvest}
                  disabled={loading || !connected || success}
                >
                  {loading
                    ? 'Processing...'
                    : !connected
                      ? 'Connect Wallet'
                      : `Invest $${investmentAmount.toLocaleString()}`}
                </button>
              </div>
            )}

            {/* Trading Section - Powered by Bags */}
            {activeTab === 'trade' && (
              <div className={styles.tradingSection}>
                <BagsPoolTrading
                  pool={poolData}
                  userShares={userShares}
                  onTradeComplete={handleTradeComplete}
                />
              </div>
            )}

            {/* Governance Section - Squad DAO */}
            {activeTab === 'governance' && hasGovernance && (
              <div className={styles.tradingSection}>
                <GovernanceDashboard
                  pool={poolData}
                  onProposalCreated={refreshStatus}
                  onVoteComplete={refreshStatus}
                />
              </div>
            )}

            {/* Pool Closed Message - only show if no trading or governance available */}
            {poolData.status !== 'open' && !canTrade && !hasGovernance && (
              <div className={styles.closedMessage}>
                <p>This pool is no longer accepting investments.</p>
                {poolData.resaleListingPriceUSD && (
                  <p>Listed for resale at: ${poolData.resaleListingPriceUSD.toLocaleString()}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoolDetail;
