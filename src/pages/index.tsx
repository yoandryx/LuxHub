import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import NFTCard from '../components/marketplace/NFTCard';
import styles from '../styles/Home.module.css';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import { motion } from 'framer-motion';
import {
  FaShieldAlt,
  FaLock,
  FaExchangeAlt,
  FaChevronLeft,
  FaChevronRight,
  FaUsers,
  FaChartLine,
  FaGem,
  FaArrowRight,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { BiTargetLock } from 'react-icons/bi';

const WaveScene = dynamic(() => import('../components/common/WaveScene'), { ssr: false });

// Escrow flow steps - static data
const escrowSteps = [
  {
    num: '01',
    title: 'Verify',
    subtitle: 'Authenticity Guaranteed',
    desc: 'Blockchain-anchored NFT ensures provenance is tamper-proof.',
    icon: FaShieldAlt,
  },
  {
    num: '02',
    title: 'Escrow',
    subtitle: 'Protected Transaction',
    desc: 'Funds held in Solana smart contract until sale approval.',
    icon: FaLock,
  },
  {
    num: '03',
    title: 'Transfer',
    subtitle: 'Immutable Ownership',
    desc: 'NFT ownership transfers on-chain. Permanently recorded.',
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

interface Pool {
  _id: string;
  poolNumber?: string;
  title?: string;
  asset?: {
    model?: string;
    brand?: string;
    priceUSD?: number;
    imageIpfsUrls?: string[];
    images?: string[];
  };
  vendor?: { businessName?: string };
  status: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD: number;
  targetAmountUSD: number;
  minBuyInUSD: number;
  projectedROI: number;
  maxInvestors: number;
  participants?: Array<{ wallet: string; shares: number }>;
}

// Mock pools for demo
const MOCK_POOLS: Pool[] = [
  {
    _id: 'pool_001',
    title: 'Rolex Daytona Rainbow',
    asset: {
      model: 'Daytona Rainbow',
      brand: 'Rolex',
      priceUSD: 250000,
      images: ['/images/rolex-daytona-rainbow.jpg'],
    },
    status: 'open',
    totalShares: 100,
    sharesSold: 75,
    sharePriceUSD: 2500,
    targetAmountUSD: 250000,
    minBuyInUSD: 2500,
    projectedROI: 1.25,
    maxInvestors: 50,
    participants: [],
  },
  {
    _id: 'pool_002',
    title: 'AP Royal Oak Offshore',
    asset: {
      model: 'Royal Oak Offshore',
      brand: 'Audemars Piguet',
      priceUSD: 85000,
      images: ['/images/ap-offshore.jpg'],
    },
    status: 'open',
    totalShares: 100,
    sharesSold: 80,
    sharePriceUSD: 850,
    targetAmountUSD: 85000,
    minBuyInUSD: 850,
    projectedROI: 1.18,
    maxInvestors: 30,
    participants: [],
  },
  {
    _id: 'pool_003',
    title: 'Richard Mille RM 027',
    asset: {
      model: 'RM 027',
      brand: 'Richard Mille',
      priceUSD: 800000,
      images: ['/images/rm-027.jpg'],
    },
    status: 'open',
    totalShares: 100,
    sharesSold: 30,
    sharePriceUSD: 8000,
    targetAmountUSD: 800000,
    minBuyInUSD: 8000,
    projectedROI: 1.35,
    maxInvestors: 80,
    participants: [],
  },
  {
    _id: 'pool_004',
    title: 'Cartier Crash London',
    asset: {
      model: 'Crash London',
      brand: 'Cartier',
      priceUSD: 280000,
      images: ['/images/cartier-crash.jpg'],
    },
    status: 'open',
    totalShares: 100,
    sharesSold: 45,
    sharePriceUSD: 2800,
    targetAmountUSD: 280000,
    minBuyInUSD: 2800,
    projectedROI: 1.22,
    maxInvestors: 40,
    participants: [],
  },
];

export default function Home() {
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [showWaveScene, setShowWaveScene] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  // Horizontal scroller refs
  const watchScrollerRef = useRef<HTMLDivElement>(null);
  const poolScrollerRef = useRef<HTMLDivElement>(null);

  // Scroll handlers for horizontal scrollers
  const scrollLeft = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollBy({ left: -340, behavior: 'smooth' });
    }
  };

  const scrollRight = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollBy({ left: 340, behavior: 'smooth' });
    }
  };

  // Delayed WaveScene load for performance
  useEffect(() => {
    const timeout = setTimeout(() => setShowWaveScene(true), 500);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch NFTs
  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const res = await fetch('/api/nft/holders');
        const data = await res.json();
        const enriched = await Promise.all(
          data.slice(0, 6).map(async (nft: any) => {
            try {
              const meta = await fetch(`https://ipfs.io/ipfs/${nft.fileCid}`);
              const metaData = await meta.json();
              return {
                ...nft,
                image: metaData.image,
                title: metaData.name || 'Untitled Watch',
                attributes: metaData.attributes,
              };
            } catch {
              return { ...nft, image: '', title: 'Untitled Watch' };
            }
          })
        );
        setFeaturedNFTs([...enriched, ...enriched]);
      } catch (err) {
        console.error('Failed to load NFTs', err);
      }
    };
    fetchFeatured();
  }, []);

  // Fetch Pools
  useEffect(() => {
    const fetchPools = async () => {
      try {
        const res = await fetch('/api/pool/list?status=open&limit=6');
        if (res.ok) {
          const data = await res.json();
          if (data.pools && data.pools.length > 0) {
            setPools(data.pools);
          } else {
            setPools(MOCK_POOLS);
          }
        } else {
          setPools(MOCK_POOLS);
        }
      } catch {
        setPools(MOCK_POOLS);
      }
    };
    fetchPools();
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
                <Link href="/watchMarket" className={styles.heroPrimary}>
                  Browse Market
                </Link>
                <Link href="/sellerDashboard" className={styles.heroSecondary}>
                  List Your Watch
                </Link>
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

        {/* FEATURED WATCHES HORIZONTAL SCROLLER */}
        <section className={styles.horizontalSection}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <span className={styles.sectionTag}>Featured</span>
              <h2>Available Watches</h2>
              <p className={styles.sectionSubtitle}>
                Authenticated luxury timepieces ready for purchase
              </p>
            </div>
            <div className={styles.scrollControls}>
              <button
                className={styles.scrollBtn}
                onClick={() => scrollLeft(watchScrollerRef)}
                aria-label="Scroll left"
              >
                <FaChevronLeft />
              </button>
              <button
                className={styles.scrollBtn}
                onClick={() => scrollRight(watchScrollerRef)}
                aria-label="Scroll right"
              >
                <FaChevronRight />
              </button>
              <Link href="/watchMarket" className={styles.viewAllLink}>
                View All <FaArrowRight />
              </Link>
            </div>
          </div>
          <div className={styles.horizontalScroller} ref={watchScrollerRef}>
            {featuredNFTs.slice(0, 8).map((nft, i) => (
              <motion.div
                key={`featured-${nft.nftId}-${i}`}
                className={styles.scrollerCard}
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                viewport={{ once: true }}
                onClick={() => setSelectedNFT(nft)}
              >
                <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
              </motion.div>
            ))}
            {featuredNFTs.length === 0 && (
              <div className={styles.emptyScroller}>
                <p>Loading watches...</p>
              </div>
            )}
          </div>
        </section>

        {/* INVESTMENT POOLS HORIZONTAL SCROLLER */}
        <section className={styles.horizontalSection}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <span className={styles.sectionTag}>Investment</span>
              <h2>Active Pools</h2>
              <p className={styles.sectionSubtitle}>
                Fractional ownership opportunities with projected returns
              </p>
            </div>
            <div className={styles.scrollControls}>
              <button
                className={styles.scrollBtn}
                onClick={() => scrollLeft(poolScrollerRef)}
                aria-label="Scroll left"
              >
                <FaChevronLeft />
              </button>
              <button
                className={styles.scrollBtn}
                onClick={() => scrollRight(poolScrollerRef)}
                aria-label="Scroll right"
              >
                <FaChevronRight />
              </button>
              <Link href="/pools" className={styles.viewAllLink}>
                View All <FaArrowRight />
              </Link>
            </div>
          </div>
          <div className={styles.horizontalScroller} ref={poolScrollerRef}>
            {pools.map((pool, i) => {
              const fundingPercent = Math.round((pool.sharesSold / pool.totalShares) * 100);
              const imageUrl =
                pool.asset?.images?.[0] ||
                pool.asset?.imageIpfsUrls?.[0] ||
                '/images/purpleLGG.png';
              const isDemo = pool._id.startsWith('pool_');
              return (
                <motion.div
                  key={pool._id}
                  className={styles.poolScrollCard}
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                  viewport={{ once: true }}
                >
                  {isDemo && <span className={styles.demoBadge}>Demo</span>}
                  <div className={styles.poolScrollImage}>
                    <img
                      src={imageUrl}
                      alt={pool.title || pool.asset?.model}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                      }}
                    />
                    <span className={styles.poolBrandTag}>{pool.asset?.brand}</span>
                  </div>
                  <div className={styles.poolScrollContent}>
                    <h4>{pool.title || pool.asset?.model}</h4>
                    <div className={styles.poolProgressBar}>
                      <div
                        className={styles.poolProgressFill}
                        style={{ width: `${fundingPercent}%` }}
                      />
                    </div>
                    <div className={styles.poolProgressLabel}>
                      <span>{fundingPercent}% Funded</span>
                      <span>
                        ${((pool.sharesSold * pool.sharePriceUSD) / 1000).toFixed(0)}K / $
                        {(pool.targetAmountUSD / 1000).toFixed(0)}K
                      </span>
                    </div>
                    <div className={styles.poolScrollStats}>
                      <div className={styles.poolStatItem}>
                        <BiTargetLock />
                        <span>${pool.sharePriceUSD.toLocaleString()}/share</span>
                      </div>
                      <div className={styles.poolStatItem}>
                        <FaChartLine />
                        <span>+{((pool.projectedROI - 1) * 100).toFixed(0)}% ROI</span>
                      </div>
                    </div>
                    <Link href={`/pool/${pool._id}`} className={styles.poolInvestBtn}>
                      Invest Now
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* QUICK SHOP GRID */}
        <section className={styles.quickShopSection}>
          <div className={styles.quickShopHeader}>
            <FaGem className={styles.quickShopIcon} />
            <h2>Shop Now</h2>
            <p className={styles.sectionSubtitle}>
              Start your collection with these verified timepieces
            </p>
          </div>
          <div className={styles.quickShopGrid}>
            {featuredNFTs.slice(0, 4).map((nft, i) => {
              const brand =
                nft.attributes?.find((a) => a.trait_type === 'Brand')?.value || 'Luxury';
              return (
                <motion.div
                  key={`shop-${nft.nftId}-${i}`}
                  className={styles.quickShopCard}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  onClick={() => setSelectedNFT(nft)}
                >
                  <div className={styles.quickShopImageWrapper}>
                    <img src={nft.image || '/images/purpleLGG.png'} alt={nft.title} />
                    <span className={styles.quickShopBrand}>{brand}</span>
                  </div>
                  <div className={styles.quickShopInfo}>
                    <h4>{nft.title}</h4>
                    <div className={styles.quickShopPrice}>
                      <SiSolana />
                      <span>{nft.salePrice ? (nft.salePrice / 1e9).toFixed(1) : 'TBD'} SOL</span>
                    </div>
                    <button className={styles.quickBuyBtn}>View Details</button>
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className={styles.quickShopCta}>
            <Link href="/watchMarket" className={styles.heroPrimary}>
              Browse Full Marketplace
            </Link>
          </div>
        </section>

        {/* ESCROW FLOW */}
        <section className={styles.escrowSection}>
          <div className={styles.escrowHeader}>
            <span className={styles.escrowTag}>Security</span>
            <h2>How We Protect You</h2>
            <p className={styles.sectionSubtitle}>
              On-chain escrow. Verified provenance. Real luxury.
            </p>
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
                  viewport={{ once: true, margin: '-50px' }}
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

        {/* ENHANCED FOOTER INFO */}
        <section className={styles.footerInfo}>
          <div className={styles.footerGrid}>
            <div className={styles.footerCol}>
              <h3>Marketplace</h3>
              <ul>
                <li>
                  <Link href="/watchMarket">Browse Watches</Link>
                </li>
                <li>
                  <Link href="/pools">Investment Pools</Link>
                </li>
                <li>
                  <Link href="/vendors">Verified Dealers</Link>
                </li>
                <li>
                  <Link href="/learnMore">How It Works</Link>
                </li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h3>For Dealers</h3>
              <ul>
                <li>
                  <Link href="/sellerDashboard">Seller Dashboard</Link>
                </li>
                <li>
                  <Link href="/vendorOnboarding">Become a Dealer</Link>
                </li>
                <li>
                  <Link href="/learnMore#fees">Fee Structure</Link>
                </li>
              </ul>
            </div>
            <div className={styles.footerCol}>
              <h3>Resources</h3>
              <ul>
                <li>
                  <Link href="/learnMore">Learn More</Link>
                </li>
                <li>
                  <Link href="/learnMore#escrow">Escrow Security</Link>
                </li>
                <li>
                  <Link href="/learnMore#provenance">Provenance</Link>
                </li>
              </ul>
            </div>
            <div className={styles.footerColCta}>
              <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.footerLogo} />
              <p>Luxury Timepieces. On-Chain.</p>
              <div className={styles.footerButtons}>
                <Link href="/watchMarket" className={styles.primaryButton}>
                  Explore Marketplace
                </Link>
                <Link href="/sellerDashboard" className={styles.ghostButton}>
                  Become a Dealer
                </Link>
              </div>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <div className={styles.footerPartners}>
              <span>Powered by</span>
              <img src="/images/solana-logo.svg" alt="Solana" />
              <img src="/images/helius-logo.svg" alt="Helius" />
              <img src="/images/bags-icon.png" alt="Bags" />
            </div>
            <p className={styles.footerCopy}>&copy; 2024 LuxHub. All rights reserved.</p>
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
