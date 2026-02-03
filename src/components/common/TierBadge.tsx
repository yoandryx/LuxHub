import React from 'react';
import styles from '../../styles/TierBadge.module.css';

export interface TierInfo {
  tier: 'starter' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
  label: string;
  color: string;
}

// Inventory value tiers for badge styling
export const getInventoryTier = (value: number): TierInfo => {
  if (value >= 500000) return { tier: 'diamond', label: 'Diamond', color: '#b9f2ff' };
  if (value >= 250000) return { tier: 'platinum', label: 'Platinum', color: '#e5e4e2' };
  if (value >= 100000) return { tier: 'gold', label: 'Gold', color: '#ffd700' };
  if (value >= 25000) return { tier: 'silver', label: 'Silver', color: '#c0c0c0' };
  if (value >= 5000) return { tier: 'bronze', label: 'Bronze', color: '#cd7f32' };
  return { tier: 'starter', label: 'Starter', color: '#888888' };
};

interface TierBadgeProps {
  inventoryValue: number;
  size?: 'small' | 'medium' | 'large';
  showValue?: boolean;
}

export const TierBadge: React.FC<TierBadgeProps> = ({
  inventoryValue,
  size = 'medium',
  showValue = false,
}) => {
  const tier = getInventoryTier(inventoryValue);
  const tierClass =
    `tier${tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1)}` as keyof typeof styles;
  const sizeClass = `size${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles;

  return (
    <div
      className={`${styles.tierBadge} ${styles[tierClass]} ${styles[sizeClass]}`}
      title={`$${inventoryValue.toLocaleString()} inventory`}
    >
      <div className={styles.tierShine} />
      <span className={styles.tierLabel}>{tier.label}</span>
      {showValue && (
        <span className={styles.tierValue}>${(inventoryValue / 1000).toFixed(0)}K</span>
      )}
    </div>
  );
};

export default TierBadge;
