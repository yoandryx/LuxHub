// src/pages/marketplace.tsx
// LuxHub Premium Marketplace - Luxury Watch NFT Trading Platform
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineViewGrid,
  HiOutlineViewList,
  HiOutlineSparkles,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineX,
  HiOutlineClock,
  HiOutlineShieldCheck,
  HiOutlineCube,
  HiOutlineHeart,
  HiOutlineTag,
} from 'react-icons/hi';
import { FaGavel, FaShoppingCart, FaStore, FaChartLine, FaWallet } from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { BiTrendingUp } from 'react-icons/bi';
import styles from '../styles/Marketplace.module.css';
import MakeOfferModal from '../components/marketplace/MakeOfferModal';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import UnifiedNFTCard from '../components/common/UnifiedNFTCard';
import { VendorCard, VendorData } from '../components/common/VendorCard';

// Types
interface Asset {
  _id: string;
  nftMint: string;
  title?: string;
  model: string;
  brand?: string;
  description?: string;
  priceUSD: number;
  imageUrl?: string;
  imageIpfsUrls?: string[];
  metadataIpfsUrl?: string;
  nftOwnerWallet?: string;
  status: string;
  material?: string;
  dialColor?: string;
  caseSize?: string;
  condition?: string;
  productionYear?: string;
  movement?: string;
  vendor?: {
    _id: string;
    businessName?: string;
    wallet?: string;
  };
  escrowPda?: string;
  acceptingOffers?: boolean;
  minimumOfferUSD?: number;
  createdAt?: string;
}

interface Vendor {
  _id: string;
  wallet: string;
  businessName?: string;
  username?: string;
  profileImage?: string;
  description?: string;
  verified?: boolean;
  approved?: boolean;
  stats?: {
    totalItems: number;
    itemsListed: number;
    inventoryValue: number;
  };
}

interface MarketplaceProps {
  initialAssets: Asset[];
  initialVendors: Vendor[];
  initialSolPrice: number;
}

// Filter options
const BRANDS = [
  'Rolex',
  'Patek Philippe',
  'Audemars Piguet',
  'Richard Mille',
  'Cartier',
  'Omega',
  'Vacheron Constantin',
  'Jaeger-LeCoultre',
  'IWC',
  'Panerai',
];

const MATERIALS = ['Steel', 'Gold', 'Rose Gold', 'White Gold', 'Platinum', 'Titanium', 'Ceramic'];
const DIAL_COLORS = ['Black', 'White', 'Blue', 'Green', 'Silver', 'Champagne', 'Grey'];
const CONDITIONS = ['New', 'Excellent', 'Very Good', 'Good', 'Fair'];
const PRICE_RANGES = [
  { label: 'Under $10K', min: 0, max: 10000 },
  { label: '$10K - $25K', min: 10000, max: 25000 },
  { label: '$25K - $50K', min: 25000, max: 50000 },
  { label: '$50K - $100K', min: 50000, max: 100000 },
  { label: '$100K+', min: 100000, max: Infinity },
];

const SORT_OPTIONS = [
  { value: 'latest', label: 'Newest First' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'brand_az', label: 'Brand: A-Z' },
];

// Gateway for IPFS images
const IPFS_GATEWAY = 'https://teal-working-frog-718.mypinata.cloud/ipfs/';

function resolveImage(asset: Asset): string {
  if (asset.imageUrl?.startsWith('http')) return asset.imageUrl;
  if (asset.imageIpfsUrls?.[0]) {
    const cid = asset.imageIpfsUrls[0];
    if (cid.startsWith('http')) return cid;
    return `${IPFS_GATEWAY}${cid}`;
  }
  return '/fallback.png';
}

// Marketplace Page Component
export default function Marketplace({
  initialAssets,
  initialVendors,
  initialSolPrice,
}: MarketplaceProps) {
  const wallet = useWallet();
  const [solPrice] = useState(initialSolPrice);

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'assets' | 'vendors'>('assets');
  const [showFilters, setShowFilters] = useState(true);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Data state
  const [assets] = useState<Asset[]>(initialAssets);
  const [vendors] = useState<Vendor[]>(initialVendors);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<{ min: number; max: number } | null>(
    null
  );
  const [sortBy, setSortBy] = useState('latest');

  // Expanded filter sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    brand: true,
    price: true,
    material: false,
    color: false,
    condition: false,
  });

  // Modal state
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Toggle filter section
  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Toggle filter chip
  const toggleFilter = (
    value: string,
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (selected.includes(value)) {
      setter(selected.filter((v) => v !== value));
    } else {
      setter([...selected, value]);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedBrands([]);
    setSelectedMaterials([]);
    setSelectedColors([]);
    setSelectedConditions([]);
    setSelectedPriceRange(null);
    setSearchQuery('');
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBrands.length) count += selectedBrands.length;
    if (selectedMaterials.length) count += selectedMaterials.length;
    if (selectedColors.length) count += selectedColors.length;
    if (selectedConditions.length) count += selectedConditions.length;
    if (selectedPriceRange) count += 1;
    return count;
  }, [selectedBrands, selectedMaterials, selectedColors, selectedConditions, selectedPriceRange]);

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let result = assets.filter((a) => a.status === 'listed');

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.model?.toLowerCase().includes(query) ||
          a.brand?.toLowerCase().includes(query) ||
          a.description?.toLowerCase().includes(query) ||
          a.title?.toLowerCase().includes(query)
      );
    }

    // Brand filter
    if (selectedBrands.length) {
      result = result.filter((a) => a.brand && selectedBrands.includes(a.brand));
    }

    // Material filter
    if (selectedMaterials.length) {
      result = result.filter((a) => a.material && selectedMaterials.includes(a.material));
    }

    // Color filter
    if (selectedColors.length) {
      result = result.filter((a) => a.dialColor && selectedColors.includes(a.dialColor));
    }

    // Condition filter
    if (selectedConditions.length) {
      result = result.filter((a) => a.condition && selectedConditions.includes(a.condition));
    }

    // Price filter
    if (selectedPriceRange) {
      result = result.filter(
        (a) => a.priceUSD >= selectedPriceRange.min && a.priceUSD <= selectedPriceRange.max
      );
    }

    // Sort
    switch (sortBy) {
      case 'price_low':
        result.sort((a, b) => a.priceUSD - b.priceUSD);
        break;
      case 'price_high':
        result.sort((a, b) => b.priceUSD - a.priceUSD);
        break;
      case 'brand_az':
        result.sort((a, b) => (a.brand || '').localeCompare(b.brand || ''));
        break;
      case 'latest':
      default:
        result.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
    }

    return result;
  }, [
    assets,
    searchQuery,
    selectedBrands,
    selectedMaterials,
    selectedColors,
    selectedConditions,
    selectedPriceRange,
    sortBy,
  ]);

  // Filter vendors by search
  const filteredVendors = useMemo(() => {
    if (!searchQuery) return vendors;
    const query = searchQuery.toLowerCase();
    return vendors.filter(
      (v) =>
        v.businessName?.toLowerCase().includes(query) || v.username?.toLowerCase().includes(query)
    );
  }, [vendors, searchQuery]);

  // Handle buy action
  const handleBuy = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    // TODO: Implement buy flow with escrow
    alert(
      `Buy functionality coming soon!\n\nAsset: ${asset.model}\nPrice: $${asset.priceUSD.toLocaleString()}`
    );
  }, []);

  // Handle offer action
  const handleOffer = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setShowOfferModal(true);
  }, []);

  // Handle view details
  const handleViewDetails = useCallback((asset: Asset) => {
    setSelectedAsset(asset);
    setShowDetailModal(true);
  }, []);

  // Format price
  const formatPrice = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(usd);
  };

  const formatSol = (usd: number) => {
    if (!solPrice) return '---';
    return (usd / solPrice).toFixed(2);
  };

  // Stagger animation for cards
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  };

  return (
    <>
      <Head>
        <title>Marketplace | LuxHub</title>
        <meta
          name="description"
          content="Explore verified luxury watches backed by NFTs. Buy, sell, and make offers on authenticated timepieces."
        />
      </Head>

      <div className={styles.page}>
        {/* Ambient Background */}
        <div className={styles.ambientBg} />

        {/* Main Content */}
        <main className={styles.main}>
          {/* Top Bar */}
          <div className={styles.topBar}>
            {/* Tabs */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${activeTab === 'assets' ? styles.active : ''}`}
                onClick={() => setActiveTab('assets')}
              >
                <HiOutlineCube />
                <span>Watches</span>
                <span className={styles.tabCount}>{filteredAssets.length}</span>
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'vendors' ? styles.active : ''}`}
                onClick={() => setActiveTab('vendors')}
              >
                <FaStore />
                <span>Vendors</span>
                <span className={styles.tabCount}>{vendors.length}</span>
              </button>
            </div>

            {/* Search */}
            <div className={styles.searchWrapper}>
              <HiOutlineSearch className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder={activeTab === 'assets' ? 'Search watches...' : 'Search vendors...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>
                  <HiOutlineX />
                </button>
              )}
            </div>

            {/* Controls */}
            <div className={styles.controls}>
              {activeTab === 'assets' && (
                <>
                  {/* Sort Dropdown */}
                  <div className={styles.sortWrapper}>
                    <select
                      className={styles.sortSelect}
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <HiOutlineChevronDown className={styles.sortIcon} />
                  </div>

                  {/* View Mode Toggle */}
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                      onClick={() => setViewMode('grid')}
                      title="Grid View"
                    >
                      <HiOutlineViewGrid />
                    </button>
                    <button
                      className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
                      onClick={() => setViewMode('list')}
                      title="List View"
                    >
                      <HiOutlineViewList />
                    </button>
                  </div>

                  {/* Filter Toggle (Desktop) */}
                  <button
                    className={`${styles.filterToggle} ${showFilters ? styles.active : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <HiOutlineFilter />
                    <span>Filters</span>
                    {activeFilterCount > 0 && (
                      <span className={styles.filterBadge}>{activeFilterCount}</span>
                    )}
                  </button>

                  {/* Mobile Filter Button */}
                  <button
                    className={styles.mobileFilterBtn}
                    onClick={() => setShowMobileFilters(true)}
                  >
                    <HiOutlineFilter />
                    {activeFilterCount > 0 && (
                      <span className={styles.filterBadge}>{activeFilterCount}</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className={styles.contentArea}>
            {/* Sidebar Filters (Desktop) */}
            {activeTab === 'assets' && (
              <AnimatePresence>
                {showFilters && (
                  <motion.aside
                    className={styles.sidebar}
                    initial={{ opacity: 0, x: -20, width: 0 }}
                    animate={{ opacity: 1, x: 0, width: 280 }}
                    exit={{ opacity: 0, x: -20, width: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className={styles.sidebarInner}>
                      <div className={styles.sidebarHeader}>
                        <h3>Filters</h3>
                        {activeFilterCount > 0 && (
                          <button className={styles.clearBtn} onClick={clearFilters}>
                            Clear All
                          </button>
                        )}
                      </div>

                      {/* Brand Filter */}
                      <div className={styles.filterSection}>
                        <button
                          className={styles.filterHeader}
                          onClick={() => toggleSection('brand')}
                        >
                          <span>Brand</span>
                          <HiOutlineChevronDown
                            className={`${styles.chevron} ${expandedSections.brand ? styles.expanded : ''}`}
                          />
                        </button>
                        <AnimatePresence>
                          {expandedSections.brand && (
                            <motion.div
                              className={styles.filterOptions}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {BRANDS.map((brand) => (
                                <button
                                  key={brand}
                                  className={`${styles.filterChip} ${selectedBrands.includes(brand) ? styles.active : ''}`}
                                  onClick={() =>
                                    toggleFilter(brand, selectedBrands, setSelectedBrands)
                                  }
                                >
                                  {brand}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Price Filter */}
                      <div className={styles.filterSection}>
                        <button
                          className={styles.filterHeader}
                          onClick={() => toggleSection('price')}
                        >
                          <span>Price Range</span>
                          <HiOutlineChevronDown
                            className={`${styles.chevron} ${expandedSections.price ? styles.expanded : ''}`}
                          />
                        </button>
                        <AnimatePresence>
                          {expandedSections.price && (
                            <motion.div
                              className={styles.filterOptions}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {PRICE_RANGES.map((range) => (
                                <button
                                  key={range.label}
                                  className={`${styles.filterChip} ${selectedPriceRange?.min === range.min ? styles.active : ''}`}
                                  onClick={() =>
                                    setSelectedPriceRange(
                                      selectedPriceRange?.min === range.min ? null : range
                                    )
                                  }
                                >
                                  {range.label}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Material Filter */}
                      <div className={styles.filterSection}>
                        <button
                          className={styles.filterHeader}
                          onClick={() => toggleSection('material')}
                        >
                          <span>Material</span>
                          <HiOutlineChevronDown
                            className={`${styles.chevron} ${expandedSections.material ? styles.expanded : ''}`}
                          />
                        </button>
                        <AnimatePresence>
                          {expandedSections.material && (
                            <motion.div
                              className={styles.filterOptions}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {MATERIALS.map((mat) => (
                                <button
                                  key={mat}
                                  className={`${styles.filterChip} ${selectedMaterials.includes(mat) ? styles.active : ''}`}
                                  onClick={() =>
                                    toggleFilter(mat, selectedMaterials, setSelectedMaterials)
                                  }
                                >
                                  {mat}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Dial Color Filter */}
                      <div className={styles.filterSection}>
                        <button
                          className={styles.filterHeader}
                          onClick={() => toggleSection('color')}
                        >
                          <span>Dial Color</span>
                          <HiOutlineChevronDown
                            className={`${styles.chevron} ${expandedSections.color ? styles.expanded : ''}`}
                          />
                        </button>
                        <AnimatePresence>
                          {expandedSections.color && (
                            <motion.div
                              className={styles.filterOptions}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {DIAL_COLORS.map((color) => (
                                <button
                                  key={color}
                                  className={`${styles.filterChip} ${selectedColors.includes(color) ? styles.active : ''}`}
                                  onClick={() =>
                                    toggleFilter(color, selectedColors, setSelectedColors)
                                  }
                                >
                                  {color}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Condition Filter */}
                      <div className={styles.filterSection}>
                        <button
                          className={styles.filterHeader}
                          onClick={() => toggleSection('condition')}
                        >
                          <span>Condition</span>
                          <HiOutlineChevronDown
                            className={`${styles.chevron} ${expandedSections.condition ? styles.expanded : ''}`}
                          />
                        </button>
                        <AnimatePresence>
                          {expandedSections.condition && (
                            <motion.div
                              className={styles.filterOptions}
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                            >
                              {CONDITIONS.map((cond) => (
                                <button
                                  key={cond}
                                  className={`${styles.filterChip} ${selectedConditions.includes(cond) ? styles.active : ''}`}
                                  onClick={() =>
                                    toggleFilter(cond, selectedConditions, setSelectedConditions)
                                  }
                                >
                                  {cond}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>
            )}

            {/* Main Grid */}
            <div className={styles.gridArea}>
              {/* Active Filters Display */}
              {activeTab === 'assets' && activeFilterCount > 0 && (
                <div className={styles.activeFilters}>
                  {selectedBrands.map((b) => (
                    <span
                      key={b}
                      className={styles.activeChip}
                      onClick={() => toggleFilter(b, selectedBrands, setSelectedBrands)}
                    >
                      {b} <HiOutlineX />
                    </span>
                  ))}
                  {selectedMaterials.map((m) => (
                    <span
                      key={m}
                      className={styles.activeChip}
                      onClick={() => toggleFilter(m, selectedMaterials, setSelectedMaterials)}
                    >
                      {m} <HiOutlineX />
                    </span>
                  ))}
                  {selectedColors.map((c) => (
                    <span
                      key={c}
                      className={styles.activeChip}
                      onClick={() => toggleFilter(c, selectedColors, setSelectedColors)}
                    >
                      {c} <HiOutlineX />
                    </span>
                  ))}
                  {selectedConditions.map((c) => (
                    <span
                      key={c}
                      className={styles.activeChip}
                      onClick={() => toggleFilter(c, selectedConditions, setSelectedConditions)}
                    >
                      {c} <HiOutlineX />
                    </span>
                  ))}
                  {selectedPriceRange && (
                    <span className={styles.activeChip} onClick={() => setSelectedPriceRange(null)}>
                      {PRICE_RANGES.find((r) => r.min === selectedPriceRange.min)?.label}{' '}
                      <HiOutlineX />
                    </span>
                  )}
                </div>
              )}

              {/* Assets Tab */}
              {activeTab === 'assets' && (
                <>
                  {filteredAssets.length > 0 ? (
                    <motion.div
                      className={`${styles.grid} ${viewMode === 'list' ? styles.listView : ''}`}
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      key={`${sortBy}-${activeFilterCount}`}
                    >
                      {filteredAssets.map((asset) => (
                        <motion.div key={asset._id} variants={cardVariants}>
                          <UnifiedNFTCard
                            title={asset.model || asset.title || 'Unknown Watch'}
                            image={resolveImage(asset)}
                            price={parseFloat(formatSol(asset.priceUSD))}
                            priceLabel="SOL"
                            priceUSD={asset.priceUSD}
                            mintAddress={asset.nftMint}
                            owner={asset.nftOwnerWallet}
                            brand={asset.brand || undefined}
                            model={asset.model}
                            material={asset.material || undefined}
                            dialColor={asset.dialColor || undefined}
                            caseSize={asset.caseSize || undefined}
                            condition={asset.condition || undefined}
                            status={(asset.status as any) || 'listed'}
                            isVerified={!!asset.vendor?.businessName}
                            acceptingOffers={asset.acceptingOffers}
                            variant={viewMode === 'list' ? 'list' : 'default'}
                            showBadge={true}
                            showPrice={true}
                            showOverlay={true}
                            showActionButtons={true}
                            onViewDetails={() => handleViewDetails(asset)}
                            onQuickBuy={() => handleBuy(asset)}
                            onOffer={() => handleOffer(asset)}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <div className={styles.emptyState}>
                      <HiOutlineCube className={styles.emptyIcon} />
                      <h3>No watches found</h3>
                      <p>Try adjusting your filters or search query</p>
                      <button className={styles.clearFiltersBtn} onClick={clearFilters}>
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Vendors Tab - Horizontal Slider */}
              {activeTab === 'vendors' && (
                <div className={styles.vendorSliderContainer}>
                  <h2 className={styles.vendorSliderTitle}>
                    <FaStore /> Verified Vendors
                  </h2>
                  <div className={styles.vendorSlider}>
                    <motion.div
                      className={styles.vendorSliderTrack}
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {filteredVendors.map((vendor) => (
                        <motion.div key={vendor._id} variants={cardVariants}>
                          <VendorCard
                            vendor={{
                              wallet: vendor.wallet,
                              name: vendor.businessName || vendor.username || 'Vendor',
                              username: vendor.username || vendor.wallet?.slice(0, 8) || 'vendor',
                              avatarUrl: vendor.profileImage || undefined,
                              verified: vendor.verified,
                              stats: vendor.stats,
                            }}
                            variant="slider"
                            showStats={false}
                          />
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>

                  {filteredVendors.length === 0 && (
                    <div className={styles.emptyState}>
                      <FaStore className={styles.emptyIcon} />
                      <h3>No vendors found</h3>
                      <p>Try a different search term</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Mobile Filter Modal */}
        <AnimatePresence>
          {showMobileFilters && (
            <motion.div
              className={styles.mobileFilterOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileFilters(false)}
            >
              <motion.div
                className={styles.mobileFilterPanel}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.mobileFilterHeader}>
                  <h3>Filters</h3>
                  <button onClick={() => setShowMobileFilters(false)}>
                    <HiOutlineX />
                  </button>
                </div>

                <div className={styles.mobileFilterBody}>
                  {/* Reuse filter sections here - simplified for mobile */}
                  <div className={styles.mobileFilterSection}>
                    <h4>Brand</h4>
                    <div className={styles.mobileFilterChips}>
                      {BRANDS.map((brand) => (
                        <button
                          key={brand}
                          className={`${styles.filterChip} ${selectedBrands.includes(brand) ? styles.active : ''}`}
                          onClick={() => toggleFilter(brand, selectedBrands, setSelectedBrands)}
                        >
                          {brand}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.mobileFilterSection}>
                    <h4>Price Range</h4>
                    <div className={styles.mobileFilterChips}>
                      {PRICE_RANGES.map((range) => (
                        <button
                          key={range.label}
                          className={`${styles.filterChip} ${selectedPriceRange?.min === range.min ? styles.active : ''}`}
                          onClick={() =>
                            setSelectedPriceRange(
                              selectedPriceRange?.min === range.min ? null : range
                            )
                          }
                        >
                          {range.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.mobileFilterFooter}>
                  <button className={styles.clearBtn} onClick={clearFilters}>
                    Clear All
                  </button>
                  <button className={styles.applyBtn} onClick={() => setShowMobileFilters(false)}>
                    Show {filteredAssets.length} Results
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        {showDetailModal && selectedAsset && (
          <div className={styles.detailOverlay} onClick={() => setShowDetailModal(false)}>
            <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
              <button className={styles.closeModal} onClick={() => setShowDetailModal(false)}>
                <HiOutlineX />
              </button>
              <NftDetailCard
                metadataUri={selectedAsset.metadataIpfsUrl || ''}
                mintAddress={selectedAsset.nftMint}
                onClose={() => setShowDetailModal(false)}
              />
            </div>
          </div>
        )}

        {/* Offer Modal */}
        {showOfferModal && selectedAsset && (
          <MakeOfferModal
            escrow={{
              escrowPda: selectedAsset.escrowPda || '',
              listingPriceUSD: selectedAsset.priceUSD,
              minimumOfferUSD: selectedAsset.minimumOfferUSD,
              asset: {
                model: selectedAsset.model,
                imageUrl: resolveImage(selectedAsset),
              },
              vendor: selectedAsset.vendor
                ? {
                    businessName: selectedAsset.vendor.businessName || undefined,
                  }
                : undefined,
            }}
            onClose={() => setShowOfferModal(false)}
            onSuccess={() => {
              setShowOfferModal(false);
              alert('Offer submitted successfully!');
            }}
          />
        )}
      </div>
    </>
  );
}

// Server-side data fetching
export const getServerSideProps: GetServerSideProps = async () => {
  try {
    const dbConnect = (await import('@/lib/database/mongodb')).default;
    await dbConnect();

    const { Asset } = await import('../lib/models/Assets');
    const VendorProfileModel = (await import('../lib/models/VendorProfile')).default;
    const { Escrow } = await import('../lib/models/Escrow');

    // Fetch listed assets
    const assets = await Asset.find({
      status: 'listed',
      deleted: { $ne: true },
    })
      .populate('vendor', 'businessName wallet')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Fetch approved vendors with stats
    const vendors = await VendorProfileModel.find({ approved: true }).lean();

    // Get vendor stats
    const vendorWallets = vendors.map((v: any) => v.wallet);
    const escrows = await Escrow.find({
      sellerWallet: { $in: vendorWallets },
      deleted: { $ne: true },
      status: { $nin: ['cancelled', 'failed'] },
    }).lean();

    const vendorsWithStats = vendors.map((v: any) => {
      const vendorEscrows = escrows.filter((e: any) => e.sellerWallet === v.wallet);
      return {
        _id: v._id.toString(),
        wallet: v.wallet || '',
        businessName: v.businessName || null,
        username: v.username || null,
        profileImage: v.profileImage || null,
        description: v.description || null,
        verified: v.verified || false,
        approved: v.approved || false,
        stats: {
          totalItems: vendorEscrows.length,
          itemsListed: vendorEscrows.filter(
            (e: any) => e.status === 'listed' || e.status === 'initiated'
          ).length,
          inventoryValue: vendorEscrows.reduce(
            (sum: number, e: any) => sum + (e.listingPriceUSD || 0),
            0
          ),
        },
      };
    });

    // Get SOL price
    let solPrice = 100;
    try {
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      if (res.ok) {
        const data = await res.json();
        solPrice = data.solana?.usd || 100;
      }
    } catch (e) {
      console.error('Failed to fetch SOL price');
    }

    // Transform assets for client (ensure no undefined values for JSON serialization)
    const transformedAssets = assets.map((a: any) => ({
      _id: a._id.toString(),
      nftMint: a.nftMint || '',
      title: a.title || a.model || 'Untitled',
      model: a.model || 'Unknown Model',
      brand: a.brand || a.metaplexMetadata?.attributes?.brand || null,
      description: a.description || null,
      priceUSD: a.priceUSD || 0,
      imageUrl: a.imageUrl || null,
      imageIpfsUrls: a.imageIpfsUrls || [],
      metadataIpfsUrl: a.metadataIpfsUrl || null,
      nftOwnerWallet: a.nftOwnerWallet || null,
      status: a.status || 'listed',
      material: a.material || a.metaplexMetadata?.attributes?.material || null,
      dialColor: a.dialColor || a.metaplexMetadata?.attributes?.dialColor || null,
      caseSize: a.caseSize || a.metaplexMetadata?.attributes?.caseSize || null,
      condition: a.condition || a.metaplexMetadata?.attributes?.condition || null,
      productionYear: a.productionYear || a.metaplexMetadata?.attributes?.productionYear || null,
      movement: a.movement || a.metaplexMetadata?.attributes?.movement || null,
      vendor: a.vendor
        ? {
            _id: a.vendor._id?.toString() || null,
            businessName: a.vendor.businessName || null,
            wallet: a.vendor.wallet || null,
          }
        : null,
      escrowPda: a.escrowPda || null,
      acceptingOffers: true,
      minimumOfferUSD: a.priceUSD ? Math.floor(a.priceUSD * 0.7) : null,
      createdAt: a.createdAt?.toISOString() || null,
    }));

    return {
      props: {
        initialAssets: transformedAssets,
        initialVendors: vendorsWithStats,
        initialSolPrice: solPrice,
      },
    };
  } catch (error) {
    console.error('Marketplace getServerSideProps error:', error);
    return {
      props: {
        initialAssets: [],
        initialVendors: [],
        initialSolPrice: 100,
      },
    };
  }
};
