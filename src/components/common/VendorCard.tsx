import React, { useState } from 'react';
import Link from 'next/link';
import { FaStore } from 'react-icons/fa6';
import { HiMiniCheckBadge } from 'react-icons/hi2';
import { TierBadge } from './TierBadge';
import { resolveImageUrl } from '../../utils/imageUtils';
import styles from '../../styles/VendorCard.module.css';

export interface VendorStats {
  totalItems: number;
  itemsListed: number;
  inventoryValue: number;
}

export interface VendorData {
  wallet: string;
  name: string;
  username: string;
  bio?: string;
  avatarCid?: string;
  avatarUrl?: string;
  verified?: boolean;
  stats?: VendorStats;
}

interface VendorCardProps {
  vendor: VendorData;
  variant?: 'grid' | 'slider' | 'compact';
  showStats?: boolean;
  className?: string;
}

export const VendorCard: React.FC<VendorCardProps> = ({
  vendor,
  variant = 'grid',
  showStats = true,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);
  const inventoryValue = vendor.stats?.inventoryValue || 0;
  const avatarSrc =
    !imgError && (vendor.avatarUrl || vendor.avatarCid)
      ? resolveImageUrl(vendor.avatarUrl || vendor.avatarCid)
      : null;

  const variantClass = {
    grid: styles.gridVariant,
    slider: styles.sliderVariant,
    compact: styles.compactVariant,
  }[variant];

  return (
    <Link
      href={`/vendor/${vendor.wallet}`}
      className={`${styles.vendorCard} ${variantClass} ${className}`}
    >
      {/* Avatar */}
      <div className={styles.avatarWrapper}>
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={vendor.name}
            className={styles.avatar}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.avatarPlaceholder}>
            <FaStore />
          </div>
        )}
        {vendor.verified && (
          <div className={styles.verifiedBadge}>
            <HiMiniCheckBadge />
          </div>
        )}
      </div>

      {/* Info */}
      <div className={styles.info}>
        <span className={styles.name}>{vendor.name}</span>
        <span className={styles.username}>@{vendor.username}</span>

        {/* Stats - only for grid variant */}
        {showStats && variant === 'grid' && vendor.stats && (
          <div className={styles.statsRow}>
            <span className={styles.statItem}>{vendor.stats.totalItems} items</span>
            <span className={styles.statDot}>·</span>
            <span className={styles.statItem}>{vendor.stats.itemsListed} listed</span>
          </div>
        )}

        {/* Tier Badge */}
        <TierBadge inventoryValue={inventoryValue} size={variant === 'grid' ? 'small' : 'small'} />
      </div>
    </Link>
  );
};

export default VendorCard;
