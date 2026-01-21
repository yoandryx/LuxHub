// src/pages/bags.tsx
// Bags Integration Hub - Showcasing LuxHub x Bags Partnership
import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import Navbar from '../components/common/Navbar';
import BagsPartnerDashboard from '../components/admin/BagsPartnerDashboard';
import styles from '../styles/BagsPage.module.css';

interface PoolStats {
  totalPools: number;
  tokenizedPools: number;
  totalVolume: number;
  totalFees: number;
}

const BagsPage: React.FC = () => {
  const { connected, publicKey } = useWallet();
  const [activeSection, setActiveSection] = useState<'overview' | 'tokenomics' | 'dashboard'>(
    'overview'
  );
  const [stats, setStats] = useState<PoolStats>({
    totalPools: 0,
    tokenizedPools: 0,
    totalVolume: 0,
    totalFees: 0,
  });

  useEffect(() => {
    // Fetch pool stats
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/pool/list');
        const data = await response.json();
        if (response.ok && data.pools) {
          const tokenized = data.pools.filter((p: any) => p.bagsTokenMint).length;
          setStats({
            totalPools: data.pools.length,
            tokenizedPools: tokenized,
            totalVolume: 0, // Would come from Bags API
            totalFees: 0,
          });
        }
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };

    fetchStats();
  }, []);

  return (
    <>
      <Head>
        <title>Bags Integration | LuxHub</title>
        <meta
          name="description"
          content="LuxHub x Bags - Powering fractional luxury asset trading on Solana"
        />
      </Head>

      <Navbar />

      <main className={styles.main}>
        {/* Hero Section */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.partnerLogos}>
              <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.luxhubLogo} />
              <span className={styles.xMark}>×</span>
              <img src="/images/bags-icon.png" alt="Bags" className={styles.bagsLogoLarge} />
            </div>
            <h1>Fractional Luxury Trading</h1>
            <p>
              Own a piece of authenticated luxury assets. Trade pool shares on the secondary market.
              Powered by Bags infrastructure on Solana.
            </p>
            <div className={styles.heroButtons}>
              <Link href="/pools" className={styles.primaryBtn}>
                Explore Pools
              </Link>
              <a
                href="https://bags.fm"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.secondaryBtn}
              >
                Learn About Bags
              </a>
            </div>
          </div>

          {/* Stats Ticker */}
          <div className={styles.statsTicker}>
            <div className={styles.tickerItem}>
              <span className={styles.tickerValue}>{stats.totalPools}</span>
              <span className={styles.tickerLabel}>Total Pools</span>
            </div>
            <div className={styles.tickerItem}>
              <span className={styles.tickerValue}>{stats.tokenizedPools}</span>
              <span className={styles.tickerLabel}>Tokenized via Bags</span>
            </div>
            <div className={styles.tickerItem}>
              <span className={styles.tickerValue}>3%</span>
              <span className={styles.tickerLabel}>Fee per Trade</span>
            </div>
            <div className={styles.tickerItem}>
              <span className={styles.tickerValue}>∞</span>
              <span className={styles.tickerLabel}>Liquidity</span>
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className={styles.navTabs}>
          <button
            className={`${styles.navTab} ${activeSection === 'overview' ? styles.activeNavTab : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            How It Works
          </button>
          <button
            className={`${styles.navTab} ${activeSection === 'tokenomics' ? styles.activeNavTab : ''}`}
            onClick={() => setActiveSection('tokenomics')}
          >
            Tokenomics
          </button>
          <button
            className={`${styles.navTab} ${activeSection === 'dashboard' ? styles.activeNavTab : ''}`}
            onClick={() => setActiveSection('dashboard')}
          >
            Partner Dashboard
          </button>
        </div>

        {/* Content Sections */}
        <div className={styles.content}>
          {activeSection === 'overview' && (
            <section className={styles.overviewSection}>
              <h2 className={styles.sectionTitle}>How Bags Powers LuxHub</h2>
              <p className={styles.sectionIntro}>
                Bags provides the infrastructure for tokenizing luxury asset pool shares, enabling
                secondary market trading with automatic fee distribution.
              </p>

              {/* Integration Flow */}
              <div className={styles.flowDiagram}>
                <div className={styles.flowStep}>
                  <div className={styles.flowIcon}>🏷️</div>
                  <h3>1. Asset Verification</h3>
                  <p>
                    Luxury asset authenticated and verified by LuxHub. NFT certificate minted on
                    Solana.
                  </p>
                </div>
                <div className={styles.flowArrow}>→</div>
                <div className={styles.flowStep}>
                  <div className={styles.flowIcon}>🪙</div>
                  <h3>2. Token Launch</h3>
                  <p>
                    Pool shares minted as SPL tokens via <strong>Bags Token Launch API</strong>.
                    Fixed supply = total shares.
                  </p>
                </div>
                <div className={styles.flowArrow}>→</div>
                <div className={styles.flowStep}>
                  <div className={styles.flowIcon}>💱</div>
                  <h3>3. Secondary Trading</h3>
                  <p>
                    Investors buy/sell shares on open market via <strong>Bags Trade API</strong>.
                    Instant liquidity.
                  </p>
                </div>
                <div className={styles.flowArrow}>→</div>
                <div className={styles.flowStep}>
                  <div className={styles.flowIcon}>💸</div>
                  <h3>4. Auto Fee Routing</h3>
                  <p>
                    3% fee auto-distributed to LuxHub treasury via{' '}
                    <strong>Bags Fee Share API</strong>.
                  </p>
                </div>
              </div>

              {/* API Cards */}
              <h3 className={styles.subHeading}>Bags APIs We Use</h3>
              <div className={styles.apiGrid}>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>POST</span>
                    <code>/token/create-token-info</code>
                  </div>
                  <p>Creates token metadata with asset details, pool info, and LuxHub branding.</p>
                  <span className={styles.apiUse}>Used when: Admin creates pool token</span>
                </div>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>POST</span>
                    <code>/token/create-token-launch-transaction</code>
                  </div>
                  <p>Mints SPL tokens representing fractional ownership shares.</p>
                  <span className={styles.apiUse}>Used when: Finalizing pool tokenization</span>
                </div>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>POST</span>
                    <code>/fee-share/create-fee-share-config</code>
                  </div>
                  <p>Configures automatic 3% fee routing to LuxHub treasury.</p>
                  <span className={styles.apiUse}>Used when: Enabling secondary trading</span>
                </div>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>GET</span>
                    <code>/trade/quote</code>
                  </div>
                  <p>Gets real-time price quotes for buying/selling pool shares.</p>
                  <span className={styles.apiUse}>Used when: User initiates trade</span>
                </div>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>POST</span>
                    <code>/trade/swap</code>
                  </div>
                  <p>Builds and returns swap transaction for user signing.</p>
                  <span className={styles.apiUse}>Used when: Executing trade</span>
                </div>
                <div className={styles.apiCard}>
                  <div className={styles.apiHeader}>
                    <span className={styles.apiMethod}>GET</span>
                    <code>/partner/stats</code>
                  </div>
                  <p>Retrieves earnings, transaction counts, and claimable fees.</p>
                  <span className={styles.apiUse}>Used when: Viewing partner dashboard</span>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'tokenomics' && (
            <section className={styles.tokenomicsSection}>
              <h2 className={styles.sectionTitle}>RWA Tokenomics Model</h2>
              <p className={styles.sectionIntro}>
                Each pool creates a fixed-supply token representing fractional ownership of a
                verified luxury asset. This is Real World Asset (RWA) tokenization with built-in
                liquidity.
              </p>

              {/* Tokenomics Diagram */}
              <div className={styles.tokenomicsCard}>
                <h3>Example: $100,000 Rolex Daytona Pool</h3>
                <div className={styles.tokenomicsGrid}>
                  <div className={styles.tokenomicsItem}>
                    <span className={styles.tokenLabel}>Total Supply</span>
                    <span className={styles.tokenValue}>1,000 Shares</span>
                    <span className={styles.tokenNote}>Fixed, non-inflationary</span>
                  </div>
                  <div className={styles.tokenomicsItem}>
                    <span className={styles.tokenLabel}>Initial Price</span>
                    <span className={styles.tokenValue}>$100 / Share</span>
                    <span className={styles.tokenNote}>Asset value ÷ total shares</span>
                  </div>
                  <div className={styles.tokenomicsItem}>
                    <span className={styles.tokenLabel}>Token Symbol</span>
                    <span className={styles.tokenValue}>LUX-ABC123</span>
                    <span className={styles.tokenNote}>Unique per pool</span>
                  </div>
                  <div className={styles.tokenomicsItem}>
                    <span className={styles.tokenLabel}>Trade Fee</span>
                    <span className={styles.tokenValue}>3%</span>
                    <span className={styles.tokenNote}>Auto to LuxHub treasury</span>
                  </div>
                </div>
              </div>

              {/* Price Discovery */}
              <div className={styles.priceSection}>
                <h3>Price Discovery</h3>
                <div className={styles.priceFlow}>
                  <div className={styles.priceBox}>
                    <h4>Initial Price</h4>
                    <p>Set by asset valuation at pool creation</p>
                    <span className={styles.priceFormula}>Asset Value ÷ Total Shares</span>
                  </div>
                  <div className={styles.priceArrow}>→</div>
                  <div className={styles.priceBox}>
                    <h4>Market Price</h4>
                    <p>Determined by supply/demand on secondary market</p>
                    <span className={styles.priceFormula}>Bags AMM / Order Book</span>
                  </div>
                  <div className={styles.priceArrow}>→</div>
                  <div className={styles.priceBox}>
                    <h4>Exit Price</h4>
                    <p>When asset sells, proportional distribution to holders</p>
                    <span className={styles.priceFormula}>Sale Price × Ownership %</span>
                  </div>
                </div>
              </div>

              {/* Why Fixed Supply */}
              <div className={styles.fixedSupplySection}>
                <h3>Why Fixed Supply Matters</h3>
                <div className={styles.benefitGrid}>
                  <div className={styles.benefitCard}>
                    <div className={styles.benefitIcon}>🔒</div>
                    <h4>Asset-Backed Value</h4>
                    <p>
                      Each token represents a real, verifiable fraction of a physical luxury asset.
                    </p>
                  </div>
                  <div className={styles.benefitCard}>
                    <div className={styles.benefitIcon}>📊</div>
                    <h4>No Dilution</h4>
                    <p>Supply cannot be inflated. Your ownership percentage is permanent.</p>
                  </div>
                  <div className={styles.benefitCard}>
                    <div className={styles.benefitIcon}>⚖️</div>
                    <h4>Fair Distribution</h4>
                    <p>
                      When the asset sells, proceeds are distributed proportionally to all token
                      holders.
                    </p>
                  </div>
                  <div className={styles.benefitCard}>
                    <div className={styles.benefitIcon}>🌊</div>
                    <h4>Liquid Exit</h4>
                    <p>
                      Don't wait for asset sale - trade your shares anytime on the secondary market.
                    </p>
                  </div>
                </div>
              </div>

              {/* Decentralization */}
              <div className={styles.decentralSection}>
                <h3>Decentralized Architecture</h3>
                <p>
                  LuxHub leverages Solana's decentralized infrastructure for trustless operations:
                </p>
                <div className={styles.decentGrid}>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Asset Provenance</span>
                    <span className={styles.decentValue}>On-chain NFT Certificate</span>
                  </div>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Pool Shares</span>
                    <span className={styles.decentValue}>SPL Tokens (via Bags)</span>
                  </div>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Treasury</span>
                    <span className={styles.decentValue}>Squads Multisig</span>
                  </div>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Trading</span>
                    <span className={styles.decentValue}>Bags AMM/DEX</span>
                  </div>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Fee Distribution</span>
                    <span className={styles.decentValue}>Bags Fee Share (Automatic)</span>
                  </div>
                  <div className={styles.decentItem}>
                    <span className={styles.decentLabel}>Wallet</span>
                    <span className={styles.decentValue}>Self-custody (Phantom, Backpack)</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === 'dashboard' && (
            <section className={styles.dashboardSection}>
              <BagsPartnerDashboard />
            </section>
          )}
        </div>

        {/* CTA Section */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaContent}>
            <h2 className={styles.sectionTitle}>Ready to Own Luxury?</h2>
            <p>Start investing in fractional luxury assets powered by Bags.</p>
            <div className={styles.ctaButtons}>
              <Link href="/pools" className={styles.ctaPrimary}>
                Browse Pools
              </Link>
              {!connected && <button className={styles.ctaSecondary}>Connect Wallet</button>}
            </div>
          </div>
        </section>

        {/* Footer Attribution */}
        <footer className={styles.footer}>
          <div className={styles.footerContent}>
            <p>Secondary market trading powered by</p>
            <a href="https://bags.fm" target="_blank" rel="noopener noreferrer">
              <img src="/images/bags-logo.svg" alt="Bags" className={styles.footerLogo} />
            </a>
          </div>
        </footer>
      </main>
    </>
  );
};

export default BagsPage;
