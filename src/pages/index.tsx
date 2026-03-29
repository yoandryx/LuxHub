import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffectiveWallet } from '../hooks/useEffectiveWallet';
import { FaLock, FaArrowRight, FaChartLine } from 'react-icons/fa';
import { HiCube } from 'react-icons/hi2';
import { MdVerified } from 'react-icons/md';
import { SiSolana } from 'react-icons/si';
import WalletAwareness from '../components/common/WalletAwareness';
import Footer from '../components/common/Footer';
import NFTCard from '../components/marketplace/NFTCard';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import { useSolPrice } from '../hooks/useSWR';
import styles from '../styles/IndexTest.module.css';

// Dynamic imports for modals (bundle optimization)
const BuyModal = dynamic(() => import('../components/marketplace/BuyModal'), { ssr: false });
const MakeOfferModal = dynamic(() => import('../components/marketplace/MakeOfferModal'), {
  ssr: false,
});

// Interfaces
interface NFT {
  nftId: string;
  mintAddress?: string;
  escrowPda?: string;
  fileCid?: string;
  salePrice?: number;
  listingPrice?: number;
  listingPriceUSD?: number;
  timestamp: number;
  seller: string;
  buyer?: string;
  marketStatus: string;
  image?: string;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  title?: string;
  priceUSD?: number;
  acceptingOffers?: boolean;
  minimumOfferUSD?: number;
  vendor?: {
    businessName?: string;
    username?: string;
    verified?: boolean;
  };
  attributes?: { trait_type: string; value: string }[];
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
    title: 'Tokenized Pools',
    desc: 'Participate in premium watch pools from $500',
  },
  {
    icon: FaChartLine,
    title: 'Real-Time Analytics',
    desc: 'Track portfolio performance and trends',
  },
];

export default function IndexTest() {
  const { connected } = useEffectiveWallet();
  const { price: solPrice } = useSolPrice();
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(true);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [selectedBuyNFT, setSelectedBuyNFT] = useState<NFT | null>(null);
  const [selectedOfferNFT, setSelectedOfferNFT] = useState<NFT | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const pointerDownRef = useRef(false);
  const dragStartXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const autoScrollSpeed = 0.35; // px per frame
  const DRAG_THRESHOLD = 5; // px before we treat it as a drag

  // Infinite auto-scroll + drag-to-scroll for hero slider
  const resetScrollLoop = useCallback((el: HTMLDivElement) => {
    const half = el.scrollWidth / 2;
    if (el.scrollLeft >= half) {
      el.scrollLeft -= half;
      // Update drag origin so position stays consistent during drag
      scrollStartRef.current -= half;
    } else if (el.scrollLeft <= 0) {
      el.scrollLeft += half;
      scrollStartRef.current += half;
    }
  }, []);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el || featuredNFTs.length === 0) return;

    // Start scrolled past 0 so backward drag wraps correctly
    const half = el.scrollWidth / 2;
    if (half > 0 && el.scrollLeft === 0) {
      el.scrollLeft = 1;
    }

    let rafId: number;
    const tick = () => {
      if (!isDraggingRef.current && !pointerDownRef.current && el) {
        el.scrollLeft += autoScrollSpeed;
        resetScrollLoop(el);
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Detect touch device — use native scroll on mobile, custom drag on desktop
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Touch: pause auto-scroll while touching, reset loop on scroll end
    const onTouchStart = () => {
      pointerDownRef.current = true;
    };
    const onTouchEnd = () => {
      pointerDownRef.current = false;
      resetScrollLoop(el);
    };
    const onScroll = () => {
      resetScrollLoop(el);
    };

    // Mouse drag handlers (desktop only) — threshold so clicks pass through
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      pointerDownRef.current = true;
      isDraggingRef.current = false;
      dragDistanceRef.current = 0;
      dragStartXRef.current = e.clientX;
      scrollStartRef.current = el.scrollLeft;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!pointerDownRef.current) return;
      const dx = e.clientX - dragStartXRef.current;
      dragDistanceRef.current = Math.abs(dx);

      if (!isDraggingRef.current && dragDistanceRef.current > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
        el.style.cursor = 'grabbing';
      }

      if (isDraggingRef.current) {
        e.preventDefault();
        el.scrollLeft = scrollStartRef.current - dx;
        resetScrollLoop(el);
      }
    };
    const onMouseUp = () => {
      pointerDownRef.current = false;
      isDraggingRef.current = false;
      el.style.cursor = 'grab';
    };

    // Block click events that happen right after a drag
    const onClickCapture = (e: MouseEvent) => {
      if (dragDistanceRef.current > DRAG_THRESHOLD) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    if (isTouchDevice) {
      // Mobile: native scroll + touch listeners for auto-scroll pause & loop reset
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchend', onTouchEnd, { passive: true });
      el.addEventListener('scroll', onScroll, { passive: true });
    } else {
      // Desktop: custom mouse drag
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('mouseleave', onMouseUp);
    }
    el.addEventListener('click', onClickCapture, true);

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mouseleave', onMouseUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [featuredNFTs.length, resetScrollLoop]);

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

  // Fetch featured vendor listings (daily-randomized for fair display)
  useEffect(() => {
    const fetchNFTs = async () => {
      setIsLoadingNFTs(true);
      try {
        const res = await fetch('/api/nft/featured?limit=8');
        const data = await res.json();
        setFeaturedNFTs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load featured NFTs', err);
      } finally {
        setIsLoadingNFTs(false);
      }
    };
    fetchNFTs();
  }, []);

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
        {/* ===== HERO SECTION - Centered Layout ===== */}
        <section className={styles.heroSection}>
          {/* Centered hero text content */}
          <div className={styles.heroContent}>
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
              NFT-backed luxury timepieces with verified provenance, secure escrow, and tokenized
              asset pools.
            </motion.p>

            <motion.div
              className={styles.heroButtons}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              <Link href="/marketplace" className={styles.primaryBtn}>
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
                <span className={styles.heroStatValue}>Direct or Pooled</span>
                <span className={styles.heroStatLabel}>Access</span>
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
        </section>

        {/* ===== WALLET AWARENESS - Post-connect capability prompt ===== */}
        <WalletAwareness />

        {/* ===== FEATURED LISTINGS - Infinite Slider ===== */}
        <section className={styles.sliderSection}>
          <div className={styles.sliderHeader}>
            <div>
              <span className={styles.sectionBadge}>Marketplace</span>
              <h2 className={styles.sectionTitle}>Featured Listings</h2>
            </div>
            <Link href="/marketplace" className={styles.viewAllLink}>
              View All <FaArrowRight />
            </Link>
          </div>

          {isLoadingNFTs ? (
            <div className={styles.sliderLoading}>{renderSkeletonCards(4)}</div>
          ) : featuredNFTs.length > 0 ? (
            <div className={styles.heroSlider}>
              <div ref={sliderRef} className={styles.heroSliderTrack}>
                {[...featuredNFTs, ...featuredNFTs].map((nft, i) => (
                  <div key={`slider-${nft.nftId}-${i}`} className={styles.heroSliderCard}>
                    <NFTCard
                      nft={nft}
                      onClick={() => setSelectedNFT(nft)}
                      onQuickBuy={
                        connected && nft.escrowPda ? () => setSelectedBuyNFT(nft) : undefined
                      }
                      onOffer={
                        connected && nft.acceptingOffers && nft.escrowPda
                          ? () => setSelectedOfferNFT(nft)
                          : undefined
                      }
                      acceptingOffers={nft.acceptingOffers}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>No timepieces available</div>
          )}
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
            <h2 className={styles.featuresTitle}>LuxHub Features</h2>
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
            <p>Join the future of authenticated luxury assets on Solana.</p>
            <div className={styles.ctaButtons}>
              <Link href="/marketplace" className={styles.primaryBtn}>
                Browse Marketplace
                <FaArrowRight />
              </Link>
              <Link href="/vendor/apply" className={styles.secondaryBtn}>
                Become a Dealer
              </Link>
            </div>
          </motion.div>
        </section>

        {/* ===== POWERED BY - Partners ===== */}
        <section className={styles.trustFooter}>
          <div className={styles.poweredBy}>
            <span className={styles.poweredLabel}>Powered by</span>
            <Link href="/learnMore" className={styles.viewAllLink}>
              Learn More <FaArrowRight />
            </Link>
            <div className={styles.partnerLogos}>
              <a href="https://squads.xyz" target="_blank" rel="noopener noreferrer">
                <Image src="/images/Squads-logo.png" alt="Squads" width={40} height={40} />
              </a>
              <a href="https://helius.dev" target="_blank" rel="noopener noreferrer">
                <Image src="/images/helius-logo.svg" alt="Helius" width={40} height={40} />
              </a>
              <a href="https://www.metaplex.com" target="_blank" rel="noopener noreferrer">
                <Image src="/images/metaplex-logo.svg" alt="Metaplex" width={40} height={40} />
              </a>
              <a href="https://www.privy.io" target="_blank" rel="noopener noreferrer">
                <Image src="/images/Privy_Brandmark_White.png" alt="Privy" width={40} height={40} />
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
              mintAddress={selectedNFT.mintAddress || selectedNFT.nftId}
              onClose={() => setSelectedNFT(null)}
              previewData={{
                title: selectedNFT.title || 'Untitled',
                image: selectedNFT.image || selectedNFT.imageUrl || '',
                imageUrl: selectedNFT.imageUrl,
                imageIpfsUrls: selectedNFT.imageIpfsUrls,
                images: selectedNFT.images,
                description: selectedNFT.attributes?.find((a) => a.trait_type === 'Description')?.value || '',
                priceSol: selectedNFT.salePrice || 0,
                attributes: selectedNFT.attributes || [],
              }}
              status={selectedNFT.marketStatus === 'listed' ? 'listed' : 'verified'}
              acceptingOffers={selectedNFT.acceptingOffers}
              onBuy={
                connected && selectedNFT.escrowPda
                  ? () => {
                      setSelectedNFT(null);
                      setSelectedBuyNFT(selectedNFT);
                    }
                  : undefined
              }
              onOffer={
                connected && selectedNFT.acceptingOffers && selectedNFT.escrowPda
                  ? () => {
                      setSelectedNFT(null);
                      setSelectedOfferNFT(selectedNFT);
                    }
                  : undefined
              }
              showContactButton
            />
          </div>
        </div>
      )}

      {/* ===== BUY MODAL ===== */}
      {selectedBuyNFT && selectedBuyNFT.escrowPda && (
        <BuyModal
          escrow={{
            escrowPda: selectedBuyNFT.escrowPda,
            listingPrice: selectedBuyNFT.listingPrice || 0,
            listingPriceUSD: selectedBuyNFT.listingPriceUSD || selectedBuyNFT.priceUSD || 0,
            asset: {
              model: selectedBuyNFT.title,
              title: selectedBuyNFT.title,
              imageUrl: selectedBuyNFT.imageUrl || selectedBuyNFT.image,
            },
            vendor: selectedBuyNFT.vendor
              ? { businessName: selectedBuyNFT.vendor.businessName }
              : undefined,
          }}
          solPrice={solPrice || 150}
          onClose={() => setSelectedBuyNFT(null)}
          onSuccess={() => setSelectedBuyNFT(null)}
        />
      )}

      {/* ===== OFFER MODAL ===== */}
      {selectedOfferNFT && selectedOfferNFT.escrowPda && (
        <MakeOfferModal
          escrow={{
            escrowPda: selectedOfferNFT.escrowPda,
            listingPriceUSD: selectedOfferNFT.listingPriceUSD || selectedOfferNFT.priceUSD || 0,
            minimumOfferUSD: selectedOfferNFT.minimumOfferUSD,
            asset: {
              model: selectedOfferNFT.title,
              imageUrl: selectedOfferNFT.imageUrl || selectedOfferNFT.image,
            },
            vendor: selectedOfferNFT.vendor
              ? { businessName: selectedOfferNFT.vendor.businessName }
              : undefined,
          }}
          solPrice={solPrice || 150}
          onClose={() => setSelectedOfferNFT(null)}
          onSuccess={() => setSelectedOfferNFT(null)}
        />
      )}
    </div>
  );
}

// ISR: pre-render homepage at edge, revalidate every 60s
export async function getStaticProps() {
  return { props: {}, revalidate: 60 };
}
