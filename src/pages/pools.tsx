// src/pages/pools.tsx
// Investment Pools Page - Fractional ownership of luxury watches
import React, { useState } from 'react';
import Head from 'next/head';
import { useWallet } from '@solana/wallet-adapter-react';
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

  const handlePoolSelect = (pool: Pool) => {
    // If not connected, prompt to connect first
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
    // For now, the detail modal handles its own refresh
  };

  return (
    <>
      <Head>
        <title>Investment Pools | LuxHub</title>
        <meta
          name="description"
          content="Invest in fractional ownership of authenticated luxury watches. Join investment pools and earn returns when assets are resold."
        />
      </Head>

      <div className={styles.pageContainer}>
        {/* Wallet Connection Banner */}
        {!wallet.connected && (
          <div className={styles.walletBanner}>
            <div className={styles.walletBannerContent}>
              <span>Connect your wallet to invest in pools</span>
              <WalletGuide compact />
            </div>
          </div>
        )}

        {/* Hero Section */}
        <div className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Investment Pools</h1>
            <p className={styles.heroSubtitle}>
              Own a piece of authenticated luxury timepieces through fractional ownership. Invest in
              pools, and earn returns when assets are resold.
            </p>
            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>97%</span>
                <span className={styles.heroStatLabel}>To Investors</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>3%</span>
                <span className={styles.heroStatLabel}>Platform Fee</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>100%</span>
                <span className={styles.heroStatLabel}>Authenticated</span>
              </div>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div className={styles.howItWorks}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <h3>Browse Pools</h3>
              <p>
                Explore open investment pools for authenticated luxury watches from verified
                vendors.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3>Invest</h3>
              <p>
                Purchase shares in pools that match your investment goals. Minimum investments vary
                by pool.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3>Watch Secured</h3>
              <p>
                Once funded, the vendor ships the watch to LuxHub for secure custody and
                authentication.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepNumber}>4</div>
              <h3>Earn Returns</h3>
              <p>
                When the watch is resold, 97% of proceeds are distributed to investors
                proportionally.
              </p>
            </div>
          </div>
        </div>

        {/* Pool List */}
        <PoolList onPoolSelect={handlePoolSelect} />

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
              <p className={styles.walletModalMessage}>
                Connect your wallet to view pool details and invest
              </p>
              <WalletGuide onConnected={() => setShowWalletModal(false)} showSteps={false} />
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default PoolsPage;
