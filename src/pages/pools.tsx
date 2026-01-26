// src/pages/pools.tsx
// Investment Pools - Trading Terminal for Watch Pools
// LuxHub x Bags Collaboration - Blockchain Native Trading View
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FiSearch,
  FiTrendingUp,
  FiTrendingDown,
  FiActivity,
  FiLock,
  FiZap,
  FiTarget,
  FiUsers,
  FiDollarSign,
  FiClock,
  FiGrid,
  FiList,
  FiFilter,
  FiRefreshCw,
  FiExternalLink,
  FiChevronDown,
} from 'react-icons/fi';
import PoolList from '../components/marketplace/PoolList';
import PoolDetail from '../components/marketplace/PoolDetail';
import WalletGuide from '../components/common/WalletGuide';
import { usePlatformStats, usePools } from '../hooks/usePools';
import styles from '../styles/Pools.module.css';

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
}

const PoolsPage: React.FC = () => {
  const wallet = useWallet();
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Real-time platform stats via SWR
  const { stats, isLoading: statsLoading, mutate: refreshStats } = usePlatformStats();
  const { mutate: refreshPools } = usePools();

  // Purple floating particles animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
    }> = [];

    // Create 60 particles
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 1.5 + 0.3,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;

        // Wrap around edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        // Draw particle with purple color
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 161, 255, ${p.opacity})`;
        ctx.fill();

        // Draw glow effect
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 161, 255, ${p.opacity * 0.2})`;
        ctx.fill();
      });

      // Draw connecting lines between nearby particles
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(200, 161, 255, ${0.1 * (1 - distance / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handlePoolSelect = (pool: Pool) => {
    if (!wallet.connected) {
      setShowWalletModal(true);
      return;
    }
    setSelectedPool(pool);
  };

  const handleCloseDetail = () => {
    setSelectedPool(null);
  };

  const handleInvestmentComplete = useCallback(() => {
    refreshStats();
    refreshPools();
  }, [refreshStats, refreshPools]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshStats(), refreshPools()]);
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshStats, refreshPools]);

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  return (
    <>
      <Head>
        <title>LUXHUB TERMINAL | Watch Pool Trading</title>
        <meta
          name="description"
          content="Blockchain-native trading terminal for luxury watch pools. Fractional ownership, on-chain escrow, and transparent returns."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={styles.terminal}>
        {/* Purple Particles Background */}
        <canvas ref={canvasRef} className={styles.particlesCanvas} />

        {/* Terminal Top Bar */}
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <div className={styles.terminalLogo}>
              <Image src="/images/purpleLGG.png" alt="LuxHub" width={28} height={28} />
              <span className={styles.logoText}>LUXHUB</span>
              <span className={styles.logoDivider}>//</span>
              <span className={styles.logoSubtext}>TERMINAL</span>
            </div>
            <div className={styles.networkBadge}>
              <span className={styles.networkDot} />
              <span>SOLANA</span>
              <span className={styles.networkType}>DEVNET</span>
            </div>
          </div>

          <div className={styles.topBarCenter}>
            <div className={styles.tickerStrip}>
              <div className={styles.tickerItem}>
                <span className={styles.tickerLabel}>TVL</span>
                <span className={styles.tickerValue}>
                  {statsLoading ? '---' : stats?.tvlFormatted || '$0'}
                </span>
              </div>
              <div className={styles.tickerDivider} />
              <div className={styles.tickerItem}>
                <span className={styles.tickerLabel}>POOLS</span>
                <span className={styles.tickerValue}>
                  {statsLoading ? '--' : stats?.activePools || 0}
                </span>
              </div>
              <div className={styles.tickerDivider} />
              <div className={styles.tickerItem}>
                <span className={styles.tickerLabel}>AVG ROI</span>
                <span className={`${styles.tickerValue} ${styles.positive}`}>
                  {statsLoading ? '---' : stats?.avgROIFormatted || '+0%'}
                </span>
              </div>
              <div className={styles.tickerDivider} />
              <div className={styles.tickerItem}>
                <span className={styles.tickerLabel}>24H VOL</span>
                <span className={styles.tickerValue}>
                  {statsLoading ? '---' : stats?.totalVolumeFormatted || '$0'}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.topBarRight}>
            <button
              className={`${styles.refreshBtn} ${isRefreshing ? styles.spinning : ''}`}
              onClick={handleRefresh}
              title="Refresh data"
            >
              <FiRefreshCw />
            </button>
            {wallet.connected ? (
              <div className={styles.walletConnected}>
                <span className={styles.walletDot} />
                <span className={styles.walletAddress}>
                  {wallet.publicKey?.toBase58().slice(0, 4)}...
                  {wallet.publicKey?.toBase58().slice(-4)}
                </span>
              </div>
            ) : (
              <div className={styles.connectBtn}>
                <WalletGuide compact />
              </div>
            )}
          </div>
        </header>

        {/* Quick Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <FiTarget />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>
                {statsLoading ? '...' : formatNumber(parseFloat(String(stats?.tvl || '0')))}
              </span>
              <span className={styles.statLabel}>TOTAL VALUE LOCKED</span>
            </div>
            <div className={`${styles.statChange} ${styles.positive}`}>
              <FiTrendingUp />
              +12.4%
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <FiActivity />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>
                {statsLoading ? '...' : stats?.activePools || 0}
              </span>
              <span className={styles.statLabel}>ACTIVE POOLS</span>
            </div>
            <div className={`${styles.statChange} ${styles.positive}`}>
              <FiTrendingUp />
              +3
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <FiUsers />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>
                {statsLoading ? '...' : stats?.totalInvestors || 0}
              </span>
              <span className={styles.statLabel}>INVESTORS</span>
            </div>
            <div className={`${styles.statChange} ${styles.positive}`}>
              <FiTrendingUp />
              +8.2%
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <FiDollarSign />
            </div>
            <div className={styles.statContent}>
              <span className={styles.statValue}>
                {statsLoading ? '...' : stats?.totalVolumeFormatted || '$0'}
              </span>
              <span className={styles.statLabel}>TRADING VOLUME</span>
            </div>
            <div className={`${styles.statChange} ${styles.positive}`}>
              <FiTrendingUp />
              +24.1%
            </div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statIcon}>
              <FiZap />
            </div>
            <div className={styles.statContent}>
              <span className={`${styles.statValue} ${styles.highlight}`}>
                {statsLoading ? '...' : stats?.avgROIFormatted || '+0%'}
              </span>
              <span className={styles.statLabel}>AVG RETURNS</span>
            </div>
            <div className={styles.statBadge}>TOP</div>
          </div>
        </div>

        {/* How It Works - Compact Terminal Style */}
        <div className={styles.processBar}>
          <div className={styles.processStep}>
            <span className={styles.processNum}>01</span>
            <FiSearch className={styles.processIcon} />
            <span className={styles.processLabel}>BROWSE</span>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <span className={styles.processNum}>02</span>
            <FiDollarSign className={styles.processIcon} />
            <span className={styles.processLabel}>INVEST</span>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <span className={styles.processNum}>03</span>
            <FiLock className={styles.processIcon} />
            <span className={styles.processLabel}>CUSTODY</span>
          </div>
          <div className={styles.processArrow}>→</div>
          <div className={styles.processStep}>
            <span className={styles.processNum}>04</span>
            <FiZap className={styles.processIcon} />
            <span className={styles.processLabel}>RETURNS</span>
          </div>
        </div>

        {/* Main Trading Area */}
        <main className={styles.mainContent}>
          <div className={styles.contentHeader}>
            <div className={styles.headerLeft}>
              <h1 className={styles.sectionTitle}>
                <span className={styles.titleAccent}>//</span> WATCH POOLS
              </h1>
              <span className={styles.liveIndicator}>
                <span className={styles.liveDot} />
                LIVE
              </span>
            </div>

            <div className={styles.headerControls}>
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                  onClick={() => setViewMode('grid')}
                >
                  <FiGrid />
                </button>
                <button
                  className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  <FiList />
                </button>
              </div>
            </div>
          </div>

          {/* Pool List Component */}
          <PoolList onPoolSelect={handlePoolSelect} />
        </main>

        {/* Pool Detail Modal */}
        {selectedPool && (
          <PoolDetail
            pool={selectedPool}
            onClose={handleCloseDetail}
            onInvestmentComplete={handleInvestmentComplete}
          />
        )}

        {/* Wallet Connection Modal */}
        {showWalletModal && (
          <div className={styles.modalOverlay} onClick={() => setShowWalletModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowWalletModal(false)}>
                ×
              </button>
              <div className={styles.modalHeader}>
                <FiLock className={styles.modalIcon} />
                <h3>CONNECT WALLET</h3>
              </div>
              <p className={styles.modalText}>
                Connect your Solana wallet to access pool details and invest
              </p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}

        {/* Terminal Footer */}
        <footer className={styles.terminalFooter}>
          <div className={styles.footerLeft}>
            <span className={styles.footerLogo}>LUXHUB × BAGS</span>
            <span className={styles.footerVersion}>v2.0.0</span>
          </div>
          <div className={styles.footerCenter}>
            <span className={styles.footerLink}>
              <FiLock /> ON-CHAIN ESCROW
            </span>
            <span className={styles.footerDivider}>|</span>
            <span className={styles.footerLink}>
              <FiUsers /> MULTISIG SECURED
            </span>
            <span className={styles.footerDivider}>|</span>
            <span className={styles.footerLink}>97% TO INVESTORS</span>
          </div>
          <div className={styles.footerRight}>
            <span className={styles.footerTime}>
              <FiClock />
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </footer>
      </div>
    </>
  );
};

export default PoolsPage;
