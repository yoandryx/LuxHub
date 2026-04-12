// src/pages/pools/[id].tsx
// Dedicated pool detail page with lifecycle stepper, chart, trade widget,
// position summary, claim distribution, and how-it-works explainer (D-05)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import useSWR from 'swr';
import { FaArrowLeft, FaExternalLinkAlt, FaUsers, FaCopy, FaCheckCircle } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import toast from 'react-hot-toast';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { Connection, PublicKey } from '@solana/web3.js';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import { buildBurnTx } from '@/lib/solana/buildBurnTx';
import { resolveImageUrl } from '../../utils/imageUtils';
import { useLivePoolStats } from '../../hooks/usePools';
import { LifecycleStepper, getLifecycleStage } from '../../components/pool/LifecycleStepper';
import PoolLifecycleStepper, {
  PoolTokenStatus,
} from '../../components/pool/PoolLifecycleStepper';
import { PoolProgressBar } from '../../components/marketplace/PoolProgressBar';
import { HowItWorks } from '../../components/pool/HowItWorks';
import { TradeWidget } from '../../components/pool/TradeWidget';
import { PositionSummary } from '../../components/pool/PositionSummary';
import { ClaimDistribution } from '../../components/pool/ClaimDistribution';
import TvChart, { generatePriceHistory } from '../../components/marketplace/TvChart';
import styles from '../../styles/PoolDetailV2.module.css';

// Bags tokens always use 9 decimals (per bags-fm skill reference).
const BAGS_TOKEN_DECIMALS = 9;
// Phase 11 token statuses eligible for holder claim.
const CLAIM_ELIGIBLE_TOKEN_STATUSES: readonly PoolTokenStatus[] = [
  'resold',
  'partial_distributed',
] as const;

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
  nftMint?: string;
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
  poolNumber?: string;
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
  bagsTokenName?: string;
  bagsTokenSymbol?: string;
  bagsTokenMetadataUrl?: string;
  bagsTokenStatus?: 'PRE_LAUNCH' | 'PRE_GRAD' | 'MIGRATING' | 'MIGRATED';
  createdAt?: string;
  graduated?: boolean;
  bondingCurveActive?: boolean;
  tokenStatus?: PoolTokenStatus;
  lastPriceUSD?: number;
  currentBondingPrice?: number;
  resaleSoldPriceUSD?: number;
  claimWindowExpiresAt?: string;
  recentTrades?: Array<{ price: number }>;
  meteoraConfigKey?: string;
  // Phase 11 fee-funded rewire fields
  fundingTargetUsdc?: number; // USDC base units (6 decimals)
  fundingTargetUsdcSource?: 'listing_price' | 'vendor_override';
  accumulatedFeesLamports?: number;
  accumulatedFeesLamportsPending?: number;
  lastFeeClaimAt?: string;
  backingEscrowPda?: string;
  custodyVaultPda?: string;
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
  const { id, side } = router.query;
  const wallet = useEffectiveWallet();
  const initialTradeSide = side === 'sell' ? 'sell' : 'buy';

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

  // Live on-chain stats (holder count, supply, live price, market cap, 24h volume).
  // Refreshes every 30s — gives us authoritative data vs webhook-fed MongoDB fields.
  const { getStats: getLiveStats } = useLivePoolStats([pool?.bagsTokenMint]);
  const liveStats = getLiveStats(pool?.bagsTokenMint);

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

  // ─── SSE live fee arrival stream (Phase 11-17) ─────────────────
  // Subscribes to /api/pool/events/stream while the pool has a live token.
  // On fee delta: refresh pool data + toast the incoming SOL amount.
  // On state change: refresh pool data + toast the lifecycle transition.
  // EventSource auto-reconnects on disconnect (including the Vercel 60s cap).
  useEffect(() => {
    if (!id || typeof id !== 'string') return;
    if (!pool?.bagsTokenMint) return; // No token yet => nothing to stream
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let closed = false;
    const es = new EventSource(
      `/api/pool/events/stream?poolId=${encodeURIComponent(id)}`
    );

    const onSnapshot = (_e: MessageEvent) => {
      // Snapshot aligns the client with current server state; no toast needed.
    };

    const onFees = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          accumulatedDelta?: number;
          pendingDelta?: number;
          delta?: number;
        };
        const deltaLamports = Number(data.delta || 0);
        if (deltaLamports > 0) {
          const deltaSol = deltaLamports / 1e9;
          // Only toast notable fee arrivals (>= 0.0001 SOL) to avoid spam.
          if (deltaSol >= 0.0001) {
            toast.success(`+${deltaSol.toFixed(4)} SOL in fees arrived`);
          }
        }
        // Always refresh pool data so UI reflects the new accumulated totals.
        refreshPool();
      } catch {
        // Ignore malformed event
      }
    };

    const onState = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as {
          tokenStatus?: string;
          previous?: string;
        };
        if (data.tokenStatus && data.tokenStatus !== data.previous) {
          toast.success(`Pool state: ${data.previous || '—'} → ${data.tokenStatus}`);
        }
        refreshPool();
      } catch {
        // Ignore malformed event
      }
    };

    es.addEventListener('snapshot', onSnapshot as EventListener);
    es.addEventListener('fees', onFees as EventListener);
    es.addEventListener('state', onState as EventListener);

    es.onerror = () => {
      // EventSource auto-reconnects by default; noop. Log for diagnostics.
      if (!closed) {
        // eslint-disable-next-line no-console
        console.debug('[pool SSE] transient connection error, auto-reconnecting');
      }
    };

    return () => {
      closed = true;
      es.removeEventListener('snapshot', onSnapshot as EventListener);
      es.removeEventListener('fees', onFees as EventListener);
      es.removeEventListener('state', onState as EventListener);
      try {
        es.close();
      } catch {
        /* noop */
      }
    };
  }, [id, pool?.bagsTokenMint, refreshPool]);

  // Helpers
  const getAssetImage = (): string => {
    const raw = pool?.asset?.imageIpfsUrls?.[0] || pool?.asset?.images?.[0] || pool?.asset?.imageUrl;
    return raw ? resolveImageUrl(raw) : '/images/purpleLGG.png';
  };

  const copyAddress = useCallback((address: string, label: string) => {
    navigator.clipboard.writeText(address);
    toast.success(`${label} copied!`);
  }, []);

  const lifecycleStage = pool ? getLifecycleStage(pool) : 'launch';

  // ─── Phase 11: Fee-funded progress + claim ────────────────────
  // USD-denominated graduation target (authoritative, comes from fundingTargetUsdc).
  const targetUsd = pool?.fundingTargetUsdc
    ? pool.fundingTargetUsdc / 1e6
    : pool?.targetAmountUSD || 0;

  const accumulatedUsd = solPrice
    ? ((pool?.accumulatedFeesLamports || 0) / 1e9) * solPrice
    : 0;
  const pendingUsd = solPrice
    ? ((pool?.accumulatedFeesLamportsPending || 0) / 1e9) * solPrice
    : 0;

  // Highlight pulse when accumulatedFeesLamports changes (local delta tracking
  // gives a visual "fee arrived" feedback even when SSE isn't available).
  const lastFeeLamportsRef = useRef<number>(pool?.accumulatedFeesLamports || 0);
  const [feeHighlight, setFeeHighlight] = useState(false);
  useEffect(() => {
    if (!pool) return;
    const current = pool.accumulatedFeesLamports || 0;
    if (current > lastFeeLamportsRef.current) {
      setFeeHighlight(true);
      const t = setTimeout(() => setFeeHighlight(false), 1800);
      lastFeeLamportsRef.current = current;
      return () => clearTimeout(t);
    }
    lastFeeLamportsRef.current = current;
  }, [pool?.accumulatedFeesLamports]);

  // Bags DBC informational state (from bagsTokenStatus; may be absent).
  const bagsDbcState = pool?.bagsTokenStatus as
    | 'PRE_LAUNCH'
    | 'PRE_GRAD'
    | 'MIGRATING'
    | 'MIGRATED'
    | undefined;

  // Rough DBC progress estimate: fully filled if migrated, else mirror funding %.
  const bagsDbcProgress = bagsDbcState
    ? bagsDbcState === 'MIGRATED'
      ? 100
      : bagsDbcState === 'MIGRATING'
        ? 95
        : targetUsd > 0
          ? Math.min(100, (accumulatedUsd / targetUsd) * 100)
          : 0
    : undefined;

  // Position P&L (only meaningful if we have a current token price and cost basis)
  const positionPnlUsd = userPosition
    ? userPosition.currentValue - userPosition.costBasis
    : 0;
  const positionPnlPct =
    userPosition && userPosition.costBasis > 0
      ? (positionPnlUsd / userPosition.costBasis) * 100
      : 0;
  const hasPnl = !!userPosition && userPosition.costBasis > 0;

  // ─── Phase 11 claim eligibility + handler ─────────────────────
  const isClaimEligibleState = !!(
    pool?.tokenStatus &&
    CLAIM_ELIGIBLE_TOKEN_STATUSES.includes(pool.tokenStatus as PoolTokenStatus)
  );
  const walletB58 = wallet.publicKey?.toBase58();
  const canClaim = !!(
    isClaimEligibleState &&
    walletB58 &&
    claimInfo &&
    !claimInfo.claimed &&
    claimInfo.claimableAmount > 0
  );
  const [claiming, setClaiming] = useState(false);

  const handleClaim = useCallback(async () => {
    if (!pool || !pool.bagsTokenMint || !wallet.publicKey || !wallet.signTransaction) {
      toast.error('Wallet not connected');
      return;
    }
    if (!userPosition || userPosition.balance <= 0) {
      toast.error('No tokens in your wallet to burn');
      return;
    }
    setClaiming(true);
    const connection = new Connection(getClusterConfig().endpoint, 'confirmed');
    try {
      toast('Preparing burn transaction…', { icon: '🔨' });

      // Convert UI balance → raw amount for burn (Bags uses 9 decimals).
      const rawAmount = BigInt(
        Math.floor(userPosition.balance * 10 ** BAGS_TOKEN_DECIMALS)
      );

      const tx = await buildBurnTx({
        connection,
        holderWallet: wallet.publicKey,
        mint: new PublicKey(pool.bagsTokenMint),
        amount: rawAmount,
        decimals: BAGS_TOKEN_DECIMALS,
      });

      toast('Sign the burn in your wallet…', { icon: '✍️' });
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      toast('Waiting for burn confirmation…', { icon: '⏳' });
      await connection.confirmTransaction(sig, 'confirmed');

      toast('Submitting claim to LuxHub…', { icon: '📨' });
      const res = await fetch(
        `/api/pools/distribution/${encodeURIComponent(pool._id)}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holderWallet: wallet.publicKey.toBase58(),
            burnTxSignature: sig,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || data?.detail || 'Claim failed');
      }

      toast.success(`Claim submitted! $${(data.payoutUSD || 0).toFixed(2)} payout queued.`);
      refreshPool();
      setClaimInfo((prev) =>
        prev ? { ...prev, claimed: true, txSignature: sig } : prev
      );
    } catch (err: any) {
      console.error('[claim] error:', err);
      toast.error(err?.message || 'Claim failed');
    } finally {
      setClaiming(false);
    }
  }, [pool, wallet, userPosition, refreshPool]);

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

        {/* Phase 11: 8-state canonical Lifecycle Stepper (replaces legacy 6-state).
            Falls back to legacy stepper if pool.tokenStatus is not a phase-11 value. */}
        <div className={styles.desktopOnly}>
          {pool.tokenStatus ? (
            <PoolLifecycleStepper currentState={pool.tokenStatus as PoolTokenStatus} />
          ) : (
            <LifecycleStepper currentStage={lifecycleStage} />
          )}

          {/* Phase 11: Dual progress bars — LuxHub fees primary, Bags DBC informational */}
          {targetUsd > 0 && (
            <div className={styles.phase11ProgressWrapper}>
              <PoolProgressBar
                accumulatedUsd={accumulatedUsd}
                pendingUsd={pendingUsd || undefined}
                targetUsd={targetUsd}
                bagsDbcState={bagsDbcState}
                bagsDbcProgress={bagsDbcProgress}
                highlightPrimary={feeHighlight}
              />
            </div>
          )}

          <HowItWorks />
        </div>

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
                    ${(liveStats?.priceUSD || pool.currentBondingPrice || pool.sharePriceUSD || 0).toFixed(6)}
                  </span>
                  {pool.poolNumber && (
                    <span className={styles.tokenSymbolBadge}>
                      {pool.bagsTokenSymbol || pool.poolNumber}
                    </span>
                  )}
                  <span className={styles.lifecycleBadge} data-stage={lifecycleStage}>
                    {lifecycleStage.charAt(0).toUpperCase() + lifecycleStage.slice(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Token Info Bar — shows mint, links when token exists */}
            {pool.bagsTokenMint && (
              <div className={styles.tokenInfoBar}>
                <div className={styles.tokenInfoItem}>
                  <span className={styles.tokenInfoLabel}>Mint Address</span>
                  <button
                    className={styles.mintCopyBtn}
                    onClick={() => copyAddress(pool.bagsTokenMint!, 'Mint address')}
                    title="Copy full address"
                  >
                    <span className={styles.mintAddress}>
                      {pool.bagsTokenMint.slice(0, 6)}...{pool.bagsTokenMint.slice(-4)}
                    </span>
                    <FaCopy size={10} />
                  </button>
                </div>
                {pool.bagsTokenSymbol && (
                  <div className={styles.tokenInfoItem}>
                    <span className={styles.tokenInfoLabel}>Symbol</span>
                    <span className={styles.tokenInfoValue}>{pool.bagsTokenSymbol}</span>
                  </div>
                )}
                <div className={styles.tokenInfoItem}>
                  <span className={styles.tokenInfoLabel}>Supply</span>
                  <span className={styles.tokenInfoValue}>{(pool.totalShares || 1_000_000_000).toLocaleString()}</span>
                </div>
                <div className={styles.tokenInfoLinks}>
                  <a
                    href={getClusterConfig().explorerUrl(pool.bagsTokenMint)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.tokenLink}
                    title="View on Solscan"
                  >
                    <SiSolana size={12} /> Solscan
                  </a>
                  <a
                    href={`https://bags.fm/token/${pool.bagsTokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.tokenLink}
                    title="View on Bags"
                  >
                    <FaExternalLinkAlt size={10} /> Bags
                  </a>
                  <a
                    href={`https://jup.ag/swap/SOL-${pool.bagsTokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.tokenLink}
                    title="Trade on Jupiter"
                  >
                    <FaExternalLinkAlt size={10} /> Jupiter
                  </a>
                </div>
              </div>
            )}

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
                <span className={styles.statusValue} data-status={pool.status}>{pool.status}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Token Price</span>
                <span className={styles.priceValue}>${(liveStats?.priceUSD || pool.currentBondingPrice || pool.sharePriceUSD || 0).toFixed(6)}</span>
              </div>
              {liveStats?.marketCapUSD ? (
                <div className={styles.infoRow}>
                  <span>Market Cap</span>
                  <span>${liveStats.marketCapUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ) : null}
              {liveStats?.volume24hUSD ? (
                <div className={styles.infoRow}>
                  <span>24h Volume</span>
                  <span>${liveStats.volume24hUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              ) : null}
              {pool.targetAmountUSD && (
                <>
                  <div className={styles.infoRow}>
                    <span>Watch Price</span>
                    <span>${pool.targetAmountUSD.toLocaleString()}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Vendor Funding</span>
                    <span>
                      {(() => {
                        const vendorTarget = pool.targetAmountUSD * 0.97;
                        const fees = (pool as any).accumulatedTradingFees || 0;
                        const pct = vendorTarget > 0 ? Math.min((fees / vendorTarget) * 100, 100) : 0;
                        return `${pct.toFixed(1)}% ($${fees.toFixed(0)} / $${vendorTarget.toFixed(0)})`;
                      })()}
                    </span>
                  </div>
                </>
              )}
              <div className={styles.infoRow}>
                <span>Holders</span>
                <span>{liveStats?.holderCount ?? pool.investorCount}</span>
              </div>
              <div className={styles.infoRow}>
                <span>Total Supply</span>
                <span>{(liveStats?.circulatingSupply || pool.totalShares || 0).toLocaleString()}</span>
              </div>
              {pool.escrowPda && (
                <div className={styles.infoRow}>
                  <span>Escrow PDA</span>
                  <button
                    className={styles.mintCopyBtn}
                    onClick={() => copyAddress(pool.escrowPda!, 'Escrow PDA')}
                  >
                    <span className={styles.mintAddress}>
                      {pool.escrowPda.slice(0, 6)}...{pool.escrowPda.slice(-4)}
                    </span>
                    <FaCopy size={10} />
                  </button>
                </div>
              )}
              {pool.meteoraConfigKey && (
                <div className={styles.infoRow}>
                  <span>Config Key</span>
                  <button
                    className={styles.mintCopyBtn}
                    onClick={() => copyAddress(pool.meteoraConfigKey!, 'Config key')}
                  >
                    <span className={styles.mintAddress}>
                      {pool.meteoraConfigKey.slice(0, 6)}...{pool.meteoraConfigKey.slice(-4)}
                    </span>
                    <FaCopy size={10} />
                  </button>
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
                {pool.asset.nftMint && (
                  <div className={styles.nftLinkRow}>
                    <span className={styles.assetFieldLabel}>Backing NFT</span>
                    <div className={styles.nftLinks}>
                      <button
                        className={styles.mintCopyBtn}
                        onClick={() => copyAddress(pool.asset!.nftMint!, 'NFT mint')}
                      >
                        <span className={styles.mintAddress}>
                          {pool.asset.nftMint.slice(0, 6)}...{pool.asset.nftMint.slice(-4)}
                        </span>
                        <FaCopy size={10} />
                      </button>
                      <Link href={`/nft/${pool.asset.nftMint}`} className={styles.tokenLink}>
                        <FaExternalLinkAlt size={10} /> View NFT
                      </Link>
                      <a
                        href={getClusterConfig().explorerUrl(pool.asset.nftMint)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.tokenLink}
                      >
                        <SiSolana size={12} /> Solscan
                      </a>
                    </div>
                  </div>
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
                initialSide={initialTradeSide}
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

            {/* Phase 11: Position P&L (when holding + have cost basis) */}
            {hasPnl && (
              <div className={styles.phase11PnlCard}>
                <div className={styles.phase11PnlLabel}>Unrealized P&L</div>
                <div
                  className={`${styles.phase11PnlValue} ${positionPnlUsd >= 0 ? styles.phase11PnlPositive : styles.phase11PnlNegative}`}
                >
                  {positionPnlUsd >= 0 ? '+' : ''}
                  ${positionPnlUsd.toFixed(2)}
                  <span className={styles.phase11PnlPct}>
                    {' '}
                    ({positionPnlUsd >= 0 ? '+' : ''}
                    {positionPnlPct.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            {/* Phase 11: Self-serve claim button for resold/partial_distributed states */}
            {isClaimEligibleState && walletB58 && (
              <div className={styles.phase11ClaimCard}>
                <h3 className={styles.phase11ClaimTitle}>
                  <FaCheckCircle size={14} /> Claim Distribution
                </h3>
                {claimInfo?.claimed ? (
                  <>
                    <p className={styles.phase11ClaimHelper}>
                      You have already claimed your distribution for this pool.
                    </p>
                    {claimInfo.txSignature && (
                      <a
                        className={styles.phase11ClaimTxLink}
                        href={getClusterConfig().explorerUrl(claimInfo.txSignature)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View burn tx <FaExternalLinkAlt size={9} />
                      </a>
                    )}
                  </>
                ) : claimInfo && claimInfo.claimableAmount > 0 ? (
                  <>
                    <div className={styles.phase11ClaimAmount}>
                      ${claimInfo.claimableAmount.toFixed(2)}
                      <span className={styles.phase11ClaimPct}>
                        {' '}
                        ({claimInfo.ownershipPercent.toFixed(2)}%)
                      </span>
                    </div>
                    <p className={styles.phase11ClaimHelper}>
                      Burns your pool tokens in one tx, then queues a USDC payout via
                      Squads multisig. Bags tokens use 9 decimals.
                    </p>
                    <button
                      className={styles.phase11ClaimBtn}
                      disabled={!canClaim || claiming}
                      onClick={handleClaim}
                    >
                      {claiming
                        ? 'Claiming…'
                        : `Claim $${claimInfo.claimableAmount.toFixed(2)}`}
                    </button>
                  </>
                ) : (
                  <p className={styles.phase11ClaimHelper}>
                    Your wallet is not in the distribution snapshot for this pool.
                  </p>
                )}
              </div>
            )}

            {/* Pool Info (holders, volume) */}
            <div className={styles.poolInfoCard}>
              <h3><FaUsers size={14} /> Token Holders ({liveStats?.holderCount ?? pool.investorCount})</h3>
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
