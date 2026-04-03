import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/LearnMore.module.css';
import {
  FaFileContract,
  FaShieldAlt,
  FaArrowRight,
  FaExclamationTriangle,
  FaHandshake,
  FaStore,
  FaPercentage,
  FaBan,
  FaBalanceScale,
  FaGlobe,
  FaEdit,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';

const TermsPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Terms of Service | LuxHub</title>
        <meta
          name="description"
          content="LuxHub Terms of Service — read before using the platform."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Hero */}
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Terms of
              <br />
              <span className={styles.heroAccent}>Service</span>
            </h1>
            <p className={styles.heroSubtitle}>
              By using LuxHub you agree to these terms. Please read them carefully before connecting
              your wallet or executing transactions.
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginTop: '8px' }}>
              Last updated: April 2, 2026
            </p>
          </header>

          {/* Platform Description */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>The Platform</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaFileContract />
                </div>
                <h3>What LuxHub Is</h3>
                <p>
                  A decentralized marketplace for authenticated luxury assets — watches, jewelry,
                  collectibles, and art — built on the Solana blockchain with NFT-backed provenance
                  and on-chain escrow.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <SiSolana />
                </div>
                <h3>What We Facilitate</h3>
                <p>
                  NFT-backed listings, Anchor escrow transactions, tokenized pools via Bags bonding
                  curves, vendor verification, AI inventory tools, and Squads multisig treasury
                  management.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaHandshake />
                </div>
                <h3>What We Don&apos;t Do</h3>
                <p>
                  LuxHub does not buy, sell, authenticate, or take custody of physical assets. We
                  provide the technology infrastructure. Vendors are independent dealers.
                </p>
              </div>
            </div>
          </section>

          {/* Authentication */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Authentication &amp; Accounts</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <h3>Privy Sign-In</h3>
                <p>
                  LuxHub uses Privy for authentication. You may sign in with email or social
                  accounts. An embedded Solana wallet is created for email sign-ins. You can also
                  link an existing wallet.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Your Responsibility</h3>
                <p>
                  You are responsible for maintaining the security of your account credentials and
                  linked wallets. LuxHub cannot recover lost private keys or embedded wallet access.
                </p>
              </div>
            </div>
          </section>

          {/* Risks */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Risks &amp; Disclaimers</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <FaExclamationTriangle /> Assumption of Risk
                </h3>
                <ul>
                  <li>Smart contract vulnerabilities or bugs</li>
                  <li>Network congestion, downtime, or failed transactions on Solana</li>
                  <li>Loss of private keys or wallet access</li>
                  <li>SOL and token price volatility</li>
                  <li>Regulatory changes affecting digital assets</li>
                  <li>Third-party failures (Helius, Privy, Bags, Irys)</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaBalanceScale /> No Financial Advice
                </h3>
                <ul>
                  <li>Nothing on the Platform is financial advice</li>
                  <li>Pool tokens are community participation tokens</li>
                  <li>Not securities, shares, or financial instruments</li>
                  <li>Past performance does not guarantee future results</li>
                  <li>You are solely responsible for evaluating transactions</li>
                  <li>LuxHub does not guarantee token value or liquidity</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Escrow & Transactions */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Escrow &amp; Transactions</span>
            <div className={styles.stepsGrid}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>1</span>
                <div className={styles.stepContent}>
                  <h3>Funds Locked in Escrow PDA</h3>
                  <p>
                    Buyer funds go into a Solana program-derived address — not held by LuxHub. Smart
                    contracts manage the entire lifecycle.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>2</span>
                <div className={styles.stepContent}>
                  <h3>Vendor Ships with Tracking</h3>
                  <p>
                    Vendors have 14 days to ship. Failure to ship triggers automatic cancellation and
                    buyer refund.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>3</span>
                <div className={styles.stepContent}>
                  <h3>Delivery Confirmation Releases Funds</h3>
                  <p>
                    97% to vendor, 3% to treasury. Squads multisig executes the release. 7-day
                    dispute SLA if issues arise.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Pools */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Pool Participation</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <h3>Bonding Curves</h3>
                <p>
                  Pool tokens are launched via Bags bonding curves and may trade on secondary markets
                  including Jupiter. Token price is determined by supply and demand.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Resale Distribution</h3>
                <p>
                  Upon asset resale, 97% is distributed to token holders proportionally. Tokens are
                  burned after distribution. Pool close is final.
                </p>
              </div>
              <div className={styles.card}>
                <h3>No Guarantees</h3>
                <p>
                  Pool tokens may lose value. Assets may not resell at expected prices. You are
                  responsible for understanding the lifecycle before participating.
                </p>
              </div>
            </div>
          </section>

          {/* Vendor & Fees */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Vendors &amp; Fees</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaStore />
                </div>
                <h3>Vendor Responsibility</h3>
                <p>
                  All vendors are verified through our application process. Vendors are responsible
                  for authenticity, accurate descriptions, pricing, timely fulfillment, and
                  communication. LuxHub facilitates but does not guarantee every item.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaPercentage />
                </div>
                <h3>Fee Structure</h3>
                <p>
                  Marketplace escrow: 3% of sale price (deducted at delivery). Pool creator fee: 1%
                  on token trades (100% to treasury). Vendors receive SOL payouts directly to their
                  wallet.
                </p>
              </div>
            </div>
          </section>

          {/* User Conduct */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>User Conduct</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <FaBan /> Prohibited Activity
                </h3>
                <ul>
                  <li>Money laundering or illicit activity</li>
                  <li>Token price or volume manipulation</li>
                  <li>Smart contract exploitation</li>
                  <li>Misrepresenting asset authenticity or condition</li>
                  <li>Circumventing security measures or rate limits</li>
                  <li>Submitting fraudulent vendor applications</li>
                  <li>Using the Platform from sanctioned jurisdictions</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaShieldAlt /> Liability &amp; Compliance
                </h3>
                <ul>
                  <li>
                    Platform provided &quot;as is&quot; without warranties
                  </li>
                  <li>No liability for losses from use of the Platform</li>
                  <li>You ensure compliance with your local laws</li>
                  <li>LuxHub may modify terms at any time</li>
                  <li>Continued use = acceptance of updates</li>
                  <li>Material changes communicated through the Platform</li>
                </ul>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className={styles.cta}>
            <h2>Questions?</h2>
            <p>
              Contact{' '}
              <a href="mailto:support@luxhub.gold" style={{ color: '#c8a1ff' }}>
                support@luxhub.gold
              </a>{' '}
              or reach out on{' '}
              <a
                href="https://x.com/LuxHubStudio"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#c8a1ff' }}
              >
                @LuxHubStudio
              </a>
            </p>
            <div className={styles.ctaButtons}>
              <Link href="/privacy" className={styles.primaryBtn}>
                <span>Privacy Policy</span> <FaArrowRight />
              </Link>
              <Link href="/security" className={styles.secondaryBtn}>
                Security &amp; Trust
              </Link>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default TermsPage;
