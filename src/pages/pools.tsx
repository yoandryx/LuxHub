// src/pages/pools.tsx
// Investment Pools - Trading Terminal for Watch Pools
// LuxHub x Bags Collaboration - Blockchain Native Trading View
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  FiSearch,
  FiTrendingUp,
  FiShield,
  FiDollarSign,
  FiActivity,
  FiLock,
  FiZap,
  FiTarget,
} from 'react-icons/fi';
import PoolList from '../components/marketplace/PoolList';
import PoolDetail from '../components/marketplace/PoolDetail';
import WalletGuide from '../components/common/WalletGuide';
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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Green floating particles animation
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
        size: Math.random() * 2.5 + 0.5,
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

        // Draw particle with green color
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 136, ${p.opacity})`;
        ctx.fill();

        // Draw glow effect
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 255, 136, ${p.opacity * 0.2})`;
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
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.1 * (1 - distance / 120)})`;
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

  const handleInvestmentComplete = () => {
    // Could trigger a refresh of the pool list here
  };

  return (
    <>
      <Head>
        <title>Trading Terminal | LuxHub x Bags</title>
        <meta
          name="description"
          content="Blockchain-native trading terminal for luxury watch pools. Fractional ownership, on-chain escrow, and transparent returns."
        />
      </Head>

      <div className={styles.pageContainer}>
        {/* Green Particles Canvas Background */}
        <canvas ref={canvasRef} className={styles.particleCanvas} />

        {/* Terminal Header */}
        <header className={styles.terminalHeader}>
          <div className={styles.terminalBrand}>
            {/* Logo Collaboration: LuxHub x Bags */}
            <div className={styles.logoCollab}>
              <Image
                src="/images/purpleLGG.png"
                alt="LuxHub"
                width={44}
                height={44}
                className={styles.brandLogo}
              />
              <span className={styles.logoX}>×</span>
              <Image
                src="/images/bags-logo.svg"
                alt="Bags"
                width={44}
                height={44}
                className={styles.brandLogo}
              />
            </div>
            <div className={styles.terminalTitle}>
              <h1>WATCH POOLS</h1>
              <span className={styles.terminalSubtitle}>TRADING TERMINAL</span>
            </div>
          </div>

          <div className={styles.terminalStats}>
            <div className={styles.statPill}>
              <span className={styles.statDot} />
              <span className={styles.statLabel}>LIVE</span>
            </div>
            <div className={styles.statPill}>
              <FiTrendingUp />
              <span>97% TO INVESTORS</span>
            </div>
            <div className={styles.statPill}>
              <FiShield />
              <span>3% FEE</span>
            </div>
          </div>

          {/* Wallet Connection */}
          {!wallet.connected && (
            <div className={styles.connectWallet}>
              <WalletGuide compact />
            </div>
          )}
        </header>

        {/* How It Works - Badge Icons */}
        <section className={styles.howItWorks}>
          <div className={styles.stepsContainer}>
            <div className={styles.stepBadge}>
              <div className={styles.badgeIcon}>
                <FiSearch />
              </div>
              <div className={styles.badgeContent}>
                <span className={styles.badgeNumber}>01</span>
                <span className={styles.badgeLabel}>BROWSE</span>
              </div>
            </div>

            <div className={styles.stepConnector} />

            <div className={styles.stepBadge}>
              <div className={styles.badgeIcon}>
                <FiDollarSign />
              </div>
              <div className={styles.badgeContent}>
                <span className={styles.badgeNumber}>02</span>
                <span className={styles.badgeLabel}>INVEST</span>
              </div>
            </div>

            <div className={styles.stepConnector} />

            <div className={styles.stepBadge}>
              <div className={styles.badgeIcon}>
                <FiLock />
              </div>
              <div className={styles.badgeContent}>
                <span className={styles.badgeNumber}>03</span>
                <span className={styles.badgeLabel}>SECURED</span>
              </div>
            </div>

            <div className={styles.stepConnector} />

            <div className={styles.stepBadge}>
              <div className={styles.badgeIcon}>
                <FiZap />
              </div>
              <div className={styles.badgeContent}>
                <span className={styles.badgeNumber}>04</span>
                <span className={styles.badgeLabel}>RETURNS</span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Stats Bar */}
        <div className={styles.quickStats}>
          <div className={styles.quickStat}>
            <FiTarget className={styles.quickStatIcon} />
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>$2.4M+</span>
              <span className={styles.quickStatLabel}>TVL</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FiActivity className={styles.quickStatIcon} />
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>24</span>
              <span className={styles.quickStatLabel}>ACTIVE POOLS</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FiTrendingUp className={styles.quickStatIcon} />
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>+18.5%</span>
              <span className={styles.quickStatLabel}>AVG ROI</span>
            </div>
          </div>
          <div className={styles.quickStat}>
            <FiShield className={styles.quickStatIcon} />
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>100%</span>
              <span className={styles.quickStatLabel}>VERIFIED</span>
            </div>
          </div>
        </div>

        {/* Pool List */}
        <main className={styles.terminalMain}>
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
          <div className={styles.walletModalOverlay} onClick={() => setShowWalletModal(false)}>
            <div className={styles.walletModalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.walletModalClose} onClick={() => setShowWalletModal(false)}>
                ×
              </button>
              <div className={styles.modalHeader}>
                <FiLock className={styles.modalIcon} />
                <h3>CONNECT WALLET</h3>
              </div>
              <p className={styles.walletModalMessage}>
                Connect your Solana wallet to access pool details and invest
              </p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}

        {/* Terminal Footer */}
        <footer className={styles.terminalFooter}>
          <div className={styles.footerLeft}>
            <span className={styles.footerBrand}>LUXHUB × BAGS</span>
            <span className={styles.footerDivider}>|</span>
            <span className={styles.footerNetwork}>
              <span className={styles.networkDot} />
              SOLANA DEVNET
            </span>
          </div>
          <div className={styles.footerRight}>
            <span>ON-CHAIN ESCROW</span>
            <span className={styles.footerDivider}>|</span>
            <span>MULTISIG SECURED</span>
          </div>
        </footer>
      </div>
    </>
  );
};

export default PoolsPage;
