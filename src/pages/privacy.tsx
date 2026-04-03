import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/LearnMore.module.css';
import {
  FaDatabase,
  FaLock,
  FaArrowRight,
  FaUserShield,
  FaEye,
  FaTrashAlt,
  FaCookieBite,
  FaChild,
  FaEnvelope,
} from 'react-icons/fa';

const PrivacyPage: React.FC = () => {
  return (
    <>
      <Head>
        <title>Privacy Policy | LuxHub</title>
        <meta
          name="description"
          content="LuxHub Privacy Policy — how we collect, use, and protect your data."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Hero */}
          <header className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Privacy
              <br />
              <span className={styles.heroAccent}>Policy</span>
            </h1>
            <p className={styles.heroSubtitle}>
              LuxHub collects the minimum data necessary to operate. We never sell your data, never
              track you across the web, and encrypt sensitive information at rest.
            </p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginTop: '8px' }}>
              Last updated: April 2, 2026
            </p>
          </header>

          {/* Data Collection */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Data We Collect</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <FaDatabase /> Automatically Collected
                </h3>
                <ul>
                  <li>Wallet addresses (public on Solana by design)</li>
                  <li>Transaction history (on-chain, publicly visible)</li>
                  <li>Session data via Privy (email, linked wallets, login method)</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaEnvelope /> Provided by You
                </h3>
                <ul>
                  <li>Email address (if signing in via email)</li>
                  <li>Vendor application data (business name, contact, website, inventory size)</li>
                  <li>Vendor profile (name, username, avatar, bio)</li>
                  <li>Shipping addresses for physical delivery</li>
                  <li>Offer and order details (pricing, messages)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* How We Use It */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>How We Use Your Data</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <h3>Authentication</h3>
                <p>
                  Privy manages sign-in sessions, wallet creation, and account linking. We store a
                  synced profile in our database for role-based access.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Marketplace Ops</h3>
                <p>
                  Processing purchases, escrow lifecycle, shipping fulfillment, offer management, and
                  dispute resolution.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Notifications</h3>
                <p>
                  In-app alerts and transactional emails via Resend — order updates, vendor
                  application status, offer notifications.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Vendor Verification</h3>
                <p>
                  Reviewing applications to ensure marketplace quality. Application data is used
                  solely for vetting.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Error Monitoring</h3>
                <p>
                  Sentry captures application errors for debugging. No personal data is intentionally
                  included in error reports.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Analytics</h3>
                <p>
                  Aggregated, non-personal usage patterns to improve the Platform. No individual
                  tracking or profiling.
                </p>
              </div>
            </div>
          </section>

          {/* Data Protection */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Data Protection</span>
            <div className={styles.stepsGrid}>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaLock />
                </span>
                <div className={styles.stepContent}>
                  <h3>AES-256-GCM Encryption</h3>
                  <p>
                    Sensitive data — shipping addresses, vendor PII — is encrypted before storage.
                    Encryption keys live in environment variables, never in the database.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaUserShield />
                </span>
                <div className={styles.stepContent}>
                  <h3>Searchable Hashes</h3>
                  <p>
                    Encrypted fields use salted hashes for lookups without exposing plaintext. You can
                    be found by your data without it being readable.
                  </p>
                </div>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>
                  <FaEye />
                </span>
                <div className={styles.stepContent}>
                  <h3>Escrow &amp; Multisig</h3>
                  <p>
                    Funds are held in Solana PDAs, not LuxHub wallets. Squads Protocol requires
                    multiple approvals for any fund movement.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Third Parties */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Third-Party Services</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <h3>Privy</h3>
                <p>Authentication, wallet creation, session management.</p>
              </div>
              <div className={styles.card}>
                <h3>Solana &amp; Helius</h3>
                <p>Public blockchain for transactions. Helius RPC for asset indexing.</p>
              </div>
              <div className={styles.card}>
                <h3>Irys &amp; Bags</h3>
                <p>Decentralized storage for NFT metadata. Bags for token launch infrastructure.</p>
              </div>
              <div className={styles.card}>
                <h3>Vercel &amp; MongoDB</h3>
                <p>Hosting and serverless infrastructure. Database for off-chain platform data.</p>
              </div>
              <div className={styles.card}>
                <h3>Resend</h3>
                <p>Transactional email delivery for order updates and notifications.</p>
              </div>
              <div className={styles.card}>
                <h3>Sentry</h3>
                <p>Error monitoring and debugging. Reports purged after 90 days.</p>
              </div>
            </div>
          </section>

          {/* What We Don't Do */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>What We Don&apos;t Do</span>
            <div className={styles.featureGrid}>
              <div className={styles.featureCard}>
                <h3>
                  <FaTrashAlt /> Never
                </h3>
                <ul>
                  <li>Sell or rent personal data to third parties</li>
                  <li>Use data for advertising or ad targeting</li>
                  <li>Track you across other websites</li>
                  <li>Store payment card information (payments are on-chain SOL)</li>
                  <li>Store plaintext shipping addresses (AES-256-GCM encrypted)</li>
                  <li>Share data beyond what&apos;s needed for functionality</li>
                </ul>
              </div>
              <div className={styles.featureCard}>
                <h3>
                  <FaUserShield /> Your Rights
                </h3>
                <ul>
                  <li>
                    <strong>Access</strong> — request a copy of data we hold
                  </li>
                  <li>
                    <strong>Correction</strong> — update inaccurate data via profile or support
                  </li>
                  <li>
                    <strong>Deletion</strong> — request removal of off-chain data
                  </li>
                  <li>
                    <strong>Portability</strong> — on-chain data is inherently portable via wallet
                  </li>
                  <li>On-chain data (blockchain) cannot be deleted by anyone</li>
                  <li>Order data retained 1 year for dispute/compliance</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Cookies, Children, Changes */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>Other Policies</span>
            <div className={styles.cardGrid}>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaCookieBite />
                </div>
                <h3>Cookies &amp; Storage</h3>
                <p>
                  Minimal browser storage for auth tokens (Privy), UI preferences (price display),
                  and session state. No third-party tracking cookies or ad pixels.
                </p>
              </div>
              <div className={styles.card}>
                <div className={styles.cardIcon}>
                  <FaChild />
                </div>
                <h3>Age Requirement</h3>
                <p>
                  LuxHub is not intended for anyone under 18. We do not knowingly collect data from
                  minors.
                </p>
              </div>
              <div className={styles.card}>
                <h3>Policy Changes</h3>
                <p>
                  We may update this policy as the Platform evolves. Material changes will be
                  communicated through the Platform. Continued use = acceptance.
                </p>
              </div>
            </div>
          </section>

          {/* CTA */}
          <div className={styles.cta}>
            <h2>Questions?</h2>
            <p>
              For privacy questions or data requests, contact{' '}
              <a href="mailto:support@luxhub.gold" style={{ color: '#c8a1ff' }}>
                support@luxhub.gold
              </a>{' '}
              or{' '}
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
              <Link href="/terms" className={styles.primaryBtn}>
                <span>Terms of Service</span> <FaArrowRight />
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

export default PrivacyPage;
