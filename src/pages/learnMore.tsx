import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/LearnMore.module.css';
import {
  FaShieldAlt,
  FaUsers,
  FaArrowRight,
  FaLock,
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
          content="LuxHub — decentralized luxury marketplace on Solana. NFT-backed physical assets with verified provenance and on-chain escrow."
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
              escrow, and multisig security.
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
                  Every asset is admin-reviewed before its on-chain record is minted. Metadata is
                  written to permanent decentralized storage via Irys. AI-assisted watch analysis
                  helps detect brand, model, and specs from photos.
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
                    the on-chain record with full metadata written to permanent decentralized
                    storage (Irys). AI assist can auto-detect watch brand, model, and specs.
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
                    Squads multisig executes the release: the on-chain record transfers to the
                    buyer, 97% of funds go to the vendor, 3% to the LuxHub treasury vault.
                    Provenance history is preserved on-chain forever.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Verification — deep-linkable via /learnMore#verification */}
          <section id="verification" className={styles.section}>
            <span className={styles.sectionLabel}>Verification</span>
            <h2 className={styles.sectionHeading}>Four layers of trust.</h2>
            <p className={styles.sectionLede}>
              Every transaction on LuxHub passes through four independent verification gates —
              from the vendor at the front door to the package in your hand.
            </p>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaUsers />
                </div>
                <h3>Vendor Verification</h3>
                <p>
                  Dealers apply through a structured onboarding flow. Admins manually review each
                  application before granting listing access — no anonymous sellers, no
                  self-serve approvals.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaShieldAlt />
                </div>
                <h3>Asset Verification</h3>
                <p>
                  Every item is admin-reviewed before its on-chain record is created. AI watch
                  analysis assists with brand, model, and spec detection. Metadata is written
                  permanently to Irys — it cannot be altered or removed after mint.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <SiSolana />
                </div>
                <h3>Transaction Verification</h3>
                <p>
                  Every purchase signature is verified on-chain before our database records the
                  sale. If the Solana transaction didn't actually occur — or wasn't signed by the
                  buyer's wallet — the order is rejected.
                </p>
              </div>

              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaCheckCircle />
                </div>
                <h3>Delivery Verification</h3>
                <p>
                  Funds stay in the escrow PDA until the buyer confirms receipt. If the vendor
                  doesn't ship within 14 days, escrow auto-cancels and the buyer is refunded.
                  Disputes follow a 7-day admin SLA.
                </p>
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
                <h4>Irys</h4>
                <p>Permanent decentralized storage for asset metadata and images</p>
              </div>
              <div className={styles.partnerCard}>
                <h4>Metaplex</h4>
                <p>Token Metadata standard for the on-chain asset records</p>
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

              <div className={`${styles.roadmapCard} ${styles.complete}`}>
                <div className={styles.roadmapStatus}>
                  <FaCheckCircle /> Complete
                </div>
                <h3>Phase 3 — Launch</h3>
                <ul>
                  <li>Mainnet deployment (v1.0)</li>
                  <li>Full escrow lifecycle proven on-chain</li>
                  <li>First vendor onboarded</li>
                  <li>Chrome-glass UI polish</li>
                </ul>
              </div>

              <div className={`${styles.roadmapCard} ${styles.active}`}>
                <div className={styles.roadmapStatus}>
                  <FaSyncAlt /> Current
                </div>
                <h3>Phase 4 — Growth</h3>
                <ul>
                  <li>Expanding the dealer network</li>
                  <li>Mobile-first experience</li>
                  <li>Marketplace discovery & filters</li>
                  <li>Community building</li>
                </ul>
              </div>

              <div className={styles.roadmapCard}>
                <div className={styles.roadmapStatus}>Upcoming</div>
                <h3>Phase 5 — Scale</h3>
                <ul>
                  <li>NFC authentication chips on physical assets</li>
                  <li>Advanced analytics dashboards</li>
                  <li>Third-party API integrations</li>
                  <li>International dealer expansion</li>
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
              <Link href="/vendor/apply" className={styles.secondaryBtn}>
                Become a Vendor
              </Link>
            </div>
          </div>

          {/* Footer */}
          <footer className={styles.footer}>
            <div className={styles.footerLinks}>
              <span>Program: kW2w...Npj</span>
              <span>Mainnet</span>
              <span>v1.0.0</span>
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
