import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import NFTCard from "../components/marketplace/NFTCard";
import styles from "../styles/Home.module.css";
import ScrollSteps from "../components/common/ScrollSteps";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";
import { motion } from "framer-motion";
const WaveScene = dynamic(() => import("../components/common/WaveScene"), { ssr: false });

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

interface NFTCardProps {
  nft: NFT;
  onClick?: () => void;  // Now optional
}

export default function Home() {
  const [featuredNFTs, setFeaturedNFTs] = useState<NFT[]>([]);
  const [showWaveScene, setShowWaveScene] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);


  const scrollRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const CARD_WIDTH = 340;
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);

  const CARD_HEIGHT = 380; // Adjust if your NFTCard height is different (includes gap)
  const SCROLL_SPEED = 0.5; // Speed of auto-scroll

// Manual scroll (for chevrons)
const scrollVertical = (direction: number) => {
  const offset = direction * CARD_HEIGHT;
  leftColumnRef.current?.scrollBy({ top: -offset, behavior: "smooth" });
  rightColumnRef.current?.scrollBy({ top: offset, behavior: "smooth" });
};

  useEffect(() => {
    const timeout = setTimeout(() => setShowWaveScene(true), 800);
    return () => clearTimeout(timeout);
  }, []);

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

  useEffect(() => {
    if (scrollRef.current && featuredNFTs.length > 0) {
      const totalWidth = scrollRef.current.scrollWidth;
      const viewWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft = totalWidth / 3 - viewWidth / 2;
    }
  }, [featuredNFTs]);

  // useEffect(() => {
  //   if (isHovered || !isVisible) return;

  //   let frame: number;

  //   const animate = () => {
  //     if (!leftColumnRef.current || !rightColumnRef.current) return;

  //     // Left column: scroll UP
  //     leftColumnRef.current.scrollTop -= SCROLL_SPEED;
  //     if (leftColumnRef.current.scrollTop <= 0) {
  //       leftColumnRef.current.scrollTop = leftColumnRef.current.scrollHeight / 2;
  //     }

  //     // Right column: scroll DOWN (opposite)
  //     rightColumnRef.current.scrollTop += SCROLL_SPEED;
  //     if (rightColumnRef.current.scrollTop >= rightColumnRef.current.scrollHeight / 2) {
  //       rightColumnRef.current.scrollTop = 0;
  //     }

  //     frame = requestAnimationFrame(animate);
  //   };

  //   frame = requestAnimationFrame(animate);
  //   return () => cancelAnimationFrame(frame);
  // }, [isHovered, isVisible, featuredNFTs]);

  useEffect(() => {
    if (isHovered || !isVisible || featuredNFTs.length === 0) return;

    let frame: number;
    let lastTime = performance.now();

    // CHANGE THIS to control speed — 30 = very slow & luxurious (recommended)
    const PIXELS_PER_SECOND = 50; // Try 15–50. 30 is perfect for luxury feel

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      const distance = (PIXELS_PER_SECOND * deltaTime) / 1000; // Smooth frame-rate independent movement
      if (!leftColumnRef.current || !rightColumnRef.current) return;

      // Left column: scroll DOWN (inverted)
      leftColumnRef.current.scrollTop += distance;
      if (leftColumnRef.current.scrollTop >= leftColumnRef.current.scrollHeight / 2) {
        leftColumnRef.current.scrollTop -= leftColumnRef.current.scrollHeight / 2;
      }

      // Right column: scroll UP (inverted)
      rightColumnRef.current.scrollTop -= distance;
      if (rightColumnRef.current.scrollTop <= 0) {
        rightColumnRef.current.scrollTop += rightColumnRef.current.scrollHeight / 2;
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frame);
  }, [isHovered, isVisible, featuredNFTs]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
        });
      },
      { threshold: 0.3 }
    );
    observerRef.current.observe(wrapperRef.current);

    return () => {
      if (observerRef.current && wrapperRef.current) {
        observerRef.current.unobserve(wrapperRef.current);
      }
    };
  }, []);

  const scrollByOffset = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  return (
    <>
      <div className={styles.waveBackground}>{showWaveScene && <WaveScene />}</div>

      <div className={styles.container}>

        <section className={styles.rowContent}>
          {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <img src="/images/purpleLGG.png" alt="LuxHub Logo" className={styles.logo} />
            <h1 className={styles.title}>LUXHUB</h1>
            <p className={styles.subtitle}><span>VERIFY. BUY. SELL. Timpieces on solana</span>.</p>
          </div>
        </section>

        {/* FEATURED NFTS */}
        {/* <section className={styles.featuredNFTs}>
          <h2>COLLECTIONS</h2>
          <div
            className={styles.scrollAreaWrapper}
            ref={wrapperRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className={styles.fadeLeft} />
            <div className={styles.fadeRight} />
            <button className={styles.chevronLeft} onClick={() => scrollByOffset(-340)}><SlArrowLeft /></button>
            <button className={styles.chevronRight} onClick={() => scrollByOffset(340)}><SlArrowRight /></button>

            <div className={`${styles.nftScrollWrapper} ${styles.nosnap}`} ref={scrollRef}>
              <div className={styles.nftScrollRow}>
                {featuredNFTs.map((nft, i) => (
                  <div
                    key={`${nft.nftId}-${i}`}
                    className={`${styles.nftCardWrapper} ${activeIndex === i ? styles.activeNFT : ""}`}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section> */}
        {/* VERTICAL DUAL CLOCKWISE SCROLL – REPLACES YOUR OLD HORIZONTAL ONE */}
        <section className={`${styles.featuredNFTs}`}>
          {/* <h2>COLLECTIONS</h2> */}

          <div
            className={styles.verticalClockWrapper}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            ref={wrapperRef}
          >
            {/* Top & Bottom Fade */}
            {/* <div className={styles.fadeTop} />
            <div className={styles.fadeBottom} /> */}

            {/* Optional Up/Down Buttons */}
            {/* <button className={styles.chevronUp} onClick={() => scrollVertical(-1)}>
              <SlArrowLeft style={{ transform: "rotate(90deg)" }} />
            </button>
            <button className={styles.chevronDown} onClick={() => scrollVertical(1)}>
              <SlArrowLeft style={{ transform: "rotate(-90deg)" }} />
            </button> */}

            <div className={styles.dualColumns}>
              {/* LEFT COLUMN – SCROLLS UP */}
              <div className={styles.scrollColumn} ref={leftColumnRef}>
                <div className={styles.nftColumn}>
                  {/* Duplicate array twice for seamless loop */}
                  {[...featuredNFTs, ...featuredNFTs].map((nft, i) => (
                    <div
                      key={`left-${nft.nftId}-${i}`}
                      className={styles.nftCardWrapper}
                      onClick={() => setSelectedNFT(nft)}
                    >
                      <NFTCard 
                        nft={nft} 
                        onClick={() => setSelectedNFT(nft)} 
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN – SCROLLS DOWN */}
              <div className={styles.scrollColumn} ref={rightColumnRef}>
                <div className={styles.nftColumn}>
                  {[...featuredNFTs, ...featuredNFTs].map((nft, i) => (
                    <div
                      key={`right-${nft.nftId}-${i}`}
                      className={styles.nftCardWrapper}
                      onClick={() => setSelectedNFT(nft)}
                    >
                      <NFTCard 
                        nft={nft} 
                        onClick={() => setSelectedNFT(nft)} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
        

        </section>

        {/* HERO */}
        {/* <section className={styles.hero}>
          <div className={styles.heroContent}>
            <img src="/images/purpleLGG.png" alt="LuxHub Logo" className={styles.logo} />
            <h1 className={styles.title}>LUXHUB</h1>
            <p className={styles.subtitle}><span>VERIFY. BUY. SELL. Timpieces on solana</span>.</p>
          </div>
        </section> */}

        {/* FEATURED NFTS */}
        {/* <section className={styles.featuredNFTs}>
          <h2>COLLECTIONS</h2>
          <div
            className={styles.scrollAreaWrapper}
            ref={wrapperRef}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className={styles.fadeLeft} />
            <div className={styles.fadeRight} />
            <button className={styles.chevronLeft} onClick={() => scrollByOffset(-340)}><SlArrowLeft /></button>
            <button className={styles.chevronRight} onClick={() => scrollByOffset(340)}><SlArrowRight /></button>

            <div className={`${styles.nftScrollWrapper} ${styles.nosnap}`} ref={scrollRef}>
              <div className={styles.nftScrollRow}>
                {featuredNFTs.map((nft, i) => (
                  <div
                    key={`${nft.nftId}-${i}`}
                    className={`${styles.nftCardWrapper} ${activeIndex === i ? styles.activeNFT : ""}`}
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section> */}

        <section className={styles.sectBlur}>
          <div className={styles.ctaContainer}>
            <h2>Timeless craftsmanship — now on chain</h2>
            <p className={styles.subtitle}><span>On-chain security. Multisig escrow. Real-world luxury — powered by Solana.</span></p>
          </div>
          <ScrollSteps />
        </section>

        <section className={styles.overlaySteps}>
          <h2>Join LuxHub</h2>
          <p>
            We welcome luxury watch collectors, trusted dealers, investors, and Web3 builders. Whether you're here to sell authenticated timepieces or contribute to the next generation of asset marketplaces, you're in the right place.
          </p>
          <div className={styles.buttonGroup}>
            <a href="/sellerDashboard" className={styles.primaryButton}>Mint a Watch NFT</a>
            <a href="/watchMarket" className={styles.primaryButton}>Explore Marketplace</a>
            <a href="/sellerDashboard" className={styles.secondaryButton}>Manage My Listings</a>
          </div>
        </section>

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
