import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Head from 'next/head';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  FaShieldAlt,
  FaLock,
  FaArrowRight,
  FaChartLine,
  FaGem,
  FaCheckCircle,
  FaPlay,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { BiTargetLock } from 'react-icons/bi';
import { MdWatch, MdVerified } from 'react-icons/md';
import { HiSparkles, HiCube } from 'react-icons/hi2';
import Footer from '../components/common/Footer';
import styles from '../styles/IndexSkill.module.css';

// Dynamic imports
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

// Stats data
const liveStats = [
  { label: 'Total Volume', value: '$2.4M+', suffix: '' },
  { label: 'Verified Watches', value: '127', suffix: '+' },
  { label: 'Active Pools', value: '12', suffix: '' },
  { label: 'Avg ROI', value: '24', suffix: '%' },
];

// Features data
const features = [
  {
    icon: MdVerified,
    title: 'Verified Authenticity',
    desc: 'Every timepiece authenticated by certified experts before minting',
  },
  {
    icon: FaLock,
    title: 'Secure Escrow',
    desc: 'Funds locked in smart contracts until delivery confirmation',
  },
  {
    icon: HiCube,
    title: 'Fractional Ownership',
    desc: 'Own shares of premium watches starting from $500',
  },
  {
    icon: FaChartLine,
    title: 'Real-Time Analytics',
    desc: 'Track your portfolio performance and market trends',
  },
];

// Process steps
const processSteps = [
  {
    num: '01',
    title: 'Submit',
    desc: 'Upload your watch with documentation and provenance records',
    icon: MdWatch,
  },
  {
    num: '02',
    title: 'Authenticate',
    desc: 'Our experts verify authenticity and condition',
    icon: FaShieldAlt,
  },
  {
    num: '03',
    title: 'Mint & List',
    desc: 'NFT minted on Solana with full metadata',
    icon: HiSparkles,
  },
  {
    num: '04',
    title: 'Trade',
    desc: 'Buy, sell, or fractionalize with escrow protection',
    icon: FaLock,
  },
];

// Mock featured watches
const MOCK_WATCHES = [
  {
    id: '1',
    title: 'Rolex Daytona Rainbow',
    brand: 'Rolex',
    price: 185000,
    image: '/images/rolex-daytona-rainbow.jpg',
    verified: true,
    year: 2023,
  },
  {
    id: '2',
    title: 'AP Royal Oak Offshore',
    brand: 'Audemars Piguet',
    price: 85000,
    image: '/images/ap-offshore.jpg',
    verified: true,
    year: 2022,
  },
  {
    id: '3',
    title: 'Richard Mille RM 027',
    brand: 'Richard Mille',
    price: 450000,
    image: '/images/rm-027.jpg',
    verified: true,
    year: 2024,
  },
  {
    id: '4',
    title: 'Patek Philippe Nautilus',
    brand: 'Patek Philippe',
    price: 125000,
    image: '/images/purpleLGG.png',
    verified: true,
    year: 2023,
  },
];

// Mock pools
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

export default function IndexSkill() {
  const [show3DScene, setShow3DScene] = useState(false);
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [pools, setPools] = useState<Pool[]>(MOCK_POOLS);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parallax scroll
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);

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

  // Mouse tracking for glass effects
  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Delayed 3D scene load
  useEffect(() => {
    const timeout = setTimeout(() => setShow3DScene(true), 600);
    return () => clearTimeout(timeout);
  }, []);

  // Fetch NFTs
  useEffect(() => {
    const fetchNFTs = async () => {
      try {
        const res = await fetch('/api/nft/holders');
        const data = await res.json();
        const enriched = await Promise.all(
          data.slice(0, 6).map(async (nft: NFT) => {
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
      }
    };
    fetchNFTs();
  }, []);

  // Fetch pools
  useEffect(() => {
    const fetchPools = async () => {
      try {
        const res = await fetch('/api/pool/list?status=open&limit=3');
        if (res.ok) {
          const data = await res.json();
          if (data.pools && data.pools.length > 0) {
            setPools(data.pools);
          }
        }
      } catch {
        // Use mock data
      }
    };
    fetchPools();
  }, []);

  return (
    <>
      <Head>
        <title>LuxHub | Authenticated Luxury On-Chain</title>
        <meta
          name="description"
          content="NFT-backed luxury timepieces with verified provenance, secure escrow, and fractional ownership on Solana."
        />
      </Head>

      <div className={styles.pageWrapper}>
        {/* Ambient particles */}
        <canvas ref={canvasRef} className={styles.particleCanvas} />

        {/* Gradient mesh background */}
        <div className={styles.gradientMesh} />

        {/* ===== HERO SECTION ===== */}
        <motion.section
          ref={heroRef}
          className={styles.heroSection}
          style={{ opacity: heroOpacity, scale: heroScale }}
        >
          {/* 3D Background */}
          <div className={styles.hero3DContainer}>{show3DScene && <HeroScene />}</div>

          {/* Glass overlay panels */}
          <div className={styles.heroGlassOverlay}>
            <motion.div
              className={styles.floatingGlassPanel}
              initial={{ opacity: 0, x: -100 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.3 }}
              style={{
                transform: `translate(${mousePosition.x * 0.01}px, ${mousePosition.y * 0.01}px)`,
              }}
            />
            <motion.div
              className={`${styles.floatingGlassPanel} ${styles.panelAlt}`}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{
                transform: `translate(${-mousePosition.x * 0.008}px, ${mousePosition.y * 0.012}px)`,
              }}
            />
          </div>

          {/* Hero content */}
          <div className={styles.heroContent}>
            <motion.div
              className={styles.heroBadge}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <SiSolana className={styles.badgeIcon} />
              <span>Built on Solana</span>
              <div className={styles.badgePulse} />
            </motion.div>

            <motion.h1
              className={styles.heroTitle}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <span className={styles.titleLine}>Authenticated</span>
              <span className={styles.titleAccent}>Luxury</span>
              <span className={styles.titleLine}>On-Chain</span>
            </motion.h1>

            <motion.p
              className={styles.heroSubtitle}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              NFT-backed timepieces with verified provenance, secure escrow, and fractional
              ownership. The future of luxury asset trading.
            </motion.p>

            <motion.div
              className={styles.heroActions}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              <Link href="/watchMarket" className={styles.primaryBtn}>
                <span>Explore Marketplace</span>
                <FaArrowRight />
                <div className={styles.btnShine} />
              </Link>
              <Link href="/pools" className={styles.glassBtn}>
                <FaPlay className={styles.playIcon} />
                <span>View Pools</span>
              </Link>
            </motion.div>

            {/* Quick stats - simple inline like index.tsx */}
            <motion.div
              className={styles.statsRibbon}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.8 }}
            >
              <div className={styles.statCard}>
                <span className={styles.statValue}>$2M+</span>
                <span className={styles.statLabel}>Volume</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statCard}>
                <span className={styles.statValue}>100+</span>
                <span className={styles.statLabel}>Watches</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statCard}>
                <span className={styles.statValue}>&lt;400ms</span>
                <span className={styles.statLabel}>Finality</span>
              </div>
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <div className={styles.scrollCue}>
            <span className={styles.scrollText}>Scroll to explore</span>
            <div className={styles.scrollLine}>
              <div className={styles.scrollDot} />
            </div>
          </div>
        </motion.section>

        {/* ===== FEATURES SECTION ===== */}
        <section className={styles.featuresSection}>
          <div className={styles.sectionHeader}>
            <motion.span
              className={styles.sectionLabel}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Why LuxHub
            </motion.span>
            <motion.h2
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Trust Built Into Every Transaction
            </motion.h2>
          </div>

          <div className={styles.featuresGrid}>
            {features.map((feature, i) => {
              const IconComponent = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  className={styles.featureCard}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <div className={styles.featureGlass}>
                    <div className={styles.featureIconWrap}>
                      <IconComponent />
                    </div>
                    <h3>{feature.title}</h3>
                    <p>{feature.desc}</p>
                    <div className={styles.featureShine} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ===== FEATURED WATCHES SECTION ===== */}
        <section className={styles.watchesSection}>
          <div className={styles.watchesBg} />

          <div className={styles.sectionHeader}>
            <motion.span
              className={styles.sectionLabel}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Marketplace
            </motion.span>
            <motion.h2
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Featured Timepieces
            </motion.h2>
          </div>

          <div className={styles.watchesGrid}>
            {(featuredNFTs.length > 0
              ? featuredNFTs.map((nft) => ({
                  id: nft.nftId,
                  title: nft.title || 'Luxury Watch',
                  brand: nft.attributes?.find((a) => a.trait_type === 'Brand')?.value || 'Premium',
                  price: nft.salePrice,
                  image: nft.image || '/images/purpleLGG.png',
                  verified: true,
                  year: 2024,
                }))
              : MOCK_WATCHES
            ).map((watch, i) => (
              <motion.div
                key={watch.id}
                className={styles.watchCard}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                <div className={styles.watchImageWrap}>
                  <img
                    src={watch.image}
                    alt={watch.title}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                    }}
                  />
                  <div className={styles.watchImageOverlay}>
                    <span className={styles.watchBrand}>{watch.brand}</span>
                    {watch.verified && (
                      <span className={styles.verifiedBadge}>
                        <FaCheckCircle /> Verified
                      </span>
                    )}
                  </div>
                  <div className={styles.watchHoverActions}>
                    <Link href={`/watch/${watch.id}`} className={styles.watchViewBtn}>
                      View Details
                    </Link>
                  </div>
                </div>
                <div className={styles.watchInfo}>
                  <h4>{watch.title}</h4>
                  <div className={styles.watchMeta}>
                    <span className={styles.watchYear}>{watch.year}</span>
                    <span className={styles.watchPrice}>
                      <SiSolana /> {watch.price.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className={styles.watchCardShine} />
              </motion.div>
            ))}
          </div>

          <motion.div
            className={styles.viewAllWrap}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Link href="/watchMarket" className={styles.viewAllBtn}>
              <span>Browse All Watches</span>
              <FaArrowRight />
            </Link>
          </motion.div>
        </section>

        {/* ===== PROCESS SECTION ===== */}
        <section className={styles.processSection}>
          <div className={styles.processBg} />

          <div className={styles.sectionHeader}>
            <motion.span
              className={styles.sectionLabel}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              How It Works
            </motion.span>
            <motion.h2
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              From Wrist to Wallet in Four Steps
            </motion.h2>
          </div>

          <div className={styles.processTimeline}>
            {processSteps.map((step, i) => {
              const IconComponent = step.icon;
              return (
                <motion.div
                  key={step.num}
                  className={styles.processStep}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -50 : 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: i * 0.15 }}
                >
                  <div className={styles.stepConnector}>
                    <div className={styles.stepLine} />
                    <div className={styles.stepNode}>
                      <span>{step.num}</span>
                    </div>
                    {i < processSteps.length - 1 && <div className={styles.stepLine} />}
                  </div>
                  <div className={styles.stepCard}>
                    <div className={styles.stepIcon}>
                      <IconComponent />
                    </div>
                    <h4>{step.title}</h4>
                    <p>{step.desc}</p>
                    <div className={styles.stepGlow} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* ===== POOLS SECTION ===== */}
        <section className={styles.poolsSection}>
          <div className={styles.sectionHeader}>
            <motion.span
              className={styles.sectionLabel}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Investment Pools
            </motion.span>
            <motion.h2
              className={styles.sectionTitle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Own a Piece of Luxury
            </motion.h2>
            <motion.p
              className={styles.sectionDesc}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Fractional ownership lets you invest in premium timepieces with as little as $500
            </motion.p>
          </div>

          <div className={styles.poolsGrid}>
            {pools.map((pool, i) => {
              const fundingPercent = Math.round((pool.sharesSold / pool.totalShares) * 100);
              const imageUrl =
                pool.asset?.images?.[0] ||
                pool.asset?.imageIpfsUrls?.[0] ||
                '/images/purpleLGG.png';

              return (
                <motion.div
                  key={pool._id}
                  className={styles.poolCard}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                >
                  <div className={styles.poolGlass}>
                    <div className={styles.poolImageWrap}>
                      <img
                        src={imageUrl}
                        alt={pool.title || pool.asset?.model}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                        }}
                      />
                      <div className={styles.poolImageOverlay}>
                        <span className={styles.poolBrand}>{pool.asset?.brand}</span>
                        <span className={styles.poolRoi}>
                          <FaChartLine /> +{((pool.projectedROI - 1) * 100).toFixed(0)}% ROI
                        </span>
                      </div>
                    </div>

                    <div className={styles.poolContent}>
                      <h4>{pool.title || pool.asset?.model}</h4>

                      <div className={styles.poolProgress}>
                        <div className={styles.poolProgressBar}>
                          <div
                            className={styles.poolProgressFill}
                            style={{ width: `${fundingPercent}%` }}
                          />
                        </div>
                        <div className={styles.poolProgressLabels}>
                          <span className={styles.poolPercent}>{fundingPercent}% Funded</span>
                          <span className={styles.poolAmount}>
                            ${((pool.sharesSold * pool.sharePriceUSD) / 1000).toFixed(0)}K / $
                            {(pool.targetAmountUSD / 1000).toFixed(0)}K
                          </span>
                        </div>
                      </div>

                      <div className={styles.poolStats}>
                        <div className={styles.poolStat}>
                          <BiTargetLock />
                          <span>${pool.sharePriceUSD.toLocaleString()}/share</span>
                        </div>
                        <div className={styles.poolStat}>
                          <FaGem />
                          <span>{pool.totalShares - pool.sharesSold} left</span>
                        </div>
                      </div>

                      <Link href={`/pool/${pool._id}`} className={styles.poolInvestBtn}>
                        Invest Now
                        <FaArrowRight />
                      </Link>
                    </div>

                    <div className={styles.poolShine} />
                  </div>
                </motion.div>
              );
            })}
          </div>

          <motion.div
            className={styles.viewAllWrap}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <Link href="/pools" className={styles.viewAllBtn}>
              <span>View All Pools</span>
              <FaArrowRight />
            </Link>
          </motion.div>
        </section>

        {/* ===== PARTNERS SECTION ===== */}
        <section className={styles.partnersSection}>
          <motion.p
            className={styles.partnersLabel}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            Powered by Industry Leaders
          </motion.p>

          <motion.div
            className={styles.partnersRow}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <a href="https://squads.xyz" target="_blank" rel="noopener noreferrer">
              <img src="/images/squads-logo.svg" alt="Squads Protocol" />
            </a>
            <a href="https://helius.dev" target="_blank" rel="noopener noreferrer">
              <img src="/images/helius-logo.svg" alt="Helius" />
            </a>
            <a href="https://www.metaplex.com" target="_blank" rel="noopener noreferrer">
              <img src="/images/metaplex-logo.svg" alt="Metaplex" />
            </a>
            <a href="https://www.privy.io" target="_blank" rel="noopener noreferrer">
              <img src="/images/privy-logo.svg" alt="Privy" />
            </a>
            <a href="https://pinata.cloud" target="_blank" rel="noopener noreferrer">
              <img src="/images/ipfs-logo.svg" alt="Pinata IPFS" />
            </a>
          </motion.div>
        </section>

        {/* ===== CTA SECTION ===== */}
        <section className={styles.ctaSection}>
          <div className={styles.ctaGlassCard}>
            <div className={styles.ctaGlow} />
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Ready to Start Your Collection?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              Join the future of authenticated luxury asset ownership on Solana.
            </motion.p>
            <motion.div
              className={styles.ctaActions}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Link href="/watchMarket" className={styles.primaryBtn}>
                <span>Browse Marketplace</span>
                <FaArrowRight />
                <div className={styles.btnShine} />
              </Link>
              <Link href="/sellerDashboard" className={styles.glassBtn}>
                <span>Become a Dealer</span>
              </Link>
            </motion.div>
            <div className={styles.ctaShine} />
          </div>
        </section>
      </div>
    </>
  );
}
