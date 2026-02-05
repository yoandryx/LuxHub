// src/components/marketplace/NFTCardV2.tsx
// Modern, optimized NFT card component with Next.js Image and Irys gateway support
// Follows Vercel React best practices for performance

import React, { useState, memo, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { LuShield, LuBadgeCheck, LuSparkles } from 'react-icons/lu';
import { FaShoppingCart, FaGavel } from 'react-icons/fa';
import {
  resolveAssetImage,
  PLACEHOLDER_IMAGE,
  IRYS_GATEWAY,
  PINATA_GATEWAY,
} from '../../utils/imageUtils';
import styles from '../../styles/NFTCardV2.module.css';

// Status types
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

// Asset image fields interface - matches database schema
export interface NFTImageFields {
  imageUrl?: string;
  imageIpfsUrls?: string[];
  images?: string[];
  arweaveTxId?: string;
  image?: string;
  fileCid?: string;
}

export interface NFTCardV2Props {
  // Core identity
  title: string;
  brand?: string;
  model?: string;
  mintAddress?: string;

  // Image fields - supports all variations
  imageFields?: NFTImageFields;
  // OR direct image prop for backwards compatibility
  image?: string;

  // Pricing - USD-first approach
  priceUSD?: number;
  priceSol?: number;

  // Status & verification
  status?: NFTStatus;
  isVerified?: boolean;
  acceptingOffers?: boolean;

  // Display options
  showActions?: boolean;
  showPrice?: boolean;
  showBadge?: boolean;
  variant?: 'default' | 'compact' | 'list';

  // Actions
  onViewDetails?: () => void;
  onBuy?: () => void;
  onOffer?: () => void;

  // Additional
  className?: string;
}

// Status badge configuration - hoisted outside component (rendering-hoist-jsx)
const STATUS_BADGES: Record<NFTStatus, { label: string; className: string }> = {
  verified: { label: 'Verified', className: styles.badgeVerified },
  pending: { label: 'Pending', className: styles.badgePending },
  escrow: { label: 'In Escrow', className: styles.badgeEscrow },
  listed: { label: 'Listed', className: styles.badgeListed },
  sold: { label: 'Sold', className: styles.badgeSold },
  pooled: { label: 'Pooled', className: styles.badgePooled },
  burned: { label: 'Burned', className: styles.badgeBurned },
  preview: { label: 'Preview', className: styles.badgePreview },
  minting: { label: 'Minting...', className: styles.badgeMinting },
  ready: { label: 'Ready', className: styles.badgeReady },
  error: { label: 'Error', className: styles.badgeError },
};

// Custom loader for Next.js Image optimization with Irys/IPFS gateways
const imageLoader = ({ src, width, quality }: { src: string; width: number; quality?: number }) => {
  // For local images, return as-is
  if (src.startsWith('/')) {
    return src;
  }
  // For external URLs, pass through (Next.js will optimize if in remotePatterns)
  return src;
};

const NFTCardV2 = memo(function NFTCardV2({
  title,
  brand,
  model,
  mintAddress,
  imageFields,
  image,
  priceUSD,
  priceSol,
  status = 'listed',
  isVerified = true,
  acceptingOffers = false,
  showActions = true,
  showPrice = true,
  showBadge = true,
  variant = 'default',
  onViewDetails,
  onBuy,
  onOffer,
  className,
}: NFTCardV2Props) {
  const [imgError, setImgError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Resolve image URL using comprehensive asset resolver (rerender-memo)
  const resolvedImage = useMemo(() => {
    if (imgError) return PLACEHOLDER_IMAGE;

    // If imageFields provided, use comprehensive resolver
    if (imageFields) {
      return resolveAssetImage(imageFields);
    }

    // Fallback to direct image prop
    if (image) {
      return resolveAssetImage({ imageUrl: image });
    }

    return PLACEHOLDER_IMAGE;
  }, [imageFields, image, imgError]);

  // Check if image is from external gateway (for Next.js Image optimization)
  const isExternalImage = useMemo(() => {
    return (
      resolvedImage.startsWith(IRYS_GATEWAY) ||
      resolvedImage.startsWith(PINATA_GATEWAY) ||
      resolvedImage.startsWith('https://')
    );
  }, [resolvedImage]);

  // Memoized event handlers (rerender-functional-setstate)
  const handleImageError = useCallback(() => {
    setImgError(true);
    setIsLoading(false);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleClick = useCallback(() => {
    onViewDetails?.();
  }, [onViewDetails]);

  const handleBuyClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBuy?.();
    },
    [onBuy]
  );

  const handleOfferClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOffer?.();
    },
    [onOffer]
  );

  // Format price display
  const formattedPrice = useMemo(() => {
    if (priceUSD !== undefined) {
      return `$${priceUSD.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;
    }
    if (priceSol !== undefined) {
      return `${priceSol.toFixed(2)} SOL`;
    }
    return null;
  }, [priceUSD, priceSol]);

  const badgeConfig = STATUS_BADGES[status];
  const variantClass = styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`];

  return (
    <article
      className={`${styles.card} ${variantClass} ${className || ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${title}`}
    >
      {/* Glow effect */}
      <div className={styles.glowEffect} aria-hidden="true" />

      {/* Image Container */}
      <div className={styles.imageContainer}>
        {/* Skeleton loader */}
        {isLoading && (
          <div className={styles.skeleton} aria-hidden="true">
            <div className={styles.skeletonShimmer} />
          </div>
        )}

        {/* Use Next.js Image for optimization when possible */}
        {isExternalImage && !resolvedImage.startsWith('/') ? (
          <Image
            src={resolvedImage}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className={`${styles.image} ${isLoading ? styles.imageLoading : ''}`}
            onError={handleImageError}
            onLoad={handleImageLoad}
            loading="lazy"
            quality={80}
            unoptimized={resolvedImage.includes('mypinata.cloud')}
          />
        ) : (
          <img
            src={resolvedImage}
            alt={title}
            className={`${styles.image} ${isLoading ? styles.imageLoading : ''}`}
            onError={handleImageError}
            onLoad={handleImageLoad}
            loading="lazy"
          />
        )}

        {/* Shine effect overlay */}
        <div className={styles.imageShine} aria-hidden="true" />

        {/* Status Badge */}
        {showBadge && (
          <div className={`${styles.statusBadge} ${badgeConfig.className}`}>
            <LuBadgeCheck aria-hidden="true" />
            <span>{badgeConfig.label}</span>
          </div>
        )}

        {/* Verified Shield */}
        {isVerified && (
          <div className={styles.verifiedBadge} title="LuxHub Verified">
            <LuShield aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className={styles.footer}>
        <div className={styles.info}>
          <h3 className={styles.title}>{title}</h3>
          {brand && <span className={styles.brand}>{brand}</span>}
        </div>

        {showPrice && formattedPrice && (
          <div className={styles.priceSection}>
            <span className={styles.price}>{formattedPrice}</span>
            {priceUSD && priceSol && (
              <span className={styles.priceSol}>{priceSol.toFixed(2)} SOL</span>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      {showActions && status === 'listed' && (
        <div className={styles.actions}>
          {onBuy && (
            <button className={styles.buyBtn} onClick={handleBuyClick} aria-label={`Buy ${title}`}>
              <FaShoppingCart aria-hidden="true" />
              <span>Buy</span>
            </button>
          )}
          {onOffer && acceptingOffers && (
            <button
              className={styles.offerBtn}
              onClick={handleOfferClick}
              aria-label={`Make offer on ${title}`}
            >
              <FaGavel aria-hidden="true" />
              <span>Offer</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
});

export default NFTCardV2;

// Compact variant for grids with many items
export const NFTCardCompact = memo(function NFTCardCompact({
  title,
  brand,
  imageFields,
  image,
  priceUSD,
  status = 'listed',
  onClick,
}: {
  title: string;
  brand?: string;
  imageFields?: NFTImageFields;
  image?: string;
  priceUSD?: number;
  status?: NFTStatus;
  onClick?: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  const resolvedImage = useMemo(() => {
    if (imgError) return PLACEHOLDER_IMAGE;
    if (imageFields) return resolveAssetImage(imageFields);
    if (image) return resolveAssetImage({ imageUrl: image });
    return PLACEHOLDER_IMAGE;
  }, [imageFields, image, imgError]);

  return (
    <div className={styles.compactCard} onClick={onClick} role="button" tabIndex={0}>
      <div className={styles.compactImageWrapper}>
        <img
          src={resolvedImage}
          alt={title}
          className={styles.compactImage}
          onError={() => setImgError(true)}
          loading="lazy"
        />
        <div className={`${styles.compactBadge} ${STATUS_BADGES[status].className}`}>
          {STATUS_BADGES[status].label}
        </div>
      </div>
      <div className={styles.compactInfo}>
        <span className={styles.compactTitle}>{title}</span>
        {brand && <span className={styles.compactBrand}>{brand}</span>}
        {priceUSD !== undefined && (
          <span className={styles.compactPrice}>${priceUSD.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
});
