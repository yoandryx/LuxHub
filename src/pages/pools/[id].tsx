// src/pages/pools/[id].tsx
// Dedicated pool detail page with lifecycle stepper, chart, trade widget,
// position summary, claim distribution, and how-it-works explainer (D-05)
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { FaArrowLeft, FaExternalLinkAlt, FaUsers } from 'react-icons/fa';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { PublicKey } from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { LifecycleStepper, getLifecycleStage } from '../../components/pool/LifecycleStepper';
import { HowItWorks } from '../../components/pool/HowItWorks';
import { TradeWidget } from '../../components/pool/TradeWidget';
import { PositionSummary } from '../../components/pool/PositionSummary';
import { ClaimDistribution } from '../../components/pool/ClaimDistribution';
import TvChart, { generatePriceHistory } from '../../components/marketplace/TvChart';
import styles from '../../styles/PoolDetailV2.module.css';

// ─── Interfaces ─────────────────────────────────────────────────

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
}

interface PoolData {
  _id: string;
  asset?: Asset;
  status: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD?: number;
  targetAmountUSD?: number;
  investorCount: number;
  fundingProgress: number;
  escrowPda?: string;
  vendor?: { businessName?: string; verified?: boolean };
  vendorWallet?: string;
  participants?: Participant[];
  custodyStatus?: string;
  distributionStatus?: string;
  distributionAmount?: number;
  bagsTokenMint?: string;
  createdAt?: string;
  graduated?: boolean;
  bondingCurveActive?: boolean;
  tokenStatus?: string;
  lastPriceUSD?: number;
  currentBondingPrice?: number;
  resaleSoldPriceUSD?: number;
  claimWindowExpiresAt?: string;
  recentTrades?: Array<{ price: number }>;
}

interface UserPosition {
  balance: number;
  ownershipPercent: number;
  costBasis: number;
  currentValue: number;
}

interface ClaimInfo {
  claimableAmount: number;
  ownershipPercent: number;
  claimed: boolean;
  txSignature?: string;
}

// ─── SWR Fetcher ─────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Page Component ──────────────────────────────────────────────

const PoolDetailV2Page: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const wallet = useEffectiveWallet();

  // Pool data via SWR
  const { data: poolRes, mutate: refreshPool } = useSWR(
    id ? `/api/pool/${id}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );
  const pool: PoolData | null = poolRes?.success ? poolRes.pool : null;
  const loading = !poolRes && !!id;
  const error = poolRes && !poolRes.success ? poolRes.error : null;

  // SOL price
  const { data: priceData } = useSWR('/api/price/sol', fetcher, { refreshInterval: 60000 });
  const solPrice = priceData?.price || 0;

  // User position
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [claimInfo, setClaimInfo] = useState<ClaimInfo | null>(null);

  // Fetch token balance for connected wallet
  useEffect(() => {
    if (!pool || !wallet.publicKey || !pool.bagsTokenMint) {
      setUserPosition(null);
      return;
    }

    const fetchPosition = async () => {
      try {
        const { endpoint } = getClusterConfig();
        const mintPubkey = new PublicKey(pool.bagsTokenMint!);

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
          if (info) balance += Number(info.tokenAmount?.uiAmount || 0);
        }

        if (balance <= 0) {
          setUserPosition(null);
          return;
        }

        const totalSupply = pool.totalShares;
        const ownershipPercent = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;

        const participant = pool.participants?.find(
          (p) => p.wallet === wallet.publicKey!.toBase58()
        );
        const costBasis = participant ? participant.investedUSD : 0;
        const currentValue = balance * (pool.sharePriceUSD || 0);

        setUserPosition({ balance, ownershipPercent, costBasis, currentValue });
      } catch (err) {
        console.error('Error fetching user position:', err);
        setUserPosition(null);
      }
    };

    fetchPosition();
  }, [pool, wallet.publicKey]);

  // Fetch claim info for distribution pools
  useEffect(() => {
    if (!pool || !wallet.publicKey) {
      setClaimInfo(null);
      return;
    }

    const isDistribution = ['distributed', 'closed'].includes(pool.status) ||
      ['proposed', 'approved', 'executed'].includes(pool.distributionStatus || '');

    if (!isDistribution) {
      setClaimInfo(null);
      return;
    }

    const fetchClaim = async () => {
      try {
        const res = await fetch('/api/pool/claim-distribution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: pool._id,
            claimerWallet: wallet.publicKey!.toBase58(),
          }),
        });
        const data = await res.json();
        if (res.ok) {
          setClaimInfo({
            claimableAmount: data.claimableAmount || 0,
            ownershipPercent: data.ownershipPercent || 0,
            claimed: data.claimed || false,
            txSignature: data.txSignature,
          });
        }
      } catch {
        setClaimInfo(null);
      }
    };

    fetchClaim();
  }, [pool, wallet.publicKey]);

  // Helpers
  const getAssetImage = (): string => {
    if (pool?.asset?.imageIpfsUrls?.[0]) return pool.asset.imageIpfsUrls[0];
    if (pool?.asset?.images?.[0]) return pool.asset.images[0];
    if (pool?.asset?.imageUrl) return pool.asset.imageUrl;
    return '/placeholder-watch.png';
  };

  const lifecycleStage = pool ? getLifecycleStage(pool) : 'launch';

  // Determine what to show in right column
  const isDistributionMode =
    pool &&
    (['distributed', 'closed'].includes(pool.status) ||
      ['proposed', 'approved', 'executed'].includes(pool.distributionStatus || ''));

  const isResaleMode = pool && ['sold', 'distributing'].includes(pool.status) && !isDistributionMode;

  // Don't show TradeWidget for terminal statuses
  const showTradeWidget =
    pool &&
    !isDistributionMode &&
    !isResaleMode &&
    !['distributed', 'closed'].includes(pool.status);

  // Generate chart data from recent trades or bonding price
  const chartData = pool?.recentTrades?.length
    ? pool.recentTrades.map((t) => t.price)
    : generatePriceHistory(pool?.currentBondingPrice || pool?.sharePriceUSD || 0.001, 50);

  // ─── Loading / Error States ─────────────────────────────────────

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
        <p>{error || 'Unable to load pool data. Pull to refresh or try again later.'}</p>
        <Link href="/pools" className={styles.backLink}>
          <FaArrowLeft /> Back to Pools
        </Link>
      </div>
    );
  }

  // ─── Page Title ─────────────────────────────────────────────────
  const pageTitle = pool.asset?.brand && pool.asset?.model
    ? `${pool.asset.brand} ${pool.asset.model} Pool | LuxHub`
    : `Pool | LuxHub`;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta
          name="description"
          content={`Participate in the tokenized pool for ${pool.asset?.brand || ''} ${pool.asset?.model || 'luxury asset'} on LuxHub.`}
        />
      </Head>

      <div className={styles.pageContainer}>
        {/* Back link */}
        <Link href="/pools" className={styles.backLink}>
          <FaArrowLeft /> Back to Pools
        </Link>

        {/* Lifecycle Stepper */}
        <LifecycleStepper currentStage={lifecycleStage} />

        {/* How It Works */}
        <HowItWorks />

        {/* Content Grid */}
        <div className={styles.contentGrid}>
          {/* ─── Left Column ─── */}
          <div className={styles.leftColumn}>
            {/* Pool Header with image */}
            <div className={styles.poolHeader}>
              <img
                src={getAssetImage()}
                alt={pool.asset?.model || 'Asset'}
                className={styles.poolHeaderImage}
              />
              <div className={styles.poolHeaderInfo}>
                <h1>{pool.asset?.brand} {pool.asset?.model || 'Token Pool'}</h1>
                {pool.vendor?.businessName && (
                  <p className={styles.vendorName}>by {pool.vendor.businessName}</p>
                )}
                <div className={styles.priceRow}>
                  <span className={styles.currentPrice}>
                    ${(pool.sharePriceUSD || 0).toFixed(6)}
                  </span>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className={styles.chartContainer}>
              {chartData.length > 2 ? (
                <TvChart
                  data={chartData}
                  chartType="area"
                  interactive={true}
                  showTimeframes={true}
                  showToolbar={true}
                  totalSupply={pool.totalShares}
                />
              ) : (
                <div className={styles.chartFallback}>
                  <span>Current Price</span>
                  <span className={styles.chartFallbackPrice}>
                    ${(pool.currentBondingPrice || pool.sharePriceUSD || 0).toFixed(6)}
                  </span>
                  <span>Chart data will appear as trading begins</span>
                </div>
              )}
            </div>

            {/* Pool Details */}
            <div className={styles.detailsCard}>
              <h3>Pool Details</h3>
              <div className={styles.infoRow}>
                <span>Status</span>
                <span style={{ textTransform: 'capitalize' }}>{pool.status}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Total Supply</span>
                <span>{pool.totalShares?.toLocaleString()}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Contributors</span>
                <span>{pool.investorCount}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Funding Progress</span>
                <span>{pool.fundingProgress?.toFixed(1)}%</span>
              </div>
              {pool.targetAmountUSD && (
                <div className={styles.infoRow}>
                  <span>Target</span>
                  <span>${pool.targetAmountUSD.toLocaleString()}</span>
                </div>
              )}
              {pool.bagsTokenMint && (
                <div className={styles.infoRow}>
                  <span>Token Mint</span>
                  <a
                    href={getClusterConfig().explorerUrl(pool.bagsTokenMint)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.addressLink}
                  >
                    {pool.bagsTokenMint.slice(0, 8)}...{pool.bagsTokenMint.slice(-6)}
                    <FaExternalLinkAlt size={10} />
                  </a>
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
                    {pool.escrowPda.slice(0, 8)}...{pool.escrowPda.slice(-6)}
                    <FaExternalLinkAlt size={10} />
                  </a>
                </div>
              )}
              <div className={styles.infoRow}>
                <span>Created</span>
                <span>{pool.createdAt ? new Date(pool.createdAt).toLocaleDateString() : 'N/A'}</span>
              </div>
            </div>

            {/* Asset Info */}
            {pool.asset && (
              <div className={styles.assetCard}>
                <h3>Asset Information</h3>
                <div className={styles.assetGrid}>
                  {pool.asset.brand && (
                    <div className={styles.assetField}>
                      <span className={styles.assetFieldLabel}>Brand</span>
                      <span className={styles.assetFieldValue}>{pool.asset.brand}</span>
                    </div>
                  )}
                  {pool.asset.model && (
                    <div className={styles.assetField}>
                      <span className={styles.assetFieldLabel}>Model</span>
                      <span className={styles.assetFieldValue}>{pool.asset.model}</span>
                    </div>
                  )}
                  {pool.asset.serial && (
                    <div className={styles.assetField}>
                      <span className={styles.assetFieldLabel}>Serial</span>
                      <span className={styles.assetFieldValue}>{pool.asset.serial}</span>
                    </div>
                  )}
                  {pool.asset.category && (
                    <div className={styles.assetField}>
                      <span className={styles.assetFieldLabel}>Category</span>
                      <span className={styles.assetFieldValue}>{pool.asset.category}</span>
                    </div>
                  )}
                </div>
                {pool.asset.description && (
                  <p className={styles.assetDescription}>{pool.asset.description}</p>
                )}
              </div>
            )}
          </div>

          {/* ─── Right Column ─── */}
          <div className={styles.rightColumn}>
            {/* Trade Widget OR Claim Panel OR Resale Message */}
            {isDistributionMode && claimInfo ? (
              <ClaimDistribution
                poolId={pool._id}
                claimerWallet={wallet.publicKey?.toBase58() || ''}
                claimableAmount={claimInfo.claimableAmount}
                ownershipPercent={claimInfo.ownershipPercent}
                claimed={claimInfo.claimed}
                claimWindowExpiresAt={pool.claimWindowExpiresAt}
                txSignature={claimInfo.txSignature}
              />
            ) : isDistributionMode ? (
              <ClaimDistribution
                poolId={pool._id}
                claimerWallet={wallet.publicKey?.toBase58() || ''}
                claimableAmount={0}
                ownershipPercent={0}
                claimed={false}
              />
            ) : isResaleMode ? (
              <div className={styles.resaleMessage}>
                <h3>Resale in Progress</h3>
                <p>
                  The watch is being sold. Once the sale is confirmed, proceeds will be
                  available for distribution to token holders.
                </p>
              </div>
            ) : showTradeWidget ? (
              <TradeWidget
                pool={{
                  _id: pool._id,
                  bagsTokenMint: pool.bagsTokenMint,
                  graduated: pool.graduated,
                  status: pool.status,
                  bondingCurveActive: pool.bondingCurveActive,
                  lastPriceUSD: pool.lastPriceUSD,
                  currentBondingPrice: pool.currentBondingPrice,
                  targetAmountUSD: pool.targetAmountUSD,
                  sharesSold: pool.sharesSold,
                  totalShares: pool.totalShares,
                }}
                onTradeComplete={() => refreshPool()}
              />
            ) : null}

            {/* Position Summary */}
            {userPosition ? (
              <PositionSummary
                tokenBalance={userPosition.balance}
                ownershipPercent={userPosition.ownershipPercent}
                costBasis={userPosition.costBasis}
                currentValue={userPosition.currentValue}
                poolStatus={pool.status}
              />
            ) : (
              <PositionSummary
                tokenBalance={0}
                ownershipPercent={0}
                costBasis={0}
                currentValue={0}
                poolStatus={pool.status}
              />
            )}

            {/* Pool Info (holders, volume) */}
            <div className={styles.poolInfoCard}>
              <h3><FaUsers size={14} /> Token Holders ({pool.investorCount})</h3>
              {pool.participants && pool.participants.length > 0 ? (
                pool.participants.slice(0, 10).map((p, i) => (
                  <div key={i} className={styles.infoRow}>
                    <span>
                      {p.username || `${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}`}
                      {p.wallet === wallet.publicKey?.toBase58() ? ' (You)' : ''}
                    </span>
                    <span>{p.ownershipPercent.toFixed(1)}%</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', padding: 16, margin: 0 }}>
                  No token holders yet. Be the first!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PoolDetailV2Page;
