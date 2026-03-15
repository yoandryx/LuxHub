import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { FaStore, FaShieldHalved } from 'react-icons/fa6';
import { motion, AnimatePresence } from 'framer-motion';
import { VendorCard, VendorData } from '../components/common/VendorCard';
import styles from '../styles/ExploreVendors.module.css';

export default function ExploreVendors() {
  const [approvedVendors, setApprovedVendors] = useState<VendorData[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'verified' | 'creators'>('all');

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

  const unverifiedVendors = useMemo(
    () => approvedVendors.filter((v) => !v.verified),
    [approvedVendors]
  );

  const allVendors = useMemo(
    () => [...verifiedVendors, ...unverifiedVendors],
    [verifiedVendors, unverifiedVendors]
  );

  // Filter by search
  const filterBySearch = (vendors: VendorData[]) => {
    if (!searchQuery) return vendors;
    const q = searchQuery.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.username?.toLowerCase().includes(q) ||
        v.wallet?.toLowerCase().includes(q)
    );
  };

  const displayVendors = useMemo(() => {
    switch (activeTab) {
      case 'verified':
        return filterBySearch(verifiedVendors);
      case 'creators':
        return filterBySearch(unverifiedVendors);
      default:
        return filterBySearch(allVendors);
    }
  }, [activeTab, searchQuery, allVendors, verifiedVendors, unverifiedVendors]);

  // Stats
  const totalItems = allVendors.reduce((sum, v) => sum + (v.stats?.totalItems || 0), 0);
  const totalListed = allVendors.reduce((sum, v) => sum + (v.stats?.itemsListed || 0), 0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  };

  return (
    <>
      <Head>
        <title>Dealers | LuxHub</title>
        <meta
          name="description"
          content="Explore verified luxury dealers on LuxHub. Authenticated timepieces and collectibles backed by NFTs."
        />
      </Head>

      <div className={styles.page}>
        <div className={styles.ambientBg} />

        <main className={styles.main}>
          {/* Stats Bar */}
          {!loading && (
            <div className={styles.statsBar}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{allVendors.length}</span>
                <span className={styles.statLabel}>Dealers</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{verifiedVendors.length}</span>
                <span className={styles.statLabel}>Verified</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{totalItems}</span>
                <span className={styles.statLabel}>Items</span>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.stat}>
                <span className={styles.statValue}>{totalListed}</span>
                <span className={styles.statLabel}>Listed</span>
              </div>
            </div>
          )}

          {/* Tabs + Search */}
          <div className={styles.toolbar}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'all' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>All</span>
                <span className={styles.tabCount}>{allVendors.length}</span>
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'verified' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('verified')}
              >
                <FaShieldHalved />
                <span>Verified</span>
                <span className={styles.tabCount}>{verifiedVendors.length}</span>
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'creators' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('creators')}
              >
                <span>Creators</span>
                <span className={styles.tabCount}>{unverifiedVendors.length}</span>
              </button>
            </div>

            <div className={styles.searchWrapper}>
              <HiOutlineSearch className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search dealers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>
                  <HiOutlineX />
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
            </div>
          )}

          {/* Vendor Grid */}
          {!loading && (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab + searchQuery}
                className={styles.vendorGrid}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {displayVendors.length > 0 ? (
                  displayVendors.map((vendor) => (
                    <motion.div key={vendor.wallet} variants={cardVariants}>
                      <VendorCard vendor={vendor} variant="grid" showStats />
                    </motion.div>
                  ))
                ) : (
                  <div className={styles.emptyState}>
                    <FaStore className={styles.emptyIcon} />
                    <h3>No dealers found</h3>
                    <p>
                      {searchQuery ? 'Try a different search term' : 'More dealers coming soon'}
                    </p>
                    {searchQuery && (
                      <button className={styles.clearBtn} onClick={() => setSearchQuery('')}>
                        Clear Search
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </>
  );
}
