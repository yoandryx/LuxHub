import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/LearnMore.module.css';
import {
  FaShieldAlt,
  FaUsers,
  FaArrowRight,
  FaLock,
  FaChartLine,
  FaCheckCircle,
  FaSyncAlt,
  FaGlobe,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { HiOutlineBuildingStorefront } from 'react-icons/hi2';

const LearnMorePage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Learn More | LuxHub</title>
        <meta
          name="description"
          content="LuxHub — decentralized luxury marketplace on Solana. NFT-backed physical assets with verified provenance, on-chain escrow, and tokenized asset pools."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Hero */}
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>
              The Luxury Asset
              <br />
              <span className={styles.heroAccent}>Protocol</span>
            </h1>
            <p className={styles.heroSubtitle}>
              NFT-backed watches, jewelry, and collectibles with verified provenance, on-chain
              escrow, multisig security, and tokenized asset pools.
            </p>
            <div className={styles.heroActions}>
              <Link href="/marketplace" className={styles.primaryBtn}>
                Explore Marketplace <FaArrowRight />
              </Link>
              <Link href="/vendors" className={styles.secondaryBtn}>
                View Dealers
              </Link>
            </div>
          </header>

          {/* Stats */}
          <div className={styles.statsBar}>
            <div className={styles.stat}>
              <span className={styles.statValue}>5%</span>
              <span className={styles.statLabel}>Treasury Fee</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>v0.2</span>
              <span className={styles.statLabel}>Version</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>Devnet</span>
              <span className={styles.statLabel}>Network</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statValue}>Anchor</span>
              <span className={styles.statLabel}>Framework</span>
            </div>
          </div>

          {/* Why LuxHub */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Why LuxHub</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaShieldAlt />
                </div>
                <h3>Verified Authenticity</h3>
                <p>
                  Every asset is admin-verified before NFT minting. On-chain provenance with
                  metadata stored on IPFS via Pinata. AI-powered watch analysis for
                  auto-identification.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaLock />
                </div>
                <h3>Escrow Protection</h3>
                <p>
                  Funds locked in Anchor program PDAs — not LuxHub wallets. Squads Protocol multisig
                  required for all fund releases. 14-day auto-cancel if vendor doesn't ship.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaUsers />
                </div>
                <h3>Tokenized Pools</h3>
                <p>
                  Collective pools let multiple participants access high-value assets through
                  tokenized positions. AMM-powered secondary trading and DAO graduation via Squads.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaGlobe />
                </div>
                <h3>Buyer Protection</h3>
                <p>
                  7-day dispute SLA with admin resolution. On-chain transaction verification for
                  every purchase. Rate-limited endpoints prevent abuse.
                </p>
              </div>
            </div>
          </section>

          {/* How It Works */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>How It Works</span>
            <div className={styles.stepsGrid}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>01</span>
                <div className={styles.stepContent}>
                  <h3>List & Verify</h3>
                  <p>
                    Vendor submits asset details and images. Admin reviews authenticity, then mints
                    an NFT with full metadata on IPFS. AI can auto-detect watch brand, model, and
                    specs from photos.
                  </p>
                </div>
              </div>

              <div className={styles.step}>
                <span className={styles.stepNumber}>02</span>
                <div className={styles.stepContent}>
                  <h3>Purchase via Escrow</h3>
                  <p>
                    Buyer sends SOL — funds are locked in the Anchor escrow PDA. Transaction
                    signature is verified on-chain before MongoDB status updates. No trust required.
                  </p>
                </div>
              </div>

              <div className={styles.step}>
                <span className={styles.stepNumber}>03</span>
                <div className={styles.stepContent}>
                  <h3>Ship & Confirm</h3>
                  <p>
                    Vendor ships the physical item with tracking. Buyer confirms delivery. If no
                    shipment in 14 days, escrow auto-cancels and buyer is refunded.
                  </p>
                </div>
              </div>

              <div className={styles.step}>
                <span className={styles.stepNumber}>04</span>
                <div className={styles.stepContent}>
                  <h3>Multisig Release</h3>
                  <p>
                    Squads multisig executes the release: NFT transfers to buyer, 95% of funds go to
                    seller, 5% to LuxHub treasury vault. Provenance history recorded on-chain
                    forever.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Marketplace Features */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Platform</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <HiOutlineBuildingStorefront /> Direct Sales
                </h3>
                <ul>
                  <li>Fixed price or accepting offers</li>
                  <li>On-chain escrow with TX verification</li>
                  <li>Instant purchase or counter-offers</li>
                  <li>Admin-approved price changes</li>
                </ul>
              </div>

              <div className={styles.featureCard}>
                <h3>
                  <FaChartLine /> Asset Pools
                </h3>
                <ul>
                  <li>Tokenized positions in luxury assets</li>
                  <li>AMM-powered secondary trading</li>
                  <li>Automatic proceeds distribution</li>
                  <li>DAO graduation via Squads multisig</li>
                </ul>
              </div>

              <div className={styles.featureCard}>
                <h3>
                  <FaLock /> Security Layers
                </h3>
                <ul>
                  <li>Squads multisig on all fund movements</li>
                  <li>On-chain TX verification before DB writes</li>
                  <li>AES-256-GCM encryption for vendor PII</li>
                  <li>Rate limiting on purchase endpoints</li>
                </ul>
              </div>

              <div className={styles.featureCard}>
                <h3>
                  <FaUsers /> For Dealers
                </h3>
                <ul>
                  <li>3-step vendor onboarding wizard</li>
                  <li>Inventory management dashboard</li>
                  <li>Public profile with NFT collection</li>
                  <li>Payout tracking and earnings</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Partners */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Partners</span>
            <div className={styles.partnerGrid}>
              <div className={styles.partnerCard}>
                <h4>Squads Protocol</h4>
                <p>Multisig security for treasury and escrow fund releases</p>
              </div>
              <div className={styles.partnerCard}>
                <h4>Helius</h4>
                <p>RPC infrastructure, DAS API for on-chain asset indexing</p>
              </div>
              <div className={styles.partnerCard}>
                <h4>Pinata</h4>
                <p>IPFS gateway for NFT metadata and asset image storage</p>
              </div>
              <div className={styles.partnerCard}>
                <h4>Metaplex</h4>
                <p>Token Metadata standard for SPL NFTs</p>
              </div>
            </div>
          </section>

          {/* Roadmap */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Roadmap</span>
            <div className={styles.roadmapGrid}>
              <div className={`${styles.roadmapCard} ${styles.complete}`}>
                <div className={styles.roadmapStatus}>
                  <FaCheckCircle /> Complete
                </div>
                <h3>Phase 1 — Foundation</h3>
                <ul>
                  <li>Anchor escrow smart contracts</li>
                  <li>NFT minting with admin verification</li>
                  <li>Seller & admin dashboards</li>
                  <li>Offer / counter-offer system</li>
                  <li>MongoDB data layer with Mongoose</li>
                </ul>
              </div>

              <div className={`${styles.roadmapCard} ${styles.complete}`}>
                <div className={styles.roadmapStatus}>
                  <FaCheckCircle /> Complete
                </div>
                <h3>Phase 2 — MVP Prep</h3>
                <ul>
                  <li>Squads multisig integration</li>
                  <li>Helius DAS API for on-chain data</li>
                  <li>TX verification on all purchases</li>
                  <li>Dispute system with 7-day SLA</li>
                  <li>Escrow timeout enforcement</li>
                  <li>Glass-chrome UI overhaul</li>
                </ul>
              </div>

              <div className={`${styles.roadmapCard} ${styles.active}`}>
                <div className={styles.roadmapStatus}>
                  <FaSyncAlt /> Current
                </div>
                <h3>Phase 3 — Launch</h3>
                <ul>
                  <li>Mainnet deployment</li>
                  <li>First vendor onboarding</li>
                  <li>Community building</li>
                  <li>Mobile optimization</li>
                </ul>
              </div>

              <div className={styles.roadmapCard}>
                <div className={styles.roadmapStatus}>Upcoming</div>
                <h3>Phase 4 — Scale</h3>
                <ul>
                  <li>Tokenized asset pools launch</li>
                  <li>Advanced analytics dashboards</li>
                  <li>Third-party API integrations</li>
                  <li>NFC authentication chips</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className={styles.cta}>
            <h2>Ready to start?</h2>
            <p>Whether you're collecting, dealing, or participating — LuxHub is your protocol.</p>
            <div className={styles.ctaButtons}>
              <Link href="/marketplace" className={styles.primaryBtn}>
                Browse Marketplace
              </Link>
              <Link href="/pools" className={styles.secondaryBtn}>
                View Pools
              </Link>
            </div>
          </div>

          {/* Footer */}
          <footer className={styles.footer}>
            <div className={styles.footerLinks}>
              <span>Program: kW2w...Npj</span>
              <span>Devnet</span>
              <span>v0.2.0</span>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
};

export default LearnMorePage;

export async function getStaticProps() {
  return { props: {}, revalidate: 300 };
}
