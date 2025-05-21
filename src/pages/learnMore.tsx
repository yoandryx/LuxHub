import React from "react";
import styles from "../styles/LearnMore.module.css"; // Adjust the path as necessary

const LearnMorePage: React.FC = () => {
  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Learn More About LuxHub</h1>

      <section className={styles.section}>
        <h2>What is LuxHub?</h2>
        <p>
          LuxHub is a next-generation decentralized marketplace built on the Solana blockchain for luxury assets — starting with watches. We bring high-end items into the Web3 space through verifiable NFTs that act as digital certificates of authenticity, ownership, and history. Our goal is to create a trusted, transparent, and borderless ecosystem for collectors, dealers, and investors.
        </p>
      </section>

      <section className={styles.section}>
        <h2>How It Works</h2>
        <ul>
          <li>
            <strong>1. Verification:</strong> Sellers request to mint a luxury NFT. Admins review the details and images, verify authenticity, and mint the NFT tied to the real-world item.
          </li>
          <li>
            <strong>2. Escrow Protection:</strong> NFTs and funds are held in smart contract vaults. Once buyer and seller meet the conditions, LuxHub admins approve the transfer.
          </li>
          <li>
            <strong>3. Ownership Transfer:</strong> NFTs are transferred on-chain to the buyer. Ownership and provenance are stored immutably, visible to all.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>What Makes LuxHub Unique?</h2>
        <ul>
          <li>
            <strong>Admin-Gated System:</strong> Every NFT, listing, and transaction passes through manual or semi-automated review to ensure zero counterfeit risk.
          </li>
          <li>
            <strong>On-Chain Metadata:</strong> Ownership, condition, pricing, and traits are always on-chain and updateable (via admin-approved change requests).
          </li>
          <li>
            <strong>Escrow-First Logic:</strong> Funds and NFTs are never directly exchanged peer-to-peer. Everything goes through vaults for safety and auditability.
          </li>
          <li>
            <strong>Royalty Control:</strong> Each sale includes a LuxHub treasury royalty (default 5%) for platform sustainability and reinvestment.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Future Vision</h2>
        <p>
          We envision LuxHub becoming the go-to digital gateway for high-end physical assets. As we scale, we plan to:
        </p>
        <ul>
          <li>Expand into luxury bags, art, collectibles, and vehicles.</li>
          <li>Introduce verified LuxHub NFC tags embedded into assets for tamper-proof scanning.</li>
          <li>Launch a global tracking system for ownership, transfers, and location-based logistics.</li>
          <li>Automate listing approvals through AI + ML-based authenticity models.</li>
          <li>Build mobile tools for scanning, tracking, and interacting with physical NFTs.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Technical Stack</h2>
        <ul>
          <li><strong>Frontend:</strong> React, Next.js, CSS Modules, Framer Motion, Three.js</li>
          <li><strong>Smart Contracts:</strong> Solana, Anchor Framework (Rust)</li>
          <li><strong>Storage:</strong> Pinata (IPFS) for metadata, images, JSON traits</li>
          <li><strong>NFT Layer:</strong> Metaplex Token Metadata Standard</li>
          <li><strong>Wallets Supported:</strong> Phantom, Backpack, Solflare</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Marketplace Integrity</h2>
        <p>
          LuxHub integrates multiple layers of checks to ensure marketplace safety:
        </p>
        <ul>
          <li>Admin-only NFT minting and listing.</li>
          <li>Escrow logic requires buyer payment before asset release.</li>
          <li>Admins confirm each delivery after asset inspection.</li>
          <li>All events logged transparently with Solana PDAs and MongoDB backend mirrors.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Roadmap: LuxHub Growth Phases</h2>
        <div className={styles.roadmapGrid}>
            {/* Phase 1 */}
            <div className={`${styles.roadmapCard} ${styles.phase1}`}>
            <h3>Phase 1 — Foundation</h3>
            <ul>
                <li>Launched NFT minting with admin approval system</li>
                <li>Built full Seller & Admin Dashboards with end-to-end workflow</li>
                <li>Integrated escrow logic with secure vaults for NFTs and funds</li>
                <li>Enabled metadata updates + change request system</li>
            </ul>
            </div>

            {/* Phase 2 */}
            <div className={`${styles.roadmapCard} ${styles.phase2}`}>
            <h3>Phase 2 — Marketplace Expansion</h3>
            <ul>
                <li>Launch public marketing and partner onboarding campaign</li>
                <li>Add support for <strong>luxury bags, art, collectibles, vehicles, and jewelry.</strong></li>
                <li>Introduce verified seller profiles & reputation badges</li>
                <li>Begin whitelisting luxury dealers globally</li>
                <li>Enable multi-language UI for international markets</li>
            </ul>
            </div>

            {/* Phase 3 */}
            <div className={`${styles.roadmapCard} ${styles.phase3}`}>
            <h3>Phase 3 — Authentication Infrastructure</h3>
            <ul>
                <li>Develop & test LuxHub NFC chips for physical item tagging</li>
                <li>Launch mobile scan app for verifying ownership on-chain</li>
                <li>Introduce QR/NFC-linked vault certificates with metadata access</li>
                <li>Prepare for API integrations with logistics partners</li>
            </ul>
            </div>

            {/* Phase 4 */}
            <div className={`${styles.roadmapCard} ${styles.phase4}`}>
            <h3>Phase 4 — Automation & AI</h3>
            <ul>
                <li>Launch AI-powered metadata assistant for NFT creation</li>
                <li>Implement fraud-detection models using image recognition</li>
                <li>Begin semi-automated admin review workflows</li>
                <li>Support natural language metadata requests</li>
            </ul>
            </div>

            {/* Phase 5 */}
            <div className={`${styles.roadmapCard} ${styles.phase5}`}>
            <h3>Phase 5 — Metaverse-Ready NFTs</h3>
            <ul>
                <li>Offer custom 3D NFT versions of luxury items by verified artists</li>
                <li>Allow users to showcase assets in metaverses and Web3 games</li>
                <li>Enable provenance + real-world proof-of-ownership for 3D flexing</li>
                <li>Explore integrations with platforms like GTA6, Decentraland, and others</li>
            </ul>
            </div>
        </div>
      </section>



      <section className={styles.section}>
        <h2>Who Should Join LuxHub?</h2>
        <p>
          We welcome luxury watch collectors, trusted dealers, investors, and Web3 builders. Whether you're here to sell authenticated timepieces or contribute to the next generation of asset marketplaces, you're in the right place.
        </p>
        <div className={styles.buttonGroup}>
          <a href="/sellerDashboard" className={styles.primaryButton}>Mint a Watch NFT</a>
          <a href="/watchMarket" className={styles.primaryButton}>Explore Marketplace</a>
          <a href="/sellerDashboard" className={styles.secondaryButton}>Manage My Listings</a>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Contact & Support</h2>
        <p>
          Questions? Ideas? Want to collaborate or invest? Reach out to the LuxHub team directly or join our upcoming community channels. We're building this future together.
        </p>
      </section>
    </div>
  );
};

export default LearnMorePage;
