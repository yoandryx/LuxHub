import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import NFTCard from "../components/marketplace/NFTCard";
import styles from "../styles/Home.module.css";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { motion } from "framer-motion";
import { FaShieldAlt, FaLock, FaExchangeAlt } from "react-icons/fa";

const WaveScene = dynamic(() => import("../components/common/WaveScene"), { ssr: false });

// Escrow flow steps - static data
const escrowSteps = [
  {
    num: "01",
    title: "Verify",
    subtitle: "Authenticity Guaranteed",
    desc: "Blockchain-anchored NFT ensures provenance is tamper-proof.",
    icon: FaShieldAlt,
  },
  {
    num: "02",
    title: "Escrow",
    subtitle: "Protected Transaction",
    desc: "Funds held in Solana smart contract until sale approval.",
    icon: FaLock,
  },
  {
    num: "03",
    title: "Transfer",
    subtitle: "Immutable Ownership",
    desc: "NFT ownership transfers on-chain. Permanently recorded.",
    icon: FaExchangeAlt,
  },
];

interface NFT {
  nftId: string;
  fileCid: string;
  salePrice: number;
  timestamp: number;
  seller: string;
  buyer: string;
  marketStatus: string;
  image?: string;
  title?: string;
  attributes?: { trait_type: string; value: string }[];
}

export default function Home() {
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [showWaveScene, setShowWaveScene] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // Delayed WaveScene load for performance
  useEffect(() => {
    const timeout = setTimeout(() => setShowWaveScene(true), 500);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch NFTs
  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const res = await fetch("/api/nft/holders");
        const data = await res.json();
        const enriched = await Promise.all(
          data.slice(0, 6).map(async (nft: any) => {
            try {
              const meta = await fetch(`https://ipfs.io/ipfs/${nft.fileCid}`);
              const metaData = await meta.json();
              return {
                ...nft,
                image: metaData.image,
                title: metaData.name || "Untitled Watch",
                attributes: metaData.attributes,
              };
            } catch {
              return { ...nft, image: "", title: "Untitled Watch" };
            }
          })
        );
        setFeaturedNFTs([...enriched, ...enriched]);
      } catch (err) {
        console.error("Failed to load NFTs", err);
      }
    };
    fetchFeatured();
  }, []);

  // Auto-scroll animation
  useEffect(() => {
    if (isHovered || !isVisible || featuredNFTs.length === 0) return;

    let frame: number;
    let lastTime = performance.now();
    const PIXELS_PER_SECOND = 40;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      const distance = (PIXELS_PER_SECOND * deltaTime) / 1000;

      if (!leftColumnRef.current || !rightColumnRef.current) return;

      leftColumnRef.current.scrollTop += distance;
      if (leftColumnRef.current.scrollTop >= leftColumnRef.current.scrollHeight / 2) {
        leftColumnRef.current.scrollTop -= leftColumnRef.current.scrollHeight / 2;
      }

      rightColumnRef.current.scrollTop -= distance;
      if (rightColumnRef.current.scrollTop <= 0) {
        rightColumnRef.current.scrollTop += rightColumnRef.current.scrollHeight / 2;
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isHovered, isVisible, featuredNFTs]);

  // Visibility observer
  useEffect(() => {
    if (!wrapperRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setIsVisible(entry.isIntersecting)),
      { threshold: 0.3 }
    );
    observerRef.current.observe(wrapperRef.current);
    return () => {
      if (observerRef.current && wrapperRef.current) {
        observerRef.current.unobserve(wrapperRef.current);
      }
    };
  }, []);

  return (
    <>
      <div className={styles.waveBackground}>{showWaveScene && <WaveScene />}</div>

      <div className={styles.container}>
        {/* HERO + NFT SHOWCASE */}
        <section className={styles.rowContent}>
          <section className={styles.hero}>
            <div className={styles.heroContent}>
              <img src="/images/purpleLGG.png" alt="LuxHub Logo" className={styles.logo} />
              <h1 className={styles.title}>LUXHUB</h1>
              <p className={styles.subtitle}>Luxury Timepieces. On-Chain.</p>
              <div className={styles.heroButtons}>
                <Link href="/watchMarket" className={styles.heroPrimary}>Browse Market</Link>
                <Link href="/sellerDashboard" className={styles.heroSecondary}>List Your Watch</Link>
              </div>
            </div>
          </section>

          <section className={styles.featuredNFTs}>
            <div
              className={styles.verticalClockWrapper}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              ref={wrapperRef}
            >
              <div className={styles.dualColumns}>
                <div className={styles.scrollColumn} ref={leftColumnRef}>
                  <div className={styles.nftColumn}>
                    {[...featuredNFTs, ...featuredNFTs].map((nft, i) => (
                      <div
                        key={`left-${nft.nftId}-${i}`}
                        className={styles.nftCardWrapper}
                        onClick={() => setSelectedNFT(nft)}
                      >
                        <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className={styles.scrollColumn} ref={rightColumnRef}>
                  <div className={styles.nftColumn}>
                    {[...featuredNFTs, ...featuredNFTs].map((nft, i) => (
                      <div
                        key={`right-${nft.nftId}-${i}`}
                        className={styles.nftCardWrapper}
                        onClick={() => setSelectedNFT(nft)}
                      >
                        <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>

        {/* TRUST STRIP + POWERED BY */}
        <section className={styles.trustPoweredRow}>
          <div className={styles.trustStrip}>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>$2M+</span>
              <span className={styles.statLabel}>Volume</span>
            </motion.div>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>100+</span>
              <span className={styles.statLabel}>Timepieces</span>
            </motion.div>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>3%</span>
              <span className={styles.statLabel}>Royalty</span>
            </motion.div>
          </div>

          <div className={styles.poweredBy}>
            <span className={styles.poweredLabel}>Powered by</span>
            <div className={styles.partnerLogos}>
              <a href="https://solana.com" target="_blank" rel="noopener noreferrer">
                <img src="/images/solana-logo.svg" alt="Solana" />
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer">
                <img src="/images/helius-logo.svg" alt="Helius" />
              </a>
              <a href="https://bags.fm" target="_blank" rel="noopener noreferrer">
                <img src="/images/bags-icon.png" alt="Bags" />
              </a>
              <a href="https://ipfs.io" target="_blank" rel="noopener noreferrer">
                <img src="/images/ipfs-logo.svg" alt="IPFS" />
              </a>
            </div>
          </div>
        </section>

        {/* FRACTIONAL POOLS */}
        <section className={styles.poolsSection}>
          <motion.div
            className={styles.poolsCard}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <span className={styles.comingSoonBadge}>Coming Soon</span>
            <h2>Fractional Ownership</h2>
            <p className={styles.poolsDesc}>
              Own a piece of luxury. Invest in high-value timepieces with as little as $100.
            </p>
            <div className={styles.poolsFeatures}>
              <span>$100 min</span>
              <span>On-chain %</span>
              <span>Multisig vaults</span>
            </div>
            <button className={styles.disabledButton} disabled>Join Waitlist</button>
          </motion.div>
        </section>

        {/* ESCROW FLOW */}
        <section className={styles.escrowSection}>
          <div className={styles.escrowHeader}>
            <span className={styles.escrowTag}>Security</span>
            <h2>How We Protect You</h2>
            <p className={styles.sectionSubtitle}>On-chain escrow. Verified provenance. Real luxury.</p>
          </div>

          <div className={styles.escrowGrid}>
            {escrowSteps.map((step, i) => {
              const IconComponent = step.icon;
              return (
                <motion.div
                  key={step.num}
                  className={styles.escrowCard}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                  viewport={{ once: true, margin: "-50px" }}
                >
                  <div className={styles.escrowCardInner}>
                    <span className={styles.escrowNum}>{step.num}</span>
                    <div className={styles.escrowIcon}>
                      <IconComponent />
                    </div>
                    <h3>{step.title}</h3>
                    <span className={styles.escrowSubtitle}>{step.subtitle}</span>
                    <p>{step.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* FOOTER CTA */}
        <section className={styles.footerCta}>
          <h2>Ready to start?</h2>
          <div className={styles.footerButtons}>
            <Link href="/watchMarket" className={styles.primaryButton}>Explore Marketplace</Link>
            <Link href="/sellerDashboard" className={styles.ghostButton}>Become a Dealer</Link>
          </div>
        </section>

        {/* NFT DETAIL MODAL */}
        {selectedNFT && (
          <div className={styles.detailOverlay}>
            <div className={styles.detailContainer}>
              <NftDetailCard
                mintAddress={selectedNFT.nftId}
                onClose={() => setSelectedNFT(null)}
                showContactButton
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
