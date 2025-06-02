import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import NFTCard from "../components/marketplace/NFTCard";
import styles from "../styles/Home.module.css";
import ScrollSteps from "../components/common/ScrollSteps";
import { NftDetailCard } from "../components/marketplace/NftDetailCard";
import { SlArrowLeft, SlArrowRight } from "react-icons/sl";
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
  const SCROLL_SPEED = 1;
  const CARD_WIDTH = 340;

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
              const meta = await fetch(`https://gateway.pinata.cloud/ipfs/${nft.fileCid}`);
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

  useEffect(() => {
    let frame: number;

    const animate = () => {
      if (scrollRef.current && !isHovered && isVisible) {
        scrollRef.current.scrollLeft += SCROLL_SPEED;

        const total = scrollRef.current.scrollWidth;
        const visible = scrollRef.current.clientWidth;
        const loopWidth = total / 3;

        if (scrollRef.current.scrollLeft >= loopWidth * 2) {
          scrollRef.current.scrollLeft = loopWidth;
        }

        const scrollLeft = scrollRef.current.scrollLeft;
        const index = Math.round(scrollLeft / CARD_WIDTH) % (featuredNFTs.length / 3);
        setActiveIndex(index);
      }

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [featuredNFTs, isHovered, isVisible]);

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
        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <img src="/images/purpleLGG.png" alt="LuxHub Logo" className={styles.logo} />
            <h1 className={styles.title}>LUXHUB</h1>
            <p className={styles.subtitle}><span>VERIFY. BUY. SELL.</span> Timepieces on the blockchain. <span>Solana</span>.</p>
          </div>
        </section>

        {/* FEATURED NFTS */}
        <section className={styles.featuredNFTs}>
          <h2>INVENTORY</h2>
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
        </section>

        <section>
          <div className={styles.ctaContainer}>
            <h2>Built on Trust. Secured by Code</h2>
            <p className={styles.subtitle}>LuxHub is a decentralized marketplace for luxury items. <span>BUY, SELL, and TRADE</span> your assets with <span>CONFIDENCE.</span></p>
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
              <button className={styles.closeButton} onClick={() => setSelectedNFT(null)}>Close</button>
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
