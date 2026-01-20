// src/pages/pool/[id].tsx
// Pool Detail Page - Shows investment pool details and participation options
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/PoolDetail.module.css';
import {
  FaArrowLeft,
  FaExternalLinkAlt,
  FaUsers,
  FaChartLine,
  FaClock,
  FaCheckCircle,
  FaBox,
  FaMoneyBillWave,
  FaTruck,
} from 'react-icons/fa';
import WalletGuide from '../../components/common/WalletGuide';

interface Asset {
  _id: string;
  model?: string;
  serial?: string;
  brand?: string;
  priceUSD?: number;
  description?: string;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  category?: string;
}

interface Participant {
  wallet: string;
  username?: string;
  shares: number;
  ownershipPercent: number;
  investedUSD: number;
  projectedReturnUSD?: number;
  investedAt?: string;
}

interface PoolData {
  _id: string;
  asset?: Asset;
  status: string;
  sourceType?: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD?: number;
  targetAmountUSD?: number;
  minBuyInUSD?: number;
  maxInvestors?: number;
  projectedROI?: number;
  fundingProgress: number;
  daysRemaining?: number | null;
  escrowPda?: string;
  vendor?: {
    businessName?: string;
    verified?: boolean;
  };
  vendorWallet?: string;
  participants?: Participant[];
  investorCount: number;
  custodyStatus?: string;
  custodyTrackingNumber?: string;
  resaleListingPriceUSD?: number;
  resaleSoldPriceUSD?: number;
  distributionStatus?: string;
  distributionAmount?: number;
  bagsTokenMint?: string;
  createdAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open for Investment', color: '#22c55e', icon: <FaMoneyBillWave /> },
  filled: { label: 'Fully Funded', color: '#3b82f6', icon: <FaCheckCircle /> },
  funded: { label: 'Vendor Paid', color: '#8b5cf6', icon: <FaCheckCircle /> },
  custody: { label: 'In Transit to LuxHub', color: '#f59e0b', icon: <FaTruck /> },
  active: { label: 'In LuxHub Custody', color: '#10b981', icon: <FaBox /> },
  listed: { label: 'Listed for Resale', color: '#8b5cf6', icon: <FaChartLine /> },
  sold: { label: 'Sold - Distribution Pending', color: '#22c55e', icon: <FaMoneyBillWave /> },
  distributing: { label: 'Distribution in Progress', color: '#f59e0b', icon: <FaMoneyBillWave /> },
  distributed: { label: 'Distributed', color: '#22c55e', icon: <FaCheckCircle /> },
  closed: { label: 'Closed', color: '#6b7280', icon: <FaCheckCircle /> },
};

const PoolDetailPage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const wallet = useWallet();

  const [pool, setPool] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [investShares, setInvestShares] = useState(1);
  const [isInvesting, setIsInvesting] = useState(false);

  const fetchPool = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/pool/${id}`);
      const data = await res.json();

      if (data.success) {
        setPool(data.pool);
      } else {
        setError(data.error || 'Failed to load pool');
      }
    } catch (err) {
      console.error('Error fetching pool:', err);
      setError('Failed to load pool details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

  const getAssetImage = (): string => {
    if (pool?.asset?.imageIpfsUrls?.[0]) return pool.asset.imageIpfsUrls[0];
    if (pool?.asset?.images?.[0]) return pool.asset.images[0];
    if (pool?.asset?.imageUrl) return pool.asset.imageUrl;
    return '/placeholder-watch.png';
  };

  const handleInvest = async () => {
    if (!wallet.connected) {
      setShowWalletModal(true);
      return;
    }

    if (!pool || investShares < 1) return;

    setIsInvesting(true);
    try {
      const res = await fetch('/api/pool/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: pool._id,
          shares: investShares,
          investorWallet: wallet.publicKey?.toBase58(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('Investment successful!');
        fetchPool();
      } else {
        alert(data.error || 'Investment failed');
      }
    } catch (err) {
      console.error('Investment error:', err);
      alert('Failed to process investment');
    } finally {
      setIsInvesting(false);
    }
  };

  const statusConfig = pool ? STATUS_CONFIG[pool.status] || STATUS_CONFIG.open : null;
  const sharesRemaining = pool ? pool.totalShares - pool.sharesSold : 0;
  const investmentAmount = pool ? investShares * (pool.sharePriceUSD || 0) : 0;
  const projectedReturn =
    pool && pool.projectedROI ? investmentAmount * pool.projectedROI : investmentAmount;

  // Check if user is already invested
  const userInvestment = pool?.participants?.find((p) => p.wallet === wallet.publicKey?.toBase58());

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading pool details...</p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className={styles.errorContainer}>
        <h2>Pool Not Found</h2>
        <p>{error || 'The requested pool could not be found.'}</p>
        <Link href="/pools" className={styles.backLink}>
          <FaArrowLeft /> Back to Pools
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{pool.asset?.model || 'Pool'} | LuxHub Investment Pool</title>
        <meta
          name="description"
          content={`Invest in fractional ownership of ${pool.asset?.model || 'luxury asset'}`}
        />
      </Head>

      <div className={styles.pageContainer}>
        <Link href="/pools" className={styles.backLink}>
          <FaArrowLeft /> Back to Pools
        </Link>

        <div className={styles.contentGrid}>
          {/* Left Column - Asset */}
          <div className={styles.leftColumn}>
            <div className={styles.imageCard}>
              <img
                src={getAssetImage()}
                alt={pool.asset?.model || 'Asset'}
                className={styles.assetImage}
              />
            </div>

            <div className={styles.detailCard}>
              <h3>Asset Details</h3>
              <div className={styles.detailGrid}>
                {pool.asset?.brand && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Brand</span>
                    <span className={styles.detailValue}>{pool.asset.brand}</span>
                  </div>
                )}
                {pool.asset?.model && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Model</span>
                    <span className={styles.detailValue}>{pool.asset.model}</span>
                  </div>
                )}
                {pool.asset?.serial && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Serial</span>
                    <span className={styles.detailValue}>{pool.asset.serial}</span>
                  </div>
                )}
              </div>
              {pool.asset?.description && (
                <p className={styles.description}>{pool.asset.description}</p>
              )}
            </div>

            {/* Participants List */}
            <div className={styles.detailCard}>
              <h3>
                <FaUsers /> Investors ({pool.investorCount})
              </h3>
              {pool.participants && pool.participants.length > 0 ? (
                <div className={styles.participantsList}>
                  {pool.participants.map((p, i) => (
                    <div key={i} className={styles.participantRow}>
                      <span className={styles.participantWallet}>
                        {p.username || `${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}`}
                        {p.wallet === wallet.publicKey?.toBase58() && (
                          <span className={styles.youBadge}>You</span>
                        )}
                      </span>
                      <span className={styles.participantShares}>
                        {p.shares} shares ({p.ownershipPercent.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noParticipants}>No investors yet. Be the first!</p>
              )}
            </div>
          </div>

          {/* Right Column - Investment Info */}
          <div className={styles.rightColumn}>
            <div className={styles.headerCard}>
              <h1>{pool.asset?.model || 'Investment Pool'}</h1>
              {pool.vendor?.businessName && (
                <p className={styles.vendorName}>
                  by {pool.vendor.businessName}
                  {pool.vendor.verified && <span className={styles.verifiedBadge}>Verified</span>}
                </p>
              )}

              <div className={styles.statusRow}>
                <span
                  className={styles.statusBadge}
                  style={{ backgroundColor: statusConfig?.color }}
                >
                  {statusConfig?.icon} {statusConfig?.label}
                </span>
                {pool.projectedROI && (
                  <span className={styles.roiBadge}>
                    <FaChartLine /> {((pool.projectedROI - 1) * 100).toFixed(0)}% Projected ROI
                  </span>
                )}
              </div>
            </div>

            {/* Funding Progress */}
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <span>Funding Progress</span>
                <span>{pool.fundingProgress.toFixed(1)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${pool.fundingProgress}%` }}
                />
              </div>
              <div className={styles.progressStats}>
                <div>
                  <span className={styles.statValue}>
                    ${(pool.sharesSold * (pool.sharePriceUSD || 0)).toLocaleString()}
                  </span>
                  <span className={styles.statLabel}>Raised</span>
                </div>
                <div>
                  <span className={styles.statValue}>
                    ${pool.targetAmountUSD?.toLocaleString()}
                  </span>
                  <span className={styles.statLabel}>Target</span>
                </div>
                <div>
                  <span className={styles.statValue}>{pool.investorCount}</span>
                  <span className={styles.statLabel}>Investors</span>
                </div>
              </div>
            </div>

            {/* Investment Card */}
            {pool.status === 'open' && (
              <div className={styles.investCard}>
                <h3>Invest in This Pool</h3>

                <div className={styles.investInfo}>
                  <div className={styles.infoRow}>
                    <span>Share Price</span>
                    <span className={styles.sharePrice}>
                      ${pool.sharePriceUSD?.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Minimum Investment</span>
                    <span>${pool.minBuyInUSD?.toLocaleString()}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Available Shares</span>
                    <span>
                      {sharesRemaining} of {pool.totalShares}
                    </span>
                  </div>
                </div>

                {userInvestment ? (
                  <div className={styles.existingInvestment}>
                    <FaCheckCircle className={styles.checkIcon} />
                    <p>
                      You own {userInvestment.shares} shares (
                      {userInvestment.ownershipPercent.toFixed(1)}%)
                    </p>
                    <span>Invested: ${userInvestment.investedUSD.toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.sharesInput}>
                      <label>Number of Shares</label>
                      <div className={styles.inputWrapper}>
                        <button
                          onClick={() => setInvestShares(Math.max(1, investShares - 1))}
                          disabled={investShares <= 1}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={investShares}
                          onChange={(e) =>
                            setInvestShares(
                              Math.max(1, Math.min(sharesRemaining, parseInt(e.target.value) || 1))
                            )
                          }
                          min={1}
                          max={sharesRemaining}
                        />
                        <button
                          onClick={() =>
                            setInvestShares(Math.min(sharesRemaining, investShares + 1))
                          }
                          disabled={investShares >= sharesRemaining}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className={styles.investSummary}>
                      <div className={styles.summaryRow}>
                        <span>Investment Amount</span>
                        <span className={styles.amount}>${investmentAmount.toLocaleString()}</span>
                      </div>
                      <div className={styles.summaryRow}>
                        <span>Ownership</span>
                        <span>{((investShares / pool.totalShares) * 100).toFixed(2)}%</span>
                      </div>
                      {pool.projectedROI && (
                        <div className={styles.summaryRow}>
                          <span>Projected Return</span>
                          <span className={styles.projected}>
                            ${projectedReturn.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      className={styles.investButton}
                      onClick={handleInvest}
                      disabled={isInvesting || sharesRemaining === 0}
                    >
                      {isInvesting
                        ? 'Processing...'
                        : `Invest $${investmentAmount.toLocaleString()}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Pool Info Card */}
            <div className={styles.detailCard}>
              <h3>Pool Information</h3>
              <div className={styles.infoList}>
                {pool.custodyStatus && (
                  <div className={styles.infoRow}>
                    <span>Custody Status</span>
                    <span className={styles.custodyStatus}>{pool.custodyStatus}</span>
                  </div>
                )}
                {pool.escrowPda && (
                  <div className={styles.infoRow}>
                    <span>Escrow PDA</span>
                    <a
                      href={`https://solscan.io/account/${pool.escrowPda}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.addressLink}
                    >
                      {pool.escrowPda.slice(0, 8)}...{pool.escrowPda.slice(-8)}
                      <FaExternalLinkAlt />
                    </a>
                  </div>
                )}
                {pool.bagsTokenMint && (
                  <div className={styles.infoRow}>
                    <span>Share Token</span>
                    <a
                      href={`https://solscan.io/token/${pool.bagsTokenMint}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.addressLink}
                    >
                      {pool.bagsTokenMint.slice(0, 8)}...
                      <FaExternalLinkAlt />
                    </a>
                  </div>
                )}
                <div className={styles.infoRow}>
                  <span>Created</span>
                  <span>
                    {pool.createdAt ? new Date(pool.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Distribution Info (if applicable) */}
            {(pool.distributionStatus || pool.resaleSoldPriceUSD) && (
              <div className={styles.distributionCard}>
                <h3>
                  <FaMoneyBillWave /> Distribution
                </h3>
                {pool.resaleSoldPriceUSD && (
                  <p className={styles.soldPrice}>
                    Sold for ${pool.resaleSoldPriceUSD.toLocaleString()}
                  </p>
                )}
                {pool.distributionAmount && (
                  <p className={styles.distributionAmount}>
                    ${pool.distributionAmount.toLocaleString()} to be distributed (97%)
                  </p>
                )}
                {pool.distributionStatus && (
                  <span className={styles.distributionStatus}>
                    Status: {pool.distributionStatus}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Wallet Modal */}
        {showWalletModal && (
          <div className={styles.modalOverlay} onClick={() => setShowWalletModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowWalletModal(false)}>
                &times;
              </button>
              <p className={styles.modalMessage}>Connect your wallet to invest</p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PoolDetailPage;
