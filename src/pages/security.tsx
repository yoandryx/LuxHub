import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/LearnMore.module.css';
import {
  FaShieldAlt,
  FaLock,
  FaCheckCircle,
  FaClock,
  FaGavel,
  FaUsers,
  FaArrowRight,
  FaWallet,
  FaExchangeAlt,
  FaEye,
  FaUserShield,
  FaStore,
  FaShoppingBag,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';

const SecurityPage = () => {
  return (
    <>
      <Head>
        <title>Security & Trust | LuxHub</title>
        <meta
          name="description"
          content="How LuxHub protects your funds, verifies transactions, and ensures safe luxury asset trading on Solana."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Hero */}
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Security &<br />
              <span className={styles.heroAccent}>Trust</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Every transaction verified on-chain. Every payment held in escrow. Every fund movement
              requires multisig approval.
            </p>
          </header>

          {/* On-Chain Escrow */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Escrow Protection</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaShoppingBag />
                </div>
                <h3>1. You Buy</h3>
                <p>
                  Payment goes directly into a Solana escrow PDA. LuxHub never holds your funds —
                  they're locked in the smart contract.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaStore />
                </div>
                <h3>2. Vendor Ships</h3>
                <p>
                  The vendor is notified and ships the physical item with tracking. You can follow
                  your delivery in real-time.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaCheckCircle />
                </div>
                <h3>3. Funds Release</h3>
                <p>
                  After delivery confirmation, Squads multisig executes the release: 95% to vendor,
                  5% to LuxHub treasury.
                </p>
              </div>
            </div>
          </section>

          {/* TX Verification */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Transaction Verification</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <SiSolana />
                </div>
                <h3>On-Chain Proof</h3>
                <p>
                  Every purchase and pool contribution transaction signature is verified against the
                  Solana blockchain before any database state changes occur.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaWallet />
                </div>
                <h3>Wallet Matching</h3>
                <p>
                  Your wallet address is verified as a signer in the on-chain transaction. Nobody
                  can claim a payment they didn&apos;t make.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaEye />
                </div>
                <h3>Helius DAS Indexing</h3>
                <p>
                  Real-time asset indexing via Helius DAS API. NFT holdings, pool positions, and
                  transaction history are always accurate.
                </p>
              </div>
            </div>
          </section>

          {/* Timeout Protections */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Timeout Protections</span>
            <div className={styles.stepsGrid}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaClock />
                </span>
                <div className={styles.stepContent}>
                  <h3>14-Day Shipment Window</h3>
                  <p>
                    If a vendor doesn&apos;t ship within 14 days of purchase, the escrow is
                    automatically cancelled and your funds are returned.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaExchangeAlt />
                </span>
                <div className={styles.stepContent}>
                  <h3>30-Day Delivery Flag</h3>
                  <p>
                    Items marked as shipped but not delivered within 30 days are flagged for admin
                    review and investigation.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaGavel />
                </span>
                <div className={styles.stepContent}>
                  <h3>7-Day Dispute SLA</h3>
                  <p>
                    Disputes must be responded to within 7 days. Unresolved disputes are
                    automatically escalated.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Dispute Resolution */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Dispute Resolution</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <h3>Open a Dispute</h3>
                <p>
                  Select a reason — not received, wrong item, damaged, or counterfeit. Describe the
                  issue and upload evidence. Immediately visible to the team.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Admin Review</h3>
                <p>
                  LuxHub team reviews your dispute, contacts the vendor, examines evidence.
                  Resolution options: full refund, partial refund, or release to vendor.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Multisig Refund</h3>
                <p>
                  Approved refunds are executed via Squads multisig proposal. Multiple team members
                  must approve before funds move.
                </p>
              </div>
            </div>
          </section>

          {/* Multisig */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Squads Multisig</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaUsers />
                </div>
                <h3>Multi-Signature Approval</h3>
                <p>
                  All fund movements require approval from multiple LuxHub team members. One
                  compromised key cannot drain the treasury.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaLock />
                </div>
                <h3>On-Chain Proposals</h3>
                <p>
                  Every payment is proposed as a Squads vault transaction. Team members review and
                  approve before execution.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaShieldAlt />
                </div>
                <h3>Transparent Audit Trail</h3>
                <p>
                  All proposals, approvals, and executions are recorded on Solana. Anyone can verify
                  fund movements on-chain.
                </p>
              </div>
            </div>
          </section>

          {/* Capabilities */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Your Capabilities</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <FaShoppingBag /> Buyers
                </h3>
                <ul>
                  <li>Browse marketplace and asset pools</li>
                  <li>Purchase NFT-backed luxury items</li>
                  <li>Make offers on listings</li>
                  <li>Track orders and shipping</li>
                  <li>View on-chain NFT portfolio</li>
                  <li>Open disputes and request refunds</li>
                  <li>Participate in tokenized asset pools</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaStore /> Vendors
                </h3>
                <ul>
                  <li>Onboard with 3-step wizard</li>
                  <li>List luxury items for sale</li>
                  <li>Manage inventory and pricing</li>
                  <li>Fulfill orders with tracking</li>
                  <li>Track payouts and earnings</li>
                  <li>Public vendor profile page</li>
                  <li>Request delisting of items</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaShieldAlt /> Platform
                </h3>
                <ul>
                  <li>On-chain escrow (no custodial risk)</li>
                  <li>TX verification on every payment</li>
                  <li>Squads multisig for all fund moves</li>
                  <li>14-day auto-cancel for unfulfilled orders</li>
                  <li>7-day dispute SLA with escalation</li>
                  <li>Helius real-time blockchain indexing</li>
                  <li>AES-256-GCM encrypted vendor data</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className={styles.cta}>
            <h2>Ready to start?</h2>
            <p>Connect your wallet and explore the marketplace.</p>
            <div className={styles.ctaButtons}>
              <Link href="/marketplace" className={styles.primaryBtn}>
                Explore Marketplace <FaArrowRight />
              </Link>
              <Link href="/pools" className={styles.secondaryBtn}>
                View Pools
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default SecurityPage;

export async function getStaticProps() {
  return { props: {}, revalidate: 600 };
}
