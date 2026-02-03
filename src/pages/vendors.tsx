import { useEffect, useState } from 'react';
import styles from '../styles/ExploreVendors.module.css';
import { FaStore, FaShieldHalved } from 'react-icons/fa6';
import { motion } from 'framer-motion';
import { VendorCard, VendorData } from '../components/common/VendorCard';

export default function ExploreVendors() {
  const [approvedVendors, setApprovedVendors] = useState<VendorData[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorData[]>([]);
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
            {verifiedVendors.map((vendor, index) => (
              <motion.div
                key={vendor.wallet}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <VendorCard vendor={vendor} variant="grid" showStats />
              </motion.div>
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
              .map((vendor, index) => (
                <motion.div
                  key={vendor.wallet}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                >
                  <VendorCard vendor={vendor} variant="grid" showStats />
                </motion.div>
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
