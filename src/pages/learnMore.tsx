import React from 'react';
import styles from '../styles/LearnMore.module.css';
import {
  FaShieldAlt,
  FaGem,
  FaWallet,
  FaUsers,
  FaArrowRight,
  FaLock,
  FaSyncAlt,
  FaChartLine,
  FaBox,
  FaCheckCircle,
  FaGlobe,
} from 'react-icons/fa';
import Link from 'next/link';

const LearnMorePage: React.FC = () => {
  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <span className={styles.badge}>Decentralized Luxury Marketplace</span>
          <h1 className={styles.heroTitle}>Welcome to LuxHub</h1>
          <p className={styles.heroSubtitle}>
            The premier Web3 marketplace for authenticated luxury assets. NFT-backed watches,
            jewelry, and collectibles with verified provenance, secure escrow, and fractional
            ownership.
          </p>
          <div className={styles.heroActions}>
            <Link href="/watchMarket" className={styles.primaryBtn}>
              Explore Marketplace <FaArrowRight />
            </Link>
            <Link href="/sellerDashboard" className={styles.secondaryBtn}>
              Start Selling
            </Link>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Why LuxHub?</h2>
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FaShieldAlt />
            </div>
            <h3>Verified Authenticity</h3>
            <p>
              Every NFT is admin-verified before minting. Zero counterfeit risk with on-chain
              provenance records.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FaLock />
            </div>
            <h3>Secure Escrow</h3>
            <p>
              Funds and NFTs held in smart contract vaults. Protected by Squads Protocol multisig
              security.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FaUsers />
            </div>
            <h3>Fractional Ownership</h3>
            <p>
              Own shares of high-value assets through investment pools. Democratizing luxury
              collectibles.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <FaGlobe />
            </div>
            <h3>Global Marketplace</h3>
            <p>
              Borderless trading on Solana. Fast, low-cost transactions with worldwide
              accessibility.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>How It Works</h2>
        <div className={styles.stepsContainer}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>01</div>
            <div className={styles.stepContent}>
              <h3>Verification & Minting</h3>
              <p>
                Vendors submit asset details for review. Admins verify authenticity, then mint an
                NFT tied to the physical item with full metadata stored on IPFS.
              </p>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>02</div>
            <div className={styles.stepContent}>
              <h3>Escrow Protection</h3>
              <p>
                NFTs are held in on-chain escrow vaults. Buyers can make offers or purchase at
                listing price. Funds are secured until delivery is confirmed.
              </p>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>03</div>
            <div className={styles.stepContent}>
              <h3>Secure Transfer</h3>
              <p>
                After admin verifies delivery, Squads multisig executes the transfer: NFT goes to
                buyer, funds (97%) to seller, and 3% royalty to treasury.
              </p>
            </div>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>04</div>
            <div className={styles.stepContent}>
              <h3>Immutable Provenance</h3>
              <p>
                Ownership history and all transactions are recorded on-chain forever. Every future
                sale builds upon verified provenance.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Marketplace Features */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Marketplace Features</h2>
        <div className={styles.featuresListGrid}>
          <div className={styles.featureListCard}>
            <h3>
              <FaGem /> Direct Sales
            </h3>
            <ul>
              <li>Fixed price listings or accepting offers</li>
              <li>Counter-offer negotiations</li>
              <li>Instant purchase option</li>
              <li>Price updates via admin approval</li>
            </ul>
          </div>

          <div className={styles.featureListCard}>
            <h3>
              <FaChartLine /> Fractional Pools
            </h3>
            <ul>
              <li>Buy shares in high-value assets</li>
              <li>Pool status tracking (open to distributed)</li>
              <li>Automatic profit distribution</li>
              <li>Convert escrows to pools</li>
            </ul>
          </div>

          <div className={styles.featureListCard}>
            <h3>
              <FaBox /> Escrow System
            </h3>
            <ul>
              <li>Shipment tracking integration</li>
              <li>Admin delivery verification</li>
              <li>Multisig-protected releases</li>
              <li>Dispute resolution support</li>
            </ul>
          </div>

          <div className={styles.featureListCard}>
            <h3>
              <FaWallet /> Wallet Integration
            </h3>
            <ul>
              <li>Phantom, Solflare, Backpack</li>
              <li>Mobile wallet support</li>
              <li>Session management</li>
              <li>Secure transaction signing</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Built on Solana</h2>
        <div className={styles.techContainer}>
          <div className={styles.techCard}>
            <h4>Frontend</h4>
            <p>Next.js 14, React 18, TypeScript, CSS Modules, Framer Motion, Three.js</p>
          </div>
          <div className={styles.techCard}>
            <h4>Blockchain</h4>
            <p>Solana, Anchor Framework, Metaplex mpl-core, Squads Protocol v4</p>
          </div>
          <div className={styles.techCard}>
            <h4>Storage</h4>
            <p>MongoDB, Pinata/IPFS for metadata, Helius RPC infrastructure</p>
          </div>
          <div className={styles.techCard}>
            <h4>Security</h4>
            <p>Multisig vaults, Admin-gated minting, On-chain escrow PDAs</p>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Roadmap</h2>
        <div className={styles.roadmapContainer}>
          <div className={`${styles.roadmapCard} ${styles.complete}`}>
            <div className={styles.roadmapStatus}>
              <FaCheckCircle /> Complete
            </div>
            <h3>Phase 1: Foundation</h3>
            <ul>
              <li>NFT minting with admin approval</li>
              <li>Seller & Admin dashboards</li>
              <li>Escrow smart contracts</li>
              <li>Offer/counter-offer system</li>
              <li>Fractional pool models</li>
            </ul>
          </div>

          <div className={`${styles.roadmapCard} ${styles.active}`}>
            <div className={styles.roadmapStatus}>
              <FaSyncAlt /> In Progress
            </div>
            <h3>Phase 2: MVP Launch</h3>
            <ul>
              <li>Squads Protocol multisig integration</li>
              <li>Enhanced UI/UX overhaul</li>
              <li>Vendor verification system</li>
              <li>Production deployment</li>
              <li>First vendor onboarding</li>
            </ul>
          </div>

          <div className={styles.roadmapCard}>
            <div className={styles.roadmapStatus}>Upcoming</div>
            <h3>Phase 3: Expansion</h3>
            <ul>
              <li>Luxury bags, art, jewelry support</li>
              <li>Verified dealer profiles</li>
              <li>Multi-language UI</li>
              <li>Global dealer network</li>
              <li>Mobile optimization</li>
            </ul>
          </div>

          <div className={styles.roadmapCard}>
            <div className={styles.roadmapStatus}>Upcoming</div>
            <h3>Phase 4: Innovation</h3>
            <ul>
              <li>LuxHub NFC authentication chips</li>
              <li>Mobile scan verification app</li>
              <li>AI-powered authenticity models</li>
              <li>3D NFT metaverse integration</li>
              <li>Logistics partner APIs</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Partnerships */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Partnerships</h2>
        <div className={styles.partnersGrid}>
          <div className={styles.partnerCard}>
            <h4>Squads Protocol</h4>
            <p>Multisig security for treasury and escrow operations</p>
          </div>
          <div className={styles.partnerCard}>
            <h4>Helius</h4>
            <p>Enterprise-grade Solana RPC infrastructure</p>
          </div>
          <div className={styles.partnerCard}>
            <h4>Pinata</h4>
            <p>IPFS gateway for NFT metadata storage</p>
          </div>
          <div className={styles.partnerCard}>
            <h4>Metaplex</h4>
            <p>NFT standard and token metadata</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.ctaSection}>
        <h2>Ready to Get Started?</h2>
        <p>
          Join the future of luxury asset trading. Whether you're a collector, dealer, or investor.
        </p>
        <div className={styles.ctaButtons}>
          <Link href="/watchMarket" className={styles.primaryBtn}>
            Browse Marketplace
          </Link>
          <Link href="/sellerDashboard" className={styles.secondaryBtn}>
            List Your Asset
          </Link>
          <Link href="/pools" className={styles.secondaryBtn}>
            View Pools
          </Link>
        </div>
      </section>

      {/* Footer Info */}
      <footer className={styles.footer}>
        <p>
          Questions? Reach out to the LuxHub team. We're building the future of authenticated luxury
          together.
        </p>
        <div className={styles.footerLinks}>
          <span>Devnet Program: kW2w...Npj</span>
          <span>3% Treasury Royalty</span>
        </div>
      </footer>
    </div>
  );
};

export default LearnMorePage;
