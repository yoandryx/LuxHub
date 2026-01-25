import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  FaShieldAlt,
  FaLock,
  FaArrowRight,
  FaChartLine,
  FaCheckCircle,
  FaClock,
} from 'react-icons/fa';
import { HiCube } from 'react-icons/hi2';
import { MdVerified } from 'react-icons/md';
import { SiSolana } from 'react-icons/si';
import { BiTargetLock } from 'react-icons/bi';
import Footer from '../components/common/Footer';
import NFTCard from '../components/marketplace/NFTCard';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import styles from '../styles/IndexTest.module.css';

// Dynamic imports for 3D/heavy components
const HeroScene = dynamic(() => import('../components/marketplace/HeroScene'), { ssr: false });

// Interfaces
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

// Features data
const features = [
  {
    icon: MdVerified,
    title: 'Verified Authenticity',
    desc: 'Every timepiece authenticated by certified experts',
  },
  {
    icon: FaLock,
    title: 'Secure Escrow',
    desc: 'Funds locked until delivery confirmation',
  },
  {
    icon: HiCube,
    title: 'Fractional Ownership',
    desc: 'Own shares of premium watches from $500',
  },
  {
    icon: FaChartLine,
    title: 'Real-Time Analytics',
    desc: 'Track portfolio performance and trends',
  },
];

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
];

export default function IndexTest() {
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [show3DScene, setShow3DScene] = useState(false);
  const [activeTab, setActiveTab] = useState<'watches' | 'pools'>('watches');
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(true);
  const [isLoadingPools, setIsLoadingPools] = useState(false);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Floating particles animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      opacity: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 161, 255, ${p.opacity})`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Delayed 3D scene load for performance
  useEffect(() => {
    const sceneTimeout = setTimeout(() => setShow3DScene(true), 500);
    return () => clearTimeout(sceneTimeout);
  }, []);

  // Fetch NFTs on initial load
  useEffect(() => {
    const fetchNFTs = async () => {
      setIsLoadingNFTs(true);
      try {
        const res = await fetch('/api/nft/holders');
        const data = await res.json();
        const enriched = await Promise.all(
          data.slice(0, 8).map(async (nft: NFT) => {
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
        setFeaturedNFTs(enriched);
      } catch (err) {
        console.error('Failed to load NFTs', err);
      } finally {
        setIsLoadingNFTs(false);
      }
    };
    fetchNFTs();
  }, []);

  // Lazy-fetch Pools when tab switches
  useEffect(() => {
    if (activeTab === 'pools' && pools.length === 0) {
      const fetchPools = async () => {
        setIsLoadingPools(true);
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
        } finally {
          setIsLoadingPools(false);
        }
      };
      fetchPools();
    }
  }, [activeTab, pools.length]);

  // Render skeleton loading cards
  const renderSkeletonCards = (count: number) => (
    <>
      {Array(count)
        .fill(0)
        .map((_, i) => (
          <div key={`skeleton-${i}`} className={styles.skeletonCard}>
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonContent}>
              <div className={styles.skeletonTitle} />
              <div className={styles.skeletonPrice} />
            </div>
          </div>
        ))}
    </>
  );

  return (
    <div className={styles.container}>
      {/* Ambient floating particles */}
      <canvas ref={canvasRef} className={styles.particleCanvas} />

      {/* ===== NAVBAR ===== */}
      {/* <Navbar /> */}

      {/* ===== MAIN CONTENT WRAPPER ===== */}
      <div className={styles.wrapper}>
        {/* ===== HERO SECTION - Split Layout ===== */}
        <section className={styles.heroSection}>
          <div className={styles.hero3DBackground}>{show3DScene && <HeroScene />}</div>

          {/* Left side - Text content */}
          <div className={styles.heroContent}>
            <motion.div
              className={styles.heroBadge}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <SiSolana />
              <span>Powered by Solana</span>
            </motion.div>

            <motion.h1
              className={styles.heroTitle}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              Authenticated
              <br />
              <span className={styles.heroTitleAccent}>Luxury</span>
              <br />
              On-Chain
            </motion.h1>

            <motion.p
              className={styles.heroSubtitle}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              NFT-backed luxury timepieces with verified provenance, secure escrow, and fractional
              ownership.
            </motion.p>

            <motion.div
              className={styles.heroButtons}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              <Link href="/watchMarket" className={styles.primaryBtn}>
                Explore Marketplace
                <FaArrowRight />
              </Link>
              <Link href="/pools" className={styles.secondaryBtn}>
                View Pools
              </Link>
            </motion.div>

            {/* Security & Features Stats */}
            <motion.div
              className={styles.heroStats}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>Full or Fractional</span>
                <span className={styles.heroStatLabel}>Ownership</span>
              </div>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>Multisig</span>
                <span className={styles.heroStatLabel}>Secured</span>
              </div>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>Escrow</span>
                <span className={styles.heroStatLabel}>Protected</span>
              </div>
              <div className={styles.heroStatDivider} />
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>On-Chain</span>
                <span className={styles.heroStatLabel}>Provenance</span>
              </div>
            </motion.div>
          </div>

          <div className={styles.scrollIndicator}>
            <span />
          </div>
        </section>

        {/* ===== FEATURES GLASS CARDS ===== */}
        <section className={styles.featuresSection}>
          <motion.div
            className={styles.featuresHeader}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <h2 className={styles.featuresTitle}>Why LuxHub</h2>
          </motion.div>
          <div className={styles.featuresGrid}>
            {features.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={index}
                  className={styles.featureCard}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <div className={styles.featureShine} />
                  <div className={styles.featureIcon}>
                    <IconComponent />
                  </div>
                  <div className={styles.featureText}>
                    <h4>{feature.title}</h4>
                    <p>{feature.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ===== MARKETPLACE SHOWCASE - Tabbed ===== */}
        <section className={styles.showcaseSection}>
          <div className={styles.showcaseHeader}>
            <div>
              <span className={styles.sectionBadge}>Marketplace</span>
              <h2 className={styles.sectionTitle}>Browse & Invest</h2>
            </div>
            <div className={styles.tabSwitcher}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'watches' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('watches')}
              >
                <FaClock className={styles.tabIcon} />
                <span>Watches</span>
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'pools' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('pools')}
              >
                <FaChartLine className={styles.tabIcon} />
                <span>Investment Pools</span>
              </button>
            </div>
          </div>

          <div className={styles.scroller}>
            {activeTab === 'watches' ? (
              <>
                {isLoadingNFTs ? (
                  renderSkeletonCards(4)
                ) : featuredNFTs.length > 0 ? (
                  featuredNFTs.map((nft, i) => (
                    <motion.div
                      key={`nft-${nft.nftId}-${i}`}
                      className={styles.nftScrollCard}
                      initial={{ opacity: 0, y: 30, scale: 0.95 }}
                      whileInView={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
                      viewport={{ once: true, margin: '-50px' }}
                    >
                      <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                    </motion.div>
                  ))
                ) : (
                  <div className={styles.emptyState}>No timepieces available</div>
                )}
              </>
            ) : (
              <>
                {isLoadingPools ? (
                  renderSkeletonCards(4)
                ) : pools.length > 0 ? (
                  pools.map((pool, i) => {
                    const fundingPercent = Math.round((pool.sharesSold / pool.totalShares) * 100);
                    const imageUrl =
                      pool.asset?.images?.[0] ||
                      pool.asset?.imageIpfsUrls?.[0] ||
                      '/images/purpleLGG.png';
                    const isDemo = pool._id.startsWith('pool_');

                    return (
                      <motion.div
                        key={pool._id}
                        className={styles.poolCard}
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        whileInView={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.5, delay: i * 0.1, ease: 'easeOut' }}
                        viewport={{ once: true, margin: '-50px' }}
                      >
                        {isDemo && <span className={styles.poolDemoBadge}>Demo</span>}
                        <div className={styles.poolImage}>
                          <img
                            src={imageUrl}
                            alt={pool.title || pool.asset?.model}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                            }}
                          />
                          <span className={styles.poolBrandTag}>{pool.asset?.brand}</span>
                        </div>
                        <div className={styles.poolContent}>
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
                          <div className={styles.poolStats}>
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
                  })
                ) : (
                  <div className={styles.emptyState}>No pools available</div>
                )}
              </>
            )}
          </div>

          <div className={styles.viewAllContainer}>
            <Link
              href={activeTab === 'watches' ? '/watchMarket' : '/pools'}
              className={styles.viewAllLink}
            >
              View All {activeTab === 'watches' ? 'Watches' : 'Pools'} <FaArrowRight />
            </Link>
          </div>
        </section>

        {/* ===== CTA SECTION ===== */}
        <section className={styles.ctaSection}>
          <motion.div
            className={styles.ctaCard}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <h2>Start Your Collection</h2>
            <p>Join the future of authenticated luxury asset ownership on Solana.</p>
            <div className={styles.ctaButtons}>
              <Link href="/watchMarket" className={styles.primaryBtn}>
                Browse Marketplace
                <FaArrowRight />
              </Link>
              <Link href="/sellerDashboard" className={styles.secondaryBtn}>
                Become a Dealer
              </Link>
            </div>
          </motion.div>
        </section>

        {/* ===== TRUST FOOTER - Stats & Partners ===== */}
        <section className={styles.trustFooter}>
          <div className={styles.trustStats}>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>&lt;$0.01</span>
              <span className={styles.statLabel}>Gas Fees</span>
            </motion.div>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>Verified</span>
              <span className={styles.statLabel}>Vendors</span>
            </motion.div>
            <motion.div
              className={styles.trustStat}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <span className={styles.statValue}>&lt;400ms</span>
              <span className={styles.statLabel}>Settlement</span>
            </motion.div>
          </div>

          <div className={styles.poweredBy}>
            <span className={styles.poweredLabel}>Powered by</span>
            <div className={styles.partnerLogos}>
              <a href="https://squads.xyz" target="_blank" rel="noopener noreferrer">
                <img src="/images/Squads Logomark White.svg" alt="Squads" />
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer">
                <img src="/images/helius-logo.svg" alt="Helius" />
              </a>
              <a href="https://www.metaplex.com" target="_blank" rel="noopener noreferrer">
                <img src="/images/metaplex-logo.svg" alt="Metaplex" />
              </a>
              <a href="https://www.privy.io" target="_blank" rel="noopener noreferrer">
                <img src="/images/Privy_Brandmark_White.png" alt="Privy" />
              </a>
            </div>
          </div>
        </section>
      </div>
      {/* End of wrapper */}

      {/* ===== FOOTER ===== */}
      {/* <Footer /> */}

      {/* ===== NFT DETAIL MODAL ===== */}
      {selectedNFT && (
        <div className={styles.detailOverlay} onClick={() => setSelectedNFT(null)}>
          <div className={styles.detailContainer} onClick={(e) => e.stopPropagation()}>
            <NftDetailCard
              mintAddress={selectedNFT.nftId}
              onClose={() => setSelectedNFT(null)}
              showContactButton
            />
          </div>
        </div>
      )}
    </div>
  );
}
