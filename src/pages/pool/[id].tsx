// src/pages/pool/[id].tsx
// Pool Detail Page - Shows pool details and participation options
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import styles from '../../styles/PoolDetailNew.module.css';
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
  FaLock,
  FaUnlock,
  FaWater,
  FaShieldAlt,
} from 'react-icons/fa';
import WalletGuide from '../../components/common/WalletGuide';
import BagsPoolTrading from '../../components/marketplace/BagsPoolTrading';

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
  // New tokenization & liquidity fields
  tokenStatus?: string;
  liquidityModel?: string;
  ammEnabled?: boolean;
  ammLiquidityPercent?: number;
  vendorPaymentPercent?: number;
  fundsInEscrow?: number;
}

interface UserPosition {
  balance: number;
  ownershipPercent: number;
  costBasis: number | null; // from MongoDB participants.investedUSD, null if bought on secondary
  currentValue: number;
  gainPercent: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: 'Open for Contributions', color: '#22c55e', icon: <FaMoneyBillWave /> },
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
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);

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

  // Fetch user token position when pool and wallet are available
  useEffect(() => {
    if (!pool || !wallet.publicKey || !pool.bagsTokenMint) {
      setUserPosition(null);
      return;
    }

    const fetchPosition = async () => {
      try {
        const { endpoint } = getClusterConfig();
        const mintPubkey = new PublicKey(pool.bagsTokenMint!);

        // Fetch token accounts for this wallet filtered by the pool token mint
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-token-accounts',
            method: 'getTokenAccountsByOwner',
            params: [
              wallet.publicKey!.toBase58(),
              { mint: mintPubkey.toBase58() },
              { encoding: 'jsonParsed' },
            ],
          }),
        });

        const data = await response.json();
        const accounts = data?.result?.value || [];

        let balance = 0;
        for (const account of accounts) {
          const info = account.account?.data?.parsed?.info;
          if (info) {
            balance += Number(info.tokenAmount?.uiAmount || 0);
          }
        }

        if (balance <= 0) {
          setUserPosition(null);
          return;
        }

        // Calculate ownership percent using totalShares as proxy for total supply
        const totalSupply = pool.totalShares;
        const ownershipPercent = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;

        // Look up cost basis from pool participants
        const participant = pool.participants?.find(
          (p) => p.wallet === wallet.publicKey!.toBase58()
        );
        const costBasis = participant ? participant.investedUSD : null;

        // Current value based on share price
        const currentValue = balance * (pool.sharePriceUSD || 0);

        // Gain/loss calculation
        const gainPercent =
          costBasis !== null && costBasis > 0
            ? ((currentValue - costBasis) / costBasis) * 100
            : null;

        setUserPosition({
          balance,
          ownershipPercent,
          costBasis,
          currentValue,
          gainPercent,
        });
      } catch (err) {
        console.error('Error fetching user position:', err);
        setUserPosition(null);
      }
    };

    fetchPosition();
  }, [pool, wallet.publicKey]);

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
        alert('Contribution successful!');
        fetchPool();
      } else {
        alert(data.error || 'Contribution failed');
      }
    } catch (err) {
      console.error('Contribution error:', err);
      alert('Failed to process contribution');
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
        <title>{pool.asset?.model || 'Pool'} | LuxHub Token Pool</title>
        <meta
          name="description"
          content={`Contribute to the token-backed pool for ${pool.asset?.model || 'luxury asset'}`}
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
                <FaUsers /> Token Holders ({pool.investorCount})
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
                        {p.shares} tokens ({p.ownershipPercent.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noParticipants}>No token holders yet. Be the first!</p>
              )}
            </div>
          </div>

          {/* Right Column - Pool Info */}
          <div className={styles.rightColumn}>
            <div className={styles.headerCard}>
              <h1>{pool.asset?.model || 'Token Pool'}</h1>
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
                    <FaChartLine /> {((pool.projectedROI - 1) * 100).toFixed(0)}% Projected Return
                  </span>
                )}
              </div>
            </div>

            {/* Funding Progress */}
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <span>Funding Progress</span>
                <span className={styles.progressPercent}>{pool.fundingProgress.toFixed(1)}%</span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(pool.fundingProgress, 100)}%` }}
                />
              </div>
              <div className={styles.progressDollars}>
                ${(pool.sharesSold * (pool.sharePriceUSD || 0)).toLocaleString()} of $
                {(pool.targetAmountUSD || 0).toLocaleString()}
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
                  <span className={styles.statLabel}>Contributors</span>
                </div>
              </div>
            </div>

            {/* Your Position */}
            {userPosition && userPosition.balance > 0 && (
              <div className={styles.positionCard}>
                <h3 className={styles.sectionTitle}>Your Position</h3>
                <div className={styles.positionGrid}>
                  <div className={styles.positionItem}>
                    <span className={styles.positionLabel}>Tokens Held</span>
                    <span className={styles.positionValue}>
                      {userPosition.balance.toLocaleString()}
                      <span className={styles.positionPercent}>
                        ({userPosition.ownershipPercent.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className={styles.positionItem}>
                    <span className={styles.positionLabel}>Cost Basis</span>
                    <span className={styles.positionValue}>
                      {userPosition.costBasis !== null
                        ? `$${userPosition.costBasis.toLocaleString()}`
                        : 'N/A'}
                    </span>
                  </div>
                  <div className={styles.positionItem}>
                    <span className={styles.positionLabel}>Current Value</span>
                    <span className={styles.positionValue}>
                      ${userPosition.currentValue.toLocaleString()}
                      {userPosition.gainPercent !== null && (
                        <span
                          className={
                            userPosition.gainPercent >= 0
                              ? styles.positiveGain
                              : styles.negativeGain
                          }
                        >
                          {' '}
                          ({userPosition.gainPercent >= 0 ? '+' : ''}
                          {userPosition.gainPercent.toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Contribution Card */}
            {pool.status === 'open' && (
              <div className={styles.investCard}>
                <h3>Contribute to This Pool</h3>

                <div className={styles.investInfo}>
                  <div className={styles.infoRow}>
                    <span>Token Price</span>
                    <span className={styles.sharePrice}>
                      ${pool.sharePriceUSD?.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Minimum Contribution</span>
                    <span>${pool.minBuyInUSD?.toLocaleString()}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Available Tokens</span>
                    <span>
                      {sharesRemaining} of {pool.totalShares}
                    </span>
                  </div>
                </div>

                {userInvestment ? (
                  <div className={styles.existingInvestment}>
                    <FaCheckCircle className={styles.checkIcon} />
                    <p>
                      You own {userInvestment.shares} tokens (
                      {userInvestment.ownershipPercent.toFixed(1)}%)
                    </p>
                    <span>Contributed: ${userInvestment.investedUSD.toLocaleString()}</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.sharesInput}>
                      <label>Number of Tokens</label>
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
                        <span>Contribution Amount</span>
                        <span className={styles.amount}>${investmentAmount.toLocaleString()}</span>
                      </div>
                      <div className={styles.summaryRow}>
                        <span>Ownership</span>
                        <span>{((investShares / pool.totalShares) * 100).toFixed(2)}%</span>
                      </div>
                      {pool.projectedROI && (
                        <div className={styles.summaryRow}>
                          <span>Estimated Return</span>
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
                        : `Contribute $${investmentAmount.toLocaleString()}`}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Pool Info Card */}
            <div className={styles.detailCard}>
              <h3>Pool Information</h3>
              <div className={styles.infoList}>
                {/* Token Status */}
                {pool.tokenStatus && (
                  <div className={styles.infoRow}>
                    <span>
                      {pool.tokenStatus === 'unlocked' ? <FaUnlock /> : <FaLock />} Token Status
                    </span>
                    <span
                      className={`${styles.tokenStatusBadge} ${styles[`tokenStatus_${pool.tokenStatus}`]}`}
                    >
                      {pool.tokenStatus === 'pending' && 'Pending'}
                      {pool.tokenStatus === 'minted' && 'Minted (Locked)'}
                      {pool.tokenStatus === 'unlocked' && 'Unlocked'}
                      {pool.tokenStatus === 'frozen' && 'Frozen'}
                      {pool.tokenStatus === 'burned' && 'Burned'}
                    </span>
                  </div>
                )}

                {/* Liquidity Model */}
                {pool.liquidityModel && (
                  <div className={styles.infoRow}>
                    <span>
                      <FaWater /> Liquidity Model
                    </span>
                    <span className={styles.liquidityBadge}>
                      {pool.liquidityModel === 'p2p' && 'P2P Trading'}
                      {pool.liquidityModel === 'amm' && `AMM (${pool.ammLiquidityPercent || 30}%)`}
                      {pool.liquidityModel === 'hybrid' && 'Hybrid (P2P + AMM)'}
                    </span>
                  </div>
                )}

                {/* Escrow Protection */}
                {pool.fundsInEscrow !== undefined && pool.fundsInEscrow > 0 && (
                  <div className={styles.infoRow}>
                    <span>
                      <FaShieldAlt /> Funds in Escrow
                    </span>
                    <span className={styles.escrowAmount}>
                      ${pool.fundsInEscrow.toLocaleString()}
                    </span>
                  </div>
                )}

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
                      href={getClusterConfig().explorerUrl(pool.escrowPda)}
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
                    <span>Pool Token</span>
                    <a
                      href={getClusterConfig().explorerUrl(pool.bagsTokenMint)}
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

            {/* Bags Secondary Market Trading */}
            <BagsPoolTrading
              pool={{
                _id: pool._id,
                poolNumber: pool._id.toString().slice(-6).toUpperCase(),
                bagsTokenMint: pool.bagsTokenMint,
                sharePriceUSD: pool.sharePriceUSD || 0,
                totalShares: pool.totalShares,
                sharesSold: pool.sharesSold,
                status: pool.status,
                asset: pool.asset
                  ? {
                      model: pool.asset.model,
                      brand: pool.asset.brand,
                    }
                  : undefined,
                // Tokenization & liquidity fields
                tokenStatus: pool.tokenStatus,
                liquidityModel: pool.liquidityModel,
                ammEnabled: pool.ammEnabled,
                ammLiquidityPercent: pool.ammLiquidityPercent,
                bondingCurveActive: pool.bondingCurveActive,
              }}
              userShares={userInvestment?.shares || 0}
              onTradeComplete={fetchPool}
            />

            {/* How This Works Explainer */}
            <div className={styles.explainerCard}>
              <button
                className={styles.explainerToggle}
                onClick={() => setShowExplainer(!showExplainer)}
              >
                <span>How This Works</span>
                <span className={styles.chevron}>{showExplainer ? '\u25B2' : '\u25BC'}</span>
              </button>

              {showExplainer && (
                <div className={styles.explainerContent}>
                  <div className={styles.explainerSteps}>
                    <div className={styles.step}>
                      <div className={styles.stepNumber}>1</div>
                      <div className={styles.stepText}>
                        <strong>Trading funds this watch</strong>
                        <p>
                          Token purchases go toward acquiring the luxury watch. When the pool
                          reaches 100%, the vendor ships the watch to LuxHub custody.
                        </p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <div className={styles.stepNumber}>2</div>
                      <div className={styles.stepText}>
                        <strong>Watch secured in custody</strong>
                        <p>
                          LuxHub verifies authenticity and stores the watch securely. Your tokens
                          represent a portion of this real asset.
                        </p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <div className={styles.stepNumber}>3</div>
                      <div className={styles.stepText}>
                        <strong>Trade tokens anytime</strong>
                        <p>
                          Buy or sell tokens on the secondary market. Token value is backed by the
                          real market price of the watch.
                        </p>
                      </div>
                    </div>
                    <div className={styles.step}>
                      <div className={styles.stepNumber}>4</div>
                      <div className={styles.stepText}>
                        <strong>Watch resells, holders get paid</strong>
                        <p>
                          When the watch is resold, 97% of the sale price is distributed
                          proportionally to all current token holders.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={styles.exitPaths}>
                    <h4 className={styles.exitTitle}>Two Ways to Exit</h4>
                    <div className={styles.exitGrid}>
                      <div className={styles.exitOption}>
                        <span className={styles.exitIcon}>
                          <FaChartLine />
                        </span>
                        <strong>Sell on Secondary Market</strong>
                        <p>Trade your tokens anytime at current market price.</p>
                      </div>
                      <div className={styles.exitOption}>
                        <span className={styles.exitIcon}>
                          <FaShieldAlt />
                        </span>
                        <strong>Hold Until Resale</strong>
                        <p>Keep tokens and receive your portion when the watch is resold.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
              <p className={styles.modalMessage}>Connect your wallet to contribute</p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PoolDetailPage;
