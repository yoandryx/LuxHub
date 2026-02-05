import React, { useEffect, useState, useRef, useMemo } from 'react';
import styles from '../../styles/NFTDetailCard.module.css';
import { FaTimes, FaCopy } from 'react-icons/fa';
import { LuRotate3D, LuShield, LuBadgeCheck, LuSparkles, LuGem } from 'react-icons/lu';
import { Connection, PublicKey } from '@solana/web3.js';
import VanillaTilt from 'vanilla-tilt';
import { usePriceDisplay } from '../marketplace/PriceDisplay';
import { resolveImageUrl, resolveAssetImage, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';

// Dynamic import for Metaplex (only loaded when needed - ~87KB saved for previewData cases)
const loadMetaplex = async () => {
  const { Metaplex } = await import('@metaplex-foundation/js');
  return Metaplex;
};

// Dynamic import for mpl-core (for new NFT format)
const loadMplCore = async () => {
  const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
  const { fetchAsset } = await import('@metaplex-foundation/mpl-core');
  const { publicKey } = await import('@metaplex-foundation/umi');
  return { createUmi, fetchAsset, publicKey };
};

export interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes?: { trait_type: string; value: string }[];
  seller_fee_basis_points: number;
  animation_url?: string;
  properties: {
    creators: { address: string; share: number }[];
    files: { uri: string; type: string }[];
    category?: string;
    background_color?: string;
    collection?: {
      name: string;
      family: string;
    };
  };
  mintAddress?: string;
  owner?: string;
  marketStatus?: string;
  priceSol?: number;
}

interface NftDetailCardProps {
  metadataUri?: string;
  mintAddress?: string;
  previewData?: {
    title: string;
    image: string;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
    description: string;
    priceSol: number;
    attributes: { trait_type: string; value: string }[];
  };
  priceSol?: number;
  owner?: string;
  onClose: () => void;
  showContactButton?: boolean;
}

export const NftDetailCard: React.FC<NftDetailCardProps> = ({
  metadataUri,
  mintAddress,
  previewData,
  priceSol,
  owner,
  onClose,
  showContactButton = false,
}) => {
  const [metadata, setMetadata] = useState<NFTMetadata | null>(null);
  const [loading, setLoading] = useState<boolean>(!!metadataUri && !previewData);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const { formatPrice, displayInUSD, toggleDisplay } = usePriceDisplay();

  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Floating sparkles animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();

    interface Sparkle {
      x: number;
      y: number;
      size: number;
      speedY: number;
      speedX: number;
      opacity: number;
      hue: number;
      life: number;
      maxLife: number;
    }

    const sparkles: Sparkle[] = [];
    const sparkleCount = 25; // Reduced for subtlety

    const createSparkle = (): Sparkle => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      size: Math.random() * 2 + 0.5, // Smaller sparkles
      speedY: (Math.random() - 0.5) * 0.3,
      speedX: (Math.random() - 0.5) * 0.2,
      opacity: 0,
      hue: 270 + Math.random() * 20, // LuxHub purple range only (270-290)
      life: 0,
      maxLife: Math.random() * 300 + 150,
    });

    for (let i = 0; i < sparkleCount; i++) {
      const s = createSparkle();
      s.life = Math.random() * s.maxLife;
      sparkles.push(s);
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      sparkles.forEach((s, i) => {
        s.life++;
        s.x += s.speedX;
        s.y += s.speedY;

        const progress = s.life / s.maxLife;
        if (progress < 0.3) {
          s.opacity = progress / 0.3;
        } else if (progress > 0.7) {
          s.opacity = (1 - progress) / 0.3;
        } else {
          s.opacity = 1;
        }

        if (s.life >= s.maxLife) {
          sparkles[i] = createSparkle();
        }

        ctx.save();
        ctx.globalAlpha = s.opacity * 0.4; // More subtle

        const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size * 2);
        gradient.addColorStop(0, `hsla(${s.hue}, 60%, 75%, 0.6)`);
        gradient.addColorStop(0.5, `hsla(${s.hue}, 50%, 65%, 0.2)`);
        gradient.addColorStop(1, `hsla(${s.hue}, 40%, 60%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${s.hue}, 60%, 90%, 0.8)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, []);

  // 3D Tilt Effect with enhanced settings
  useEffect(() => {
    if (cardRef.current) {
      VanillaTilt.init(cardRef.current, {
        max: 12,
        speed: 300,
        glare: true,
        'max-glare': 0.35,
        gyroscope: true,
        gyroscopeMinAngleX: -20,
        gyroscopeMaxAngleX: 20,
        gyroscopeMinAngleY: -20,
        gyroscopeMaxAngleY: 20,
        scale: 1.02,
        transition: true,
        easing: 'cubic-bezier(.03,.98,.52,.99)',
      });
    }

    return () => {
      if (cardRef.current && (cardRef.current as any).vanillaTilt) {
        (cardRef.current as any).vanillaTilt.destroy();
      }
    };
  }, [metadata]);

  const handleCopy = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  // Metadata fetching - optimized with dynamic imports
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        let uri = metadataUri;
        const rpcEndpoint =
          process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com';

        if (!uri && mintAddress) {
          // Try mpl-core first (new NFT format)
          try {
            const { createUmi, fetchAsset, publicKey } = await loadMplCore();
            const umi = createUmi(rpcEndpoint);
            const asset = await fetchAsset(umi, publicKey(mintAddress));
            uri = asset.uri;
            console.log('[NftDetailCard] Fetched mpl-core asset URI:', uri);
          } catch {
            // Fall back to Metaplex for old NFTs
            console.log('[NftDetailCard] Trying Metaplex for old NFT format...');
            const connection = new Connection(rpcEndpoint);
            const Metaplex = await loadMetaplex();
            const metaplex = Metaplex.make(connection);
            const nft = await metaplex
              .nfts()
              .findByMint({ mintAddress: new PublicKey(mintAddress) });
            uri = nft.uri;
          }
        }

        if (!uri) return;

        const res = await fetch(uri);
        const json = await res.json();

        setMetadata((prev) => ({
          ...json,
          priceSol: parseFloat(
            json.priceSol ??
              json.attributes?.find((a: any) => a.trait_type === 'Price')?.value ??
              json.attributes?.find((a: any) => a.trait_type === 'Price USD')?.value ??
              prev?.priceSol ??
              priceSol?.toString() ??
              '0'
          ),
          owner:
            json.owner ??
            json.attributes?.find((a: any) => a.trait_type === 'Current Owner')?.value ??
            prev?.owner ??
            owner,
          mintAddress: mintAddress ?? prev?.mintAddress,
        }));
      } catch (err) {
        console.error('Failed to fetch metadata:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!previewData) {
      fetchMetadata();
    }
  }, [metadataUri, mintAddress, previewData, priceSol, owner]);

  // Handle previewData - use comprehensive image resolution
  useEffect(() => {
    if (previewData && !metadata) {
      // Resolve image using the comprehensive asset resolver
      const resolvedPreviewImage = resolveAssetImage({
        imageUrl: previewData.imageUrl,
        images: previewData.images,
        imageIpfsUrls: previewData.imageIpfsUrls,
        image: previewData.image,
      });

      setMetadata({
        name: previewData.title,
        symbol: '',
        description: previewData.description,
        image: resolvedPreviewImage,
        seller_fee_basis_points: 500,
        attributes: previewData.attributes,
        priceSol: previewData.priceSol,
        properties: {
          creators: [],
          files: [],
        },
      });
      setLoading(false);
    }
  }, [previewData, metadata]);

  // Premium loading state
  if (loading) {
    return (
      <div className={styles.modalBackdrop}>
        <div className={styles.luxuryLoader}>
          <div className={styles.loaderDiamond}>
            <LuGem />
          </div>
          <div className={styles.loaderRing}></div>
          <span className={styles.loaderText}>Authenticating</span>
        </div>
      </div>
    );
  }

  if (!metadata) return null;

  // Resolve image URL for Irys/IPFS compatibility
  const resolvedImage = resolveImageUrl(metadata.image);

  const truncate = (value: string, length: number = 10) => {
    if (!value || typeof value !== 'string') return '~';
    return value.length > length ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
  };

  const getAttr = (type: string, shorten: boolean = false) => {
    const value = metadata.attributes?.find((a) => a.trait_type === type)?.value || '~';
    return shorten ? truncate(value.toString()) : value;
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      {/* Floating sparkles canvas */}
      <canvas ref={canvasRef} className={styles.sparklesCanvas} />

      {/* Full Image Viewer */}
      {showFullImage && (
        <div
          className={styles.fullImageOverlay}
          onClick={(e) => {
            e.stopPropagation();
            setShowFullImage(false);
          }}
        >
          <img src={resolvedImage} alt={metadata.name} className={styles.fullImage} />
          <span className={styles.fullImageHint}>Click anywhere to close</span>
        </div>
      )}

      {/* 3D Holographic Card */}
      <div
        className={`${styles.flipCard} ${isFlipped ? styles.flipped : ''}`}
        ref={cardRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsFlipped(!isFlipped);
        }}
      >
        {/* Subtle accent border */}
        <div className={styles.holoBorder}></div>

        <div className={styles.flipCardInner}>
          {/* FRONT SIDE */}
          <div className={styles.flipCardFront}>
            {/* Holographic shine overlay */}
            <div className={styles.holoShine}></div>

            {/* Authentication badge */}
            <div className={styles.authBadge}>
              <LuShield className={styles.authIcon} />
              <span>VERIFIED</span>
              <LuBadgeCheck className={styles.authCheck} />
            </div>

            {/* NFT Image with premium frame - clickable for full view */}
            <div
              className={styles.imageFrame}
              onClick={(e) => {
                e.stopPropagation();
                setShowFullImage(true);
              }}
            >
              <div className={styles.frameCorner} data-corner="tl"></div>
              <div className={styles.frameCorner} data-corner="tr"></div>
              <div className={styles.frameCorner} data-corner="bl"></div>
              <div className={styles.frameCorner} data-corner="br"></div>
              <div className={styles.imageContainer}>
                <img src={resolvedImage} alt={metadata.name} className={styles.cardImage} />
                <div className={styles.imageShine}></div>
                <div className={styles.imageExpandHint}>
                  <LuSparkles /> View Full
                </div>
              </div>
            </div>

            {/* Title with luxury gold styling */}
            <div className={styles.cardTitle}>
              <h2>{metadata.name}</h2>
              <div className={styles.titleUnderline}></div>
            </div>

            {/* Quick info chips */}
            <div className={styles.quickInfo}>
              {metadata.mintAddress && (
                <div className={styles.infoChip}>
                  <span className={styles.chipLabel}>MINT</span>
                  <span
                    className={`${styles.chipValue} ${copiedField === 'mint' ? styles.copied : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy('mint', metadata.mintAddress ?? '');
                    }}
                  >
                    <FaCopy className={styles.copyIcon} />
                    {truncate(metadata.mintAddress)}
                  </span>
                </div>
              )}

              {metadata.owner && (
                <div className={styles.infoChip}>
                  <span className={styles.chipLabel}>OWNER</span>
                  <span
                    className={`${styles.chipValue} ${copiedField === 'owner' ? styles.copied : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy('owner', metadata.owner ?? '');
                    }}
                  >
                    <FaCopy className={styles.copyIcon} />
                    {truncate(metadata.owner)}
                  </span>
                </div>
              )}
            </div>

            {/* Price display - prominent like a price tag */}
            <div className={styles.priceSection}>
              <div className={styles.priceTag}>
                <LuSparkles className={styles.priceIcon} />
                <span className={styles.priceValue}>{formatPrice(metadata.priceSol ?? 0)}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDisplay();
                }}
                className={styles.currencyToggle}
              >
                {displayInUSD ? 'SOL' : 'USD'}
              </button>
            </div>

            {showContactButton && (
              <button className={styles.contactBtn} onClick={(e) => e.stopPropagation()}>
                <LuGem /> Contact Dealer
              </button>
            )}

            {/* Edition badge like limited Pokemon cards */}
            <div className={styles.editionBadge}>
              <span className={styles.editionLabel}>LIMITED</span>
              <span className={styles.editionNumber}>#001</span>
            </div>
          </div>

          {/* BACK SIDE - Certificate of Authenticity */}
          <div className={styles.flipCardBack}>
            <div className={styles.holoShine}></div>

            <div className={styles.backContent}>
              {/* Certificate header */}
              <div className={styles.certHeader}>
                <LuShield className={styles.certShield} />
                <h3>Certificate of Authenticity</h3>
                <div className={styles.certLine}></div>
              </div>

              {metadata.marketStatus && (
                <div className={styles.statusBadge}>
                  <span>{metadata.marketStatus}</span>
                </div>
              )}

              {/* Attributes as authentication specs */}
              <div className={styles.attributesSection}>
                <h4 className={styles.attributesTitle}>
                  <LuGem /> Specifications
                </h4>
                <div className={styles.attributesGrid}>
                  {[
                    { label: 'Brand', key: 'Brand' },
                    { label: 'Model', key: 'Model' },
                    { label: 'Serial', key: 'Serial Number' },
                    { label: 'Material', key: 'Material' },
                    { label: 'Year', key: 'Production Year' },
                    { label: 'Edition', key: 'Limited Edition' },
                    { label: 'Certificate', key: 'Certificate' },
                    { label: 'Warranty', key: 'Warranty Info' },
                    { label: 'Movement', key: 'Movement' },
                    { label: 'Case Size', key: 'Case Size' },
                    { label: 'Water Resist', key: 'Water Resistance' },
                    { label: 'Dial', key: 'Dial Color' },
                    { label: 'Origin', key: 'Country' },
                    { label: 'Released', key: 'Release Date' },
                    { label: 'Box & Papers', key: 'Box & Papers' },
                    { label: 'Condition', key: 'Condition' },
                  ].map(({ label, key }) => (
                    <div className={styles.attrCard} key={key}>
                      <span className={styles.attrLabel}>{label}</span>
                      <span className={styles.attrValue}>{getAttr(key)}</span>
                    </div>
                  ))}
                </div>

                {/* Provenance - special styling */}
                <div className={styles.provenanceCard} title={getAttr('Provenance')}>
                  <span className={styles.provenanceLabel}>
                    <LuBadgeCheck /> Provenance
                  </span>
                  <span className={styles.provenanceValue}>{getAttr('Provenance', true)}</span>
                </div>

                {/* Features */}
                <div className={styles.featuresCard}>
                  <span className={styles.featuresLabel}>Features</span>
                  <span className={styles.featuresValue}>{getAttr('Features')}</span>
                </div>
              </div>

              {/* Holographic authentication seal */}
              <div className={styles.holoSeal}>
                <div className={styles.sealInner}>
                  <LuShield />
                  <span>LUXHUB</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flip indicator */}
        <div className={styles.flipHint}>
          <LuRotate3D className={styles.rotateIcon} />
          <span>Tap to {isFlipped ? 'view item' : 'authenticate'}</span>
        </div>
      </div>

      {/* Close Button */}
      <button className={styles.closeButton} onClick={onClose}>
        <FaTimes />
      </button>
    </div>
  );
};
