// src/pages/pools.tsx
// Investment Pools - Fractional Luxury Watch Trading
// LuxHub x Bags - Own a piece of the world's finest timepieces
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FiTrendingUp,
  FiActivity,
  FiUsers,
  FiDollarSign,
  FiZap,
  FiLock,
  FiRefreshCw,
  FiClock,
  FiArrowRight,
  FiShield,
  FiPieChart,
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

const STEPS = [
  {
    icon: FiPieChart,
    title: 'Browse Pools',
    desc: 'Find luxury watches at fractional prices',
  },
  {
    icon: FiDollarSign,
    title: 'Buy Shares',
    desc: 'Invest with as little as $50',
  },
  {
    icon: FiShield,
    title: 'Secured Custody',
    desc: 'Assets verified & vaulted by LuxHub',
  },
  {
    icon: FiTrendingUp,
    title: 'Earn Returns',
    desc: 'Trade shares or earn on resale',
  },
];

const PoolsPage: React.FC = () => {
  const wallet = useWallet();
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Real-time platform stats via SWR
  const { stats, isLoading: statsLoading, mutate: refreshStats } = usePlatformStats();
  const { mutate: refreshPools } = usePools();

  // Ambient particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    setSize();

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
      hue: number;
    }> = [];

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.4 + 0.1,
        hue: Math.random() * 30 + 260, // purple range
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 75%, ${p.opacity})`;
        ctx.fill();

        // Soft glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 75%, ${p.opacity * 0.15})`;
        ctx.fill();
      });

      // Faint connection lines
      particles.forEach((p1, i) => {
        particles.slice(i + 1).forEach((p2) => {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < 150) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(200, 161, 255, ${0.06 * (1 - distance / 150)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();
    window.addEventListener('resize', setSize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', setSize);
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
    setTimeout(() => setIsRefreshing(false), 600);
  }, [refreshStats, refreshPools]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toLocaleString()}`;
  };

  return (
    <>
      <Head>
        <title>LuxHub Pools | Fractional Luxury Watch Trading</title>
        <meta
          name="description"
          content="Own a piece of the world's finest timepieces. Fractional ownership, on-chain escrow, and transparent returns on Solana."
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className={`${styles.page} ${mounted ? styles.mounted : ''}`}>
        {/* Ambient Particles */}
        <canvas ref={canvasRef} className={styles.particlesCanvas} />

        {/* Gradient Orbs Background */}
        <div className={styles.bgOrbs}>
          <div className={styles.orb1} />
          <div className={styles.orb2} />
          <div className={styles.orb3} />
        </div>

        {/* ===== HEADER BAR ===== */}
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <div className={styles.headerLeft}>
              <div className={styles.brand}>
                <Image src="/images/purpleLGG.png" alt="LuxHub" width={32} height={32} />
                <div className={styles.brandText}>
                  <span className={styles.brandName}>LuxHub</span>
                  <span className={styles.brandLabel}>Pools</span>
                </div>
              </div>
              <div className={styles.networkPill}>
                <span className={styles.networkDot} />
                Solana
                <span className={styles.networkTag}>Devnet</span>
              </div>
            </div>

            <div className={styles.headerCenter}>
              <div className={styles.ticker}>
                <div className={styles.tickerItem}>
                  <span className={styles.tickerLabel}>TVL</span>
                  <span className={styles.tickerValue}>
                    {statsLoading ? '---' : stats?.tvlFormatted || '$0'}
                  </span>
                </div>
                <div className={styles.tickerSep} />
                <div className={styles.tickerItem}>
                  <span className={styles.tickerLabel}>Pools</span>
                  <span className={styles.tickerValue}>
                    {statsLoading ? '--' : stats?.activePools || 0}
                  </span>
                </div>
                <div className={styles.tickerSep} />
                <div className={styles.tickerItem}>
                  <span className={styles.tickerLabel}>Avg ROI</span>
                  <span className={`${styles.tickerValue} ${styles.tickerPositive}`}>
                    {statsLoading ? '---' : stats?.avgROIFormatted || '+0%'}
                  </span>
                </div>
                <div className={styles.tickerSep} />
                <div className={styles.tickerItem}>
                  <span className={styles.tickerLabel}>Volume</span>
                  <span className={styles.tickerValue}>
                    {statsLoading ? '---' : stats?.totalVolumeFormatted || '$0'}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.headerRight}>
              <button
                className={`${styles.refreshBtn} ${isRefreshing ? styles.spinning : ''}`}
                onClick={handleRefresh}
                title="Refresh data"
              >
                <FiRefreshCw />
              </button>
              {wallet.connected ? (
                <div className={styles.walletPill}>
                  <span className={styles.walletDot} />
                  <span className={styles.walletAddr}>
                    {wallet.publicKey?.toBase58().slice(0, 4)}...
                    {wallet.publicKey?.toBase58().slice(-4)}
                  </span>
                </div>
              ) : (
                <div className={styles.connectWallet}>
                  <WalletGuide compact />
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ===== HERO SECTION ===== */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroBadge}>
              <FiZap />
              <span>Powered by Solana</span>
            </div>
            <h1 className={styles.heroTitle}>
              Own a Piece of
              <br />
              <span className={styles.heroAccent}>Luxury Timepieces</span>
            </h1>
            <p className={styles.heroSub}>
              Fractional ownership of authenticated luxury watches. Invest from $50, trade anytime,
              earn on resale.
            </p>
          </div>

          {/* Stats Cards */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statCardDelay1}`}>
              <div className={styles.statIcon}>
                <FiDollarSign />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>
                  {statsLoading ? '...' : formatNumber(parseFloat(String(stats?.tvl || '0')))}
                </span>
                <span className={styles.statLabel}>Total Value Locked</span>
              </div>
              <div className={`${styles.statDelta} ${styles.positive}`}>
                <FiTrendingUp /> +12.4%
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statCardDelay2}`}>
              <div className={styles.statIcon}>
                <FiActivity />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>
                  {statsLoading ? '...' : stats?.activePools || 0}
                </span>
                <span className={styles.statLabel}>Active Pools</span>
              </div>
              <div className={`${styles.statDelta} ${styles.positive}`}>
                <FiTrendingUp /> +3
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statCardDelay3}`}>
              <div className={styles.statIcon}>
                <FiUsers />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>
                  {statsLoading ? '...' : stats?.totalInvestors || 0}
                </span>
                <span className={styles.statLabel}>Investors</span>
              </div>
              <div className={`${styles.statDelta} ${styles.positive}`}>
                <FiTrendingUp /> +8.2%
              </div>
            </div>

            <div className={`${styles.statCard} ${styles.statCardDelay4}`}>
              <div className={styles.statIcon}>
                <FiZap />
              </div>
              <div className={styles.statInfo}>
                <span className={`${styles.statValue} ${styles.statValueAccent}`}>
                  {statsLoading ? '...' : stats?.avgROIFormatted || '+0%'}
                </span>
                <span className={styles.statLabel}>Avg Returns</span>
              </div>
              <div className={styles.statTopBadge}>TOP</div>
            </div>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section className={styles.howItWorks}>
          <div className={styles.stepsRow}>
            {STEPS.map((step, i) => (
              <React.Fragment key={i}>
                <div className={styles.step} style={{ animationDelay: `${i * 0.1 + 0.3}s` }}>
                  <div className={styles.stepIcon}>
                    <step.icon />
                  </div>
                  <div className={styles.stepText}>
                    <span className={styles.stepNum}>0{i + 1}</span>
                    <strong>{step.title}</strong>
                    <span className={styles.stepDesc}>{step.desc}</span>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={styles.stepArrow}>
                    <FiArrowRight />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* ===== MAIN POOL TRADING AREA ===== */}
        <main className={styles.main}>
          <div className={styles.mainHeader}>
            <div className={styles.mainHeaderLeft}>
              <h2 className={styles.sectionTitle}>Watch Pools</h2>
              <div className={styles.liveBadge}>
                <span className={styles.liveDot} />
                Live
              </div>
            </div>
          </div>

          <PoolList onPoolSelect={handlePoolSelect} />
        </main>

        {/* ===== POOL DETAIL MODAL ===== */}
        {selectedPool && (
          <PoolDetail
            pool={selectedPool}
            onClose={handleCloseDetail}
            onInvestmentComplete={handleInvestmentComplete}
          />
        )}

        {/* ===== WALLET MODAL ===== */}
        {showWalletModal && (
          <div className={styles.modalOverlay} onClick={() => setShowWalletModal(false)}>
            <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowWalletModal(false)}>
                &times;
              </button>
              <div className={styles.modalIconWrap}>
                <FiLock />
              </div>
              <h3 className={styles.modalTitle}>Connect Wallet</h3>
              <p className={styles.modalDesc}>
                Connect your Solana wallet to browse pool details and start investing.
              </p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}

        {/* ===== FOOTER ===== */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div className={styles.footerLeft}>
              <span className={styles.footerBrand}>LuxHub &times; Bags</span>
              <span className={styles.footerVer}>v2.0</span>
            </div>
            <div className={styles.footerCenter}>
              <span className={styles.footerItem}>
                <FiLock /> On-Chain Escrow
              </span>
              <span className={styles.footerSep} />
              <span className={styles.footerItem}>
                <FiShield /> Multisig Secured
              </span>
              <span className={styles.footerSep} />
              <span className={styles.footerItem}>97% to Investors</span>
            </div>
            <div className={styles.footerRight}>
              <FiClock />
              <span className={styles.footerTime}>
                {new Date().toLocaleTimeString('en-US', { hour12: false })}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default PoolsPage;
