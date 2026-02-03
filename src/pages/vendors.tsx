import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../styles/ExploreVendors.module.css';
import { FaStore, FaShieldHalved } from 'react-icons/fa6';
import { HiMiniCheckBadge } from 'react-icons/hi2';
import { motion } from 'framer-motion';

interface VendorStats {
  totalItems: number;
  itemsListed: number;
  inventoryValue: number;
}

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  bio?: string;
  avatarCid?: string;
  bannerCid?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
  stats?: VendorStats;
}

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';

// Inventory value tiers for badge styling
const getInventoryTier = (value: number) => {
  if (value >= 500000) return { tier: 'diamond', label: 'Diamond' };
  if (value >= 250000) return { tier: 'platinum', label: 'Platinum' };
  if (value >= 100000) return { tier: 'gold', label: 'Gold' };
  if (value >= 25000) return { tier: 'silver', label: 'Silver' };
  if (value >= 5000) return { tier: 'bronze', label: 'Bronze' };
  return { tier: 'starter', label: 'Starter' };
};

export default function ExploreVendors() {
  const [approvedVendors, setApprovedVendors] = useState<VendorProfile[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/vendor/vendorList?includeStats=true')
      .then((res) => res.json())
      .then((data) => {
        setApprovedVendors(data.vendors || []);
        setVerifiedVendors(data.verifiedVendors || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const VendorCard = ({ vendor, index }: { vendor: VendorProfile; index: number }) => {
    const inventoryValue = vendor.stats?.inventoryValue || 0;
    const tier = getInventoryTier(inventoryValue);
    const tierClass = `tier${tier.tier.charAt(0).toUpperCase() + tier.tier.slice(1)}`;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: index * 0.03 }}
      >
        <Link href={`/vendor/${vendor.wallet}`} className={styles.vendorCard}>
          {/* Avatar */}
          <div className={styles.avatarWrapper}>
            {vendor.avatarUrl || vendor.avatarCid ? (
              <img
                src={vendor.avatarUrl || `${GATEWAY}${vendor.avatarCid}`}
                alt={vendor.name}
                className={styles.avatar}
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

          {/* Name & Username */}
          <span className={styles.vendorName}>{vendor.name}</span>
          <span className={styles.username}>@{vendor.username}</span>

          {/* Compact Stats */}
          <div className={styles.statsRow}>
            <span className={styles.statItem}>{vendor.stats?.totalItems || 0} items</span>
            <span className={styles.statDot}>·</span>
            <span className={styles.statItem}>{vendor.stats?.itemsListed || 0} listed</span>
          </div>

          {/* Tier Badge */}
          <div
            className={`${styles.tierBadge} ${styles[tierClass]}`}
            title={`$${inventoryValue.toLocaleString()} inventory`}
          >
            <div className={styles.tierShine} />
            <span className={styles.tierLabel}>{tier.label}</span>
          </div>
        </Link>
      </motion.div>
    );
  };

  return (
    <div className={styles.pageContainer}>
      {/* Hero Section */}
      <div className={styles.heroSection}>
        <h1 className={styles.title}>LuxHub Dealers</h1>
        <p className={styles.subtitle}>
          Discover verified luxury dealers with authenticated timepieces and collectibles
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading dealers...</p>
        </div>
      )}

      {/* Verified Dealers Section */}
      {!loading && verifiedVendors.length > 0 && (
        <>
          <div className={styles.sectionHeading}>
            <div className={styles.sectionIcon}>
              <FaShieldHalved />
            </div>
            <h2>Verified Dealers</h2>
          </div>
          <div className={styles.vendorList}>
            {verifiedVendors.map((v, i) => (
              <VendorCard key={v.wallet} vendor={v} index={i} />
            ))}
          </div>
        </>
      )}

      {/* All Creators Section */}
      {!loading && (
        <>
          <div className={styles.sectionHeading}>
            <h2>All Creators</h2>
          </div>
          <div className={styles.vendorList}>
            {approvedVendors
              .filter((v) => !v.verified)
              .map((v, i) => (
                <VendorCard key={v.wallet} vendor={v} index={i} />
              ))}
            {approvedVendors.filter((v) => !v.verified).length === 0 && (
              <div className={styles.emptyState}>
                <FaStore className={styles.emptyStateIcon} />
                <p>More creators coming soon!</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
