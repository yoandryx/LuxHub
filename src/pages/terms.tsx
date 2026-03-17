import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import styles from '../styles/Terms.module.css';

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
          <header className={styles.header}>
            <Link href="/" className={styles.backLink}>
              &larr; Back to LuxHub
            </Link>
            <h1 className={styles.title}>Terms of Service</h1>
            <p className={styles.lastUpdated}>Last updated: March 16, 2026</p>
          </header>

          <div className={styles.content}>
            <section className={styles.section}>
              <h2>1. Acceptance of Terms</h2>
              <p>
                By accessing or using LuxHub (&quot;the Platform&quot;), including connecting a
                wallet, browsing listings, participating in pools, or executing transactions, you
                agree to be bound by these Terms of Service. If you do not agree, do not use the
                Platform.
              </p>
            </section>

            <section className={styles.section}>
              <h2>2. Platform Description</h2>
              <p>
                LuxHub is a decentralized marketplace for authenticated luxury timepieces built on
                the Solana blockchain. The Platform facilitates NFT-backed asset listings, on-chain
                escrow transactions, and tokenized community pools. LuxHub provides the technology
                infrastructure — it does not buy, sell, authenticate, or take custody of assets on
                its own behalf.
              </p>
            </section>

            <section className={styles.section}>
              <h2>3. No Financial Advice</h2>
              <p>
                Nothing on this Platform constitutes financial advice or a solicitation to purchase
                or sell any asset, token, or digital property. Tokens on LuxHub are not regulated
                financial instruments. All information is provided for informational purposes only.
                You are solely responsible for evaluating any transaction before proceeding.
              </p>
            </section>

            <section className={styles.section}>
              <h2>4. Assumption of Risk</h2>
              <p>
                You acknowledge and accept the inherent risks associated with blockchain technology,
                including but not limited to:
              </p>
              <ul>
                <li>Smart contract vulnerabilities or bugs</li>
                <li>Network congestion, downtime, or failed transactions</li>
                <li>Loss of private keys or wallet access</li>
                <li>Market volatility and token price fluctuations</li>
                <li>Regulatory changes affecting digital assets in your jurisdiction</li>
                <li>Third-party service failures (RPC providers, wallets, exchanges)</li>
              </ul>
              <p>
                LuxHub does not guarantee the performance, value, or liquidity of any token, NFT, or
                pool on the Platform.
              </p>
            </section>

            <section className={styles.section}>
              <h2>5. Limitation of Liability</h2>
              <p>
                To the maximum extent permitted by law, LuxHub, its founders, contributors, and
                affiliates shall not be liable for any direct, indirect, incidental, consequential,
                or special damages arising from your use of the Platform, including but not limited
                to loss of funds, tokens, digital assets, or anticipated proceeds. The Platform is
                provided &quot;as is&quot; and &quot;as available&quot; without warranties of any
                kind, whether express or implied.
              </p>
            </section>

            <section className={styles.section}>
              <h2>6. Pool Participation</h2>
              <p>
                Participating in tokenized pools involves risk. Pool tokens may lose value, assets
                may not resell at expected prices, and distributions depend on actual resale
                outcomes. Past performance of any asset or pool does not guarantee future results.
                You are responsible for understanding the pool lifecycle before contributing.
              </p>
            </section>

            <section className={styles.section}>
              <h2>7. Escrow &amp; Transactions</h2>
              <p>
                On-chain escrow is managed by smart contracts deployed on Solana. While LuxHub has
                implemented security measures including multisig controls, transaction verification,
                and timeout enforcement, no system is immune to all risks. LuxHub is not responsible
                for losses due to smart contract exploits, user error, or disputes that cannot be
                resolved.
              </p>
            </section>

            <section className={styles.section}>
              <h2>8. Vendor Responsibility</h2>
              <p>
                Vendors are responsible for the authenticity and condition of listed assets. LuxHub
                facilitates verification but does not independently guarantee the authenticity of
                every item. Disputes are handled through the Platform&apos;s resolution process with
                best-effort mediation.
              </p>
            </section>

            <section className={styles.section}>
              <h2>9. User Conduct</h2>
              <p>You agree not to:</p>
              <ul>
                <li>Use the Platform for money laundering or illicit activity</li>
                <li>Manipulate token prices, trading volume, or pool participation</li>
                <li>Exploit smart contract vulnerabilities for personal gain</li>
                <li>Misrepresent the authenticity or condition of assets</li>
                <li>Circumvent security measures, rate limits, or access controls</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2>10. Privacy</h2>
              <p>
                LuxHub collects minimal personal data. Wallet addresses are public on the Solana
                blockchain. Shipping addresses provided for physical delivery are encrypted with
                AES-256-GCM and stored securely. We do not sell or share personal information with
                third parties except as required to fulfill transactions or comply with law.
              </p>
            </section>

            <section className={styles.section}>
              <h2>11. Jurisdictional Compliance</h2>
              <p>
                You are solely responsible for ensuring your use of the Platform complies with all
                applicable laws and regulations in your jurisdiction. LuxHub makes no representation
                that the Platform is appropriate or available for use in all locations.
              </p>
            </section>

            <section className={styles.section}>
              <h2>12. Modifications</h2>
              <p>
                LuxHub reserves the right to modify these Terms at any time. Continued use of the
                Platform after changes constitutes acceptance of the updated Terms. Material changes
                will be communicated through the Platform.
              </p>
            </section>

            <section className={styles.section}>
              <h2>13. Contact</h2>
              <p>
                For questions regarding these Terms, contact us at{' '}
                <a href="mailto:support@luxhub.gold" className={styles.link}>
                  support@luxhub.gold
                </a>
                .
              </p>
            </section>
          </div>
        </main>
      </div>
    </>
  );
};

export default TermsPage;
