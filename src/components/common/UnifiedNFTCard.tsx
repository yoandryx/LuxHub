// src/components/common/UnifiedNFTCard.tsx
// Unified NFT Card component for consistent styling across LuxHub
import React, { useState, memo, useMemo, useCallback } from 'react';
import styles from '../../styles/UnifiedNFTCard.module.css';
import { FaCheck, FaClock, FaLock, FaShoppingCart, FaFire, FaEye, FaGavel } from 'react-icons/fa';
import { LuShield, LuBadgeCheck, LuSparkles } from 'react-icons/lu';

// Status types for NFT badges
export type NFTStatus =
  | 'verified'
  | 'pending'
  | 'escrow'
  | 'listed'
  | 'sold'
  | 'pooled'
  | 'burned'
  | 'preview'
  | 'minting'
  | 'ready'
  | 'error';

// Card size variants
export type CardVariant = 'default' | 'compact' | 'large' | 'list';

export interface UnifiedNFTCardProps {
  // Core data
  title: string;
  image?: string;
  imageCid?: string;
  price?: number;
  priceLabel?: string; // e.g., "SOL" or "USD"
  priceUSD?: number; // Fixed USD price of the watch

  // Identity
  mintAddress?: string;
  owner?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;

  // Watch attributes
  material?: string;
  dialColor?: string;
  caseSize?: string;
  condition?: string;

  // Status
  status?: NFTStatus;
  isVerified?: boolean;
  poolEligible?: boolean;
  acceptingOffers?: boolean;

  // Display options
  variant?: CardVariant;
  showBadge?: boolean;
  showPrice?: boolean;
  showOwner?: boolean;
  showOverlay?: boolean;
  showBuyButton?: boolean;
  showActionButtons?: boolean; // Show buy/offer buttons below card

  // Actions
  onClick?: () => void;
  onViewDetails?: () => void;
  onQuickBuy?: () => void;
  onOffer?: () => void;

  // Additional
  description?: string;
  attributes?: { trait_type: string; value: string }[];
  className?: string;
}

const PLACEHOLDER_IMAGE = '/images/purpleLGG.png';
const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
const IRYS_GATEWAY = 'https://gateway.irys.xyz/';

/**
 * Resolve image URL from CID, Irys TX ID, or full URL
 */
function resolveImageUrl(idOrUrl: string | undefined | null): string {
  if (!idOrUrl) return PLACEHOLDER_IMAGE;
  // Already a full URL
  if (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://')) return idOrUrl;
  // Local path
  if (idOrUrl.startsWith('/')) return idOrUrl;
  // IPFS CIDv0 (Qm...) or CIDv1 (bafy...)
  if (idOrUrl.startsWith('Qm') || idOrUrl.startsWith('bafy')) return `${GATEWAY_URL}${idOrUrl}`;
  // Irys/Arweave TX ID (43-char base64url)
  if (idOrUrl.length === 43 && /^[A-Za-z0-9_-]+$/.test(idOrUrl)) return `${IRYS_GATEWAY}${idOrUrl}`;
  // Default to IPFS gateway
  return `${GATEWAY_URL}${idOrUrl}`;
}

// Status badge configuration
const statusConfig: Record<NFTStatus, { label: string; icon: React.ReactNode; className: string }> =
  {
    verified: { label: 'Verified', icon: <LuBadgeCheck />, className: styles.badgeVerified },
    pending: { label: 'Pending', icon: <FaClock />, className: styles.badgePending },
    escrow: { label: 'In Escrow', icon: <FaLock />, className: styles.badgeEscrow },
    listed: { label: 'Listed', icon: <FaShoppingCart />, className: styles.badgeListed },
    sold: { label: 'Sold', icon: <FaCheck />, className: styles.badgeSold },
    pooled: { label: 'Pooled', icon: <LuSparkles />, className: styles.badgePooled },
    burned: { label: 'Burned', icon: <FaFire />, className: styles.badgeBurned },
    preview: { label: 'Preview', icon: <FaEye />, className: styles.badgePreview },
    minting: { label: 'Minting', icon: <LuSparkles />, className: styles.badgeMinting },
    ready: { label: 'Ready', icon: <FaCheck />, className: styles.badgeReady },
    error: { label: 'Error', icon: null, className: styles.badgeError },
  };

const UnifiedNFTCard = memo(
  ({
    title,
    image,
    imageCid,
    price,
    priceLabel = 'SOL',
    priceUSD,
    mintAddress,
    owner,
    brand,
    model,
    material,
    dialColor,
    caseSize,
    condition,
    status = 'verified',
    isVerified = true,
    poolEligible,
    acceptingOffers,
    variant = 'default',
    showBadge = true,
    showPrice = true,
    showOwner = true,
    showOverlay = true,
    showBuyButton = false,
    showActionButtons = false,
    onClick,
    onViewDetails,
    onQuickBuy,
    onOffer,
    description,
    className,
  }: UnifiedNFTCardProps) => {
    const [imgError, setImgError] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // Compute image URL with intelligent gateway resolution
    const imageUrl = useMemo(() => {
      if (imgError) return PLACEHOLDER_IMAGE;
      // Resolve image URL (handles Irys, IPFS, and full URLs)
      if (image) return resolveImageUrl(image);
      if (imageCid) return resolveImageUrl(imageCid);
      return PLACEHOLDER_IMAGE;
    }, [image, imageCid, imgError]);

    // Truncate wallet addresses
    const truncateAddress = useCallback((addr: string) => {
      if (!addr || addr.length < 10) return addr || 'N/A';
      return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    }, []);

    // Get status badge config
    const badgeConfig = statusConfig[status];

    // Handle click
    const handleClick = useCallback(() => {
      if (onClick) onClick();
      else if (onViewDetails) onViewDetails();
    }, [onClick, onViewDetails]);

    // Variant class
    const variantClass = styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`];

    return (
      <div
        className={`${styles.card} ${variantClass} ${className || ''}`}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Glow effect on hover */}
        <div className={styles.glowEffect} />

        {/* Image Container */}
        <div className={styles.imageContainer}>
          <img
            src={imageUrl}
            alt={title}
            className={styles.image}
            onError={() => setImgError(true)}
            loading="lazy"
          />

          {/* Image shine effect */}
          <div className={styles.imageShine} />

          {/* Status Badge - Top Left */}
          {showBadge && (
            <div className={`${styles.statusBadge} ${badgeConfig.className}`}>
              {badgeConfig.icon}
              <span>{badgeConfig.label}</span>
            </div>
          )}

          {/* Verified Shield - Top Right */}
          {isVerified && (
            <div className={styles.verifiedBadge}>
              <LuShield />
            </div>
          )}

          {/* Pool Eligible Badge */}
          {poolEligible && (
            <div className={styles.poolBadge}>
              <LuSparkles /> Pool
            </div>
          )}

          {/* Hover Overlay */}
          {showOverlay && (
            <div className={`${styles.overlay} ${isHovered ? styles.overlayVisible : ''}`}>
              <div className={styles.overlayContent}>
                <h3 className={styles.overlayTitle}>{title}</h3>

                {brand && (
                  <div className={styles.overlayRow}>
                    <span>Brand</span>
                    <span>{brand}</span>
                  </div>
                )}

                {model && (
                  <div className={styles.overlayRow}>
                    <span>Model</span>
                    <span>{model}</span>
                  </div>
                )}

                {material && (
                  <div className={styles.overlayRow}>
                    <span>Material</span>
                    <span>{material}</span>
                  </div>
                )}

                {caseSize && (
                  <div className={styles.overlayRow}>
                    <span>Size</span>
                    <span>{caseSize}</span>
                  </div>
                )}

                {condition && (
                  <div className={styles.overlayRow}>
                    <span>Condition</span>
                    <span>{condition}</span>
                  </div>
                )}

                {showOwner && owner && (
                  <div className={styles.overlayRow}>
                    <span>Owner</span>
                    <span>{truncateAddress(owner)}</span>
                  </div>
                )}

                {showPrice && price !== undefined && (
                  <div className={styles.overlayPriceContainer}>
                    <div className={styles.overlayPrice}>
                      <LuSparkles className={styles.priceIcon} />
                      <span>
                        {price.toFixed(2)} {priceLabel}
                      </span>
                    </div>
                    {priceUSD !== undefined && (
                      <div className={styles.overlayPriceUSD}>${priceUSD.toLocaleString()}</div>
                    )}
                  </div>
                )}

                <div className={styles.overlayActions}>
                  {onViewDetails && (
                    <button
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails();
                      }}
                    >
                      View Details
                    </button>
                  )}
                  {onQuickBuy && status === 'listed' && (
                    <button
                      className={styles.buyButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuickBuy();
                      }}
                    >
                      Quick Buy
                    </button>
                  )}
                  {onOffer && acceptingOffers && (
                    <button
                      className={styles.offerButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOffer();
                      }}
                    >
                      Make Offer
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Card Footer - Always visible */}
        <div className={styles.footer}>
          <div className={styles.footerMain}>
            <h4 className={styles.title}>{title}</h4>
            {brand && <span className={styles.brand}>{brand}</span>}
          </div>

          <div className={styles.footerRight}>
            {showPrice && price !== undefined && (
              <div className={styles.priceTag}>
                <div className={styles.priceSol}>
                  <span className={styles.priceValue}>{price.toFixed(2)}</span>
                  <span className={styles.priceLabel}>{priceLabel}</span>
                </div>
                {priceUSD !== undefined && (
                  <span className={styles.priceUSD}>${priceUSD.toLocaleString()}</span>
                )}
              </div>
            )}

            {showBuyButton && onQuickBuy && status === 'listed' && (
              <button
                className={styles.footerBuyButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBuy();
                }}
              >
                Buy
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons - Below footer for marketplace */}
        {showActionButtons && (
          <div className={styles.actionButtons}>
            {onQuickBuy && status === 'listed' && (
              <button
                className={styles.luxuryBuyBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onQuickBuy();
                }}
              >
                <FaShoppingCart /> Buy Now
              </button>
            )}
            {onOffer && acceptingOffers && (
              <button
                className={styles.luxuryOfferBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  onOffer();
                }}
              >
                <FaGavel /> Offer
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);

UnifiedNFTCard.displayName = 'UnifiedNFTCard';

export default UnifiedNFTCard;

// Export a simple card for bulk/grid displays
export const NFTGridCard = memo(
  ({
    title,
    image,
    imageUrl,
    price,
    priceLabel = 'SOL',
    priceUSD,
    brand,
    subtitle,
    status = 'ready',
    isValid = true,
    onClick,
  }: {
    title: string;
    image?: string;
    imageUrl?: string;
    price?: number | string;
    priceLabel?: string;
    priceUSD?: number;
    brand?: string;
    subtitle?: string;
    status?: NFTStatus;
    isValid?: boolean;
    onClick?: () => void;
  }) => {
    const [imgError, setImgError] = useState(false);
    // Resolve image URL with intelligent gateway detection
    const finalImage = imgError ? PLACEHOLDER_IMAGE : resolveImageUrl(image || imageUrl);
    const badgeConfig = statusConfig[status];

    // Format price display based on label (USD-first support)
    const formatPrice = () => {
      if (price === undefined) return null;
      const numPrice = typeof price === 'number' ? price : parseFloat(price);

      if (priceLabel === 'USD') {
        // USD-first: show "$12,500" format
        return `$${numPrice.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
      }
      // SOL: show "150.00 SOL" format
      return `${numPrice.toFixed(2)} ${priceLabel}`;
    };

    return (
      <div
        className={`${styles.gridCard} ${!isValid ? styles.gridCardInvalid : ''}`}
        onClick={onClick}
      >
        <div className={styles.gridImageWrapper}>
          {finalImage ? (
            <img
              src={finalImage}
              alt={title}
              className={styles.gridImage}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className={styles.gridImagePlaceholder}>
              <LuSparkles />
            </div>
          )}

          <div className={`${styles.gridBadge} ${badgeConfig.className}`}>
            {badgeConfig.icon}
            <span>{badgeConfig.label}</span>
          </div>
        </div>

        <div className={styles.gridContent}>
          <h4 className={styles.gridTitle}>{title || 'Untitled'}</h4>
          <div className={styles.gridMeta}>
            {brand && <span className={styles.gridBrand}>{brand}</span>}
            {price !== undefined && (
              <div className={styles.gridPriceContainer}>
                <span className={styles.gridPrice}>{formatPrice()}</span>
                {subtitle && <span className={styles.gridPriceSol}>{subtitle}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

NFTGridCard.displayName = 'NFTGridCard';
