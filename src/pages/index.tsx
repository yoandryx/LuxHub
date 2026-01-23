import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FaShieldAlt, FaLock, FaArrowRight, FaChartLine } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { BiTargetLock } from 'react-icons/bi';
import { MdWatch } from 'react-icons/md';
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

// Flow steps data - simplified to 3 core steps
const flowSteps = [
  {
    num: '01',
    title: 'List',
    desc: 'Submit your timepiece with documentation',
    icon: MdWatch,
  },
  {
    num: '02',
    title: 'Verify',
    desc: 'Admin authenticates and mints on Solana',
    icon: FaShieldAlt,
  },
  {
    num: '03',
    title: 'Trade',
    desc: 'Buy or sell with escrow protection',
    icon: FaLock,
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
      {/* ===== NAVBAR ===== */}
      {/* <Navbar /> */}

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

          {/* Quick stats */}
          <motion.div
            className={styles.heroStats}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>$2M+</span>
              <span className={styles.heroStatLabel}>Volume</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>100+</span>
              <span className={styles.heroStatLabel}>Watches</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatValue}>&lt;400ms</span>
              <span className={styles.heroStatLabel}>Finality</span>
            </div>
          </motion.div>
        </div>

        <div className={styles.scrollIndicator}>
          <span />
        </div>
      </section>

      {/* ===== HOW IT WORKS - 3 Steps ===== */}
      <section className={styles.flowSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionBadge}>How It Works</span>
          <h2 className={styles.sectionTitle}>Simple. Secure. On-Chain.</h2>
        </div>

        <div className={styles.flowDiagram}>
          {flowSteps.map((step, index) => {
            const IconComponent = step.icon;
            return (
              <motion.div
                key={step.num}
                className={styles.flowStep}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.15 }}
                viewport={{ once: true }}
              >
                <div className={styles.flowIcon}>
                  <IconComponent />
                </div>
                <span className={styles.flowNum}>{step.num}</span>
                <h4 className={styles.flowTitle}>{step.title}</h4>
                <p className={styles.flowDesc}>{step.desc}</p>
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
              Watches
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'pools' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('pools')}
            >
              Investment Pools
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

      {/* ===== TRUST FOOTER - Combined Stats, Partners, CTA ===== */}
      <section className={styles.trustFooter}>
        <div className={styles.trustStats}>
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
            <a href="https://squads.xyz" target="_blank" rel="noopener noreferrer">
              <img src="/images/squads-logo.svg" alt="Squads" />
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
              <img src="/images/ipfs-logo.svg" alt="Pinata" />
            </a>
          </div>
        </div>

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

      {/* ===== FOOTER ===== */}
      <Footer />

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
