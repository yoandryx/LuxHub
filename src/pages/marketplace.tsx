// src/pages/marketplace.tsx
// LuxHub Premium Marketplace - Scalable Luxury Watch NFT Trading Platform
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineSearch,
  HiOutlineFilter,
  HiOutlineViewGrid,
  HiOutlineViewList,
  HiOutlineX,
  HiOutlineCube,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import { FaStore, FaUsers, FaLock, FaChartLine } from 'react-icons/fa';
import { HiOutlineBuildingStorefront } from 'react-icons/hi2';
import { BiTargetLock } from 'react-icons/bi';
import { SiSolana } from 'react-icons/si';
import styles from '../styles/Marketplace.module.css';
import MakeOfferModal from '../components/marketplace/MakeOfferModal';
import BuyModal from '../components/marketplace/BuyModal';
import FilterSidebar, { FilterGroup } from '../components/marketplace/FilterSidebar';
import FilterDrawer from '../components/marketplace/FilterDrawer';
import PriceRangeSlider from '../components/marketplace/PriceRangeSlider';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import UnifiedNFTCard from '../components/common/UnifiedNFTCard';
import { VendorCard } from '../components/common/VendorCard';
import { useVendors, usePools, useEscrowListings, useSolPrice } from '../hooks/useSWR';

// Types
type MarketSection = 'direct_sales' | 'pools' | 'custody';

interface EscrowListing {
  _id: string;
  escrowPda: string;
  nftMint: string;
  sellerWallet: string;
  vendorWallet?: string;
  buyerWallet?: string;
  listingPrice: number;
  listingPriceUSD: number;
  status: string;
  acceptingOffers: boolean;
  minimumOfferUSD?: number;
  createdAt: string;
  asset?: {
    _id: string;
    model: string;
    brand?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
    arweaveTxId?: string;
    serial?: string;
    material?: string;
    dialColor?: string;
    caseSize?: string;
    condition?: string;
    productionYear?: string;
    movement?: string;
    waterResistance?: string;
    boxPapers?: string;
    country?: string;
    certificate?: string;
    features?: string;
    limitedEdition?: string;
    warrantyInfo?: string;
    provenance?: string;
  };
  vendor?: {
    businessName?: string;
    wallet?: string;
    verified?: boolean;
  };
}

interface Pool {
  _id: string;
  poolNumber?: string;
  targetAmountUSD: number;
  sharesSold: number;
  totalShares: number;
  sharePriceUSD: number;
  minBuyInUSD: number;
  maxInvestors: number;
  projectedROI: number;
  status: string;
  createdAt: string;
  vendorWallet?: string;
  participants?: Array<{ wallet: string }>;
  asset?: {
    _id?: string;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
    arweaveTxId?: string;
    brand?: string;
    model?: string;
    description?: string;
    priceUSD?: number;
  };
  vendor?: { businessName?: string };
  // Computed helpers
  title?: string;
  brand?: string;
  model?: string;
  description?: string;
  image?: string;
  currentAmountUSD?: number;
  currentInvestors?: number;
}

interface CustodyItem {
  _id: string;
  poolId: string;
  title: string;
  description: string;
  image: string;
  originalPurchaseUSD: number;
  resaleListingPriceUSD: number;
  resaleListingPriceSol: number;
  totalInvestors: number;
  projectedProfitPercent: number;
  brand: string;
  model: string;
  status: string;
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
  'IWC',
];

const MATERIALS = ['Steel', 'Gold', 'Titanium', 'Platinum', 'Ceramic'];
const CONDITIONS = ['Unworn', 'Excellent', 'Very Good', 'Good', 'Fair'];

const SORT_OPTIONS = [
  { value: 'latest', label: 'Newest First' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'brand_az', label: 'Brand: A-Z' },
];

// Import shared image utilities for consistent gateway handling
import {
  resolveAssetImage,
  resolvePoolImage,
  handleImageError,
  PLACEHOLDER_IMAGE,
} from '../utils/imageUtils';

function resolveImage(listing: EscrowListing): string {
  return resolveAssetImage(listing.asset);
}

// Mock listings for demo when no real NFTs are available
const MOCK_LISTINGS: EscrowListing[] = [
  {
    _id: 'demo_001',
    escrowPda: '',
    nftMint: 'demo_rolex_daytona',
    sellerWallet: 'LuxHub',
    listingPrice: 450_000_000_000,
    listingPriceUSD: 250000,
    status: 'listed',
    acceptingOffers: true,
    minimumOfferUSD: 220000,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    asset: {
      _id: 'asset_001',
      model: 'Daytona Rainbow',
      brand: 'Rolex',
      title: 'Rolex Daytona Rainbow',
      description:
        'Limited edition Daytona with factory-set rainbow sapphires. 40mm Everose gold case.',
      imageUrl: '/images/rolex-daytona-rainbow.jpg',
      material: 'Gold',
      dialColor: 'Black',
      caseSize: '40mm',
      condition: 'Excellent',
    },
    vendor: { businessName: 'LuxHub Official', verified: true },
  },
  {
    _id: 'demo_002',
    escrowPda: '',
    nftMint: 'demo_rm_027',
    sellerWallet: 'LuxHub',
    listingPrice: 1_250_000_000_000,
    listingPriceUSD: 800000,
    status: 'listed',
    acceptingOffers: true,
    minimumOfferUSD: 700000,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    asset: {
      _id: 'asset_002',
      model: 'RM 027',
      brand: 'Richard Mille',
      title: 'Richard Mille RM 027',
      description: 'Ultra-lightweight tourbillon worn by Rafael Nadal. Extremely rare piece.',
      imageUrl: '/images/rm-027.jpg',
      material: 'Titanium',
      dialColor: 'Skeleton',
      caseSize: '47mm',
      condition: 'Excellent',
    },
    vendor: { businessName: 'LuxHub Official', verified: true },
  },
  {
    _id: 'demo_003',
    escrowPda: '',
    nftMint: 'demo_ap_offshore',
    sellerWallet: 'LuxHub',
    listingPrice: 280_000_000_000,
    listingPriceUSD: 85000,
    status: 'listed',
    acceptingOffers: true,
    minimumOfferUSD: 75000,
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    asset: {
      _id: 'asset_003',
      model: 'Royal Oak Offshore',
      brand: 'Audemars Piguet',
      title: 'AP Royal Oak Offshore',
      description: 'Limited edition collaboration piece. High demand expected on secondary market.',
      imageUrl: '/images/ap-offshore.jpg',
      material: 'Steel',
      dialColor: 'Blue',
      caseSize: '44mm',
      condition: 'Excellent',
    },
    vendor: { businessName: 'LuxHub Official', verified: true },
  },
  {
    _id: 'demo_004',
    escrowPda: '',
    nftMint: 'demo_cartier_crash',
    sellerWallet: 'LuxHub',
    listingPrice: 520_000_000_000,
    listingPriceUSD: 280000,
    status: 'listed',
    acceptingOffers: true,
    minimumOfferUSD: 250000,
    createdAt: new Date(Date.now() - 345600000).toISOString(),
    asset: {
      _id: 'asset_004',
      model: 'Crash London',
      brand: 'Cartier',
      title: 'Cartier Crash London',
      description: 'Iconic asymmetric design. Museum-quality piece with exceptional provenance.',
      imageUrl: '/images/cartier-crash.jpg',
      material: 'Gold',
      dialColor: 'White',
      caseSize: '38mm',
      condition: 'Excellent',
    },
    vendor: { businessName: 'LuxHub Official', verified: true },
  },
];

// ─── Onboarding Tour ─────────────────────────────────────────────
interface TourStep {
  target: string;
  title: string;
  description: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const MARKETPLACE_TOUR_STEPS: TourStep[] = [
  {
    target: 'vendor-slider',
    title: 'Verified Dealers',
    description:
      'Browse our network of authenticated luxury watch dealers. Each vendor is manually verified before listing on LuxHub. Click any dealer to view their full collection and reputation.',
    position: 'bottom',
  },
  {
    target: 'section-tabs',
    title: 'Browse by Category',
    description:
      'Direct Sales are individual listings you can buy outright or make offers on. Pools let you participate in tokenized group ownership. Custody shows watches currently held in secure storage awaiting resale.',
    position: 'bottom',
  },
  {
    target: 'search-bar',
    title: 'Search & Discover',
    description:
      'Search by brand name, model, Solana mint address, or keywords. Results update instantly across all categories.',
    position: 'bottom',
  },
  {
    target: 'controls-area',
    title: 'Sort, View & Filter',
    description:
      'Sort listings by price, date, or brand. Toggle between grid and list layouts. Open the filter panel to narrow by brand, price range, material, or condition.',
    position: 'bottom',
  },
  {
    target: 'nft-grid',
    title: 'Marketplace Listings',
    description:
      'Each card shows the watch image, brand, price in SOL and USD, and vendor info. Click a card to view the full holographic detail card with specifications, provenance, and purchase options.',
    position: 'top',
  },
];

const MarketplaceTour: React.FC<{ onClose: () => void }> = memo(({ onClose }) => {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<globalThis.DOMRect | null>(null);

  useEffect(() => {
    const target = document.querySelector(`[data-tour="${MARKETPLACE_TOUR_STEPS[step].target}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => {
        setRect(target.getBoundingClientRect());
      }, 350);
      return () => clearTimeout(timer);
    } else {
      setRect(null);
    }
  }, [step]);

  useEffect(() => {
    const update = () => {
      const target = document.querySelector(`[data-tour="${MARKETPLACE_TOUR_STEPS[step].target}"]`);
      if (target) setRect(target.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [step]);

  const handleNext = () => {
    if (step < MARKETPLACE_TOUR_STEPS.length - 1) setStep(step + 1);
    else handleDone();
  };

  const handleDone = () => {
    localStorage.setItem('luxhub_marketplace_tour_seen', '1');
    onClose();
  };

  const current = MARKETPLACE_TOUR_STEPS[step];
  const pad = 8;

  const tooltipStyle: React.CSSProperties = {};
  if (rect) {
    const pos = current.position;
    if (pos === 'bottom') {
      tooltipStyle.top = rect.bottom + pad + 12;
      tooltipStyle.left = rect.left + rect.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'top') {
      tooltipStyle.bottom = window.innerHeight - rect.top + pad + 12;
      tooltipStyle.left = rect.left + rect.width / 2;
      tooltipStyle.transform = 'translateX(-50%)';
    } else if (pos === 'right') {
      tooltipStyle.top = rect.top + rect.height / 2;
      tooltipStyle.left = rect.right + pad + 12;
      tooltipStyle.transform = 'translateY(-50%)';
    } else {
      tooltipStyle.top = rect.top + rect.height / 2;
      tooltipStyle.right = window.innerWidth - rect.left + pad + 12;
      tooltipStyle.transform = 'translateY(-50%)';
    }
  }

  return createPortal(
    <div className={styles.tourOverlay}>
      <div
        className={styles.tourBackdrop}
        onClick={handleDone}
        style={
          rect
            ? {
                clipPath: `polygon(
            0% 0%, 0% 100%, ${rect.left - pad}px 100%,
            ${rect.left - pad}px ${rect.top - pad}px,
            ${rect.right + pad}px ${rect.top - pad}px,
            ${rect.right + pad}px ${rect.bottom + pad}px,
            ${rect.left - pad}px ${rect.bottom + pad}px,
            ${rect.left - pad}px 100%, 100% 100%, 100% 0%
          )`,
              }
            : {}
        }
      />

      {rect && (
        <div
          className={styles.tourSpotlight}
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
          }}
        />
      )}

      {rect && (
        <div className={styles.tourTooltip} style={tooltipStyle}>
          <div className={styles.tourTooltipHeader}>
            <span className={styles.tourTooltipStep}>
              {step + 1} of {MARKETPLACE_TOUR_STEPS.length}
            </span>
            <button className={styles.tourTooltipSkip} onClick={handleDone}>
              Skip tour
            </button>
          </div>
          <h3 className={styles.tourTooltipTitle}>{current.title}</h3>
          <p className={styles.tourTooltipDesc}>{current.description}</p>
          <div className={styles.tourTooltipActions}>
            {step > 0 && (
              <button className={styles.tourBtnBack} onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button className={styles.tourBtnNext} onClick={handleNext}>
              {step === MARKETPLACE_TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
          <div className={styles.tourDots}>
            {MARKETPLACE_TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`${styles.tourDot} ${i === step ? styles.tourDotActive : ''} ${i < step ? styles.tourDotDone : ''}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
});
MarketplaceTour.displayName = 'MarketplaceTour';

// Marketplace Page Component
export default function Marketplace() {
  const wallet = useWallet();
  const router = useRouter();

  // SWR hooks for data fetching with caching
  const { vendors, verifiedVendors, isLoading: isLoadingVendors } = useVendors();
  const {
    listings,
    isLoading: isLoadingListings,
    mutate: mutateListings,
  } = useEscrowListings('listed,initiated,offer_accepted', 100);
  const { pools: openPools, isLoading: isLoadingPools } = usePools('open');
  const { pools: listedPools, isLoading: isLoadingCustody } = usePools('listed');
  const { price: solPrice } = useSolPrice();

  // Auto-open pay modal when arriving from accepted offer notification (?pay=escrowPda)
  useEffect(() => {
    const payPda = router.query.pay as string;
    if (payPda && listings?.length && wallet.connected) {
      const listing = listings.find(
        (l: EscrowListing) => l.escrowPda === payPda && l.status === 'offer_accepted'
      );
      if (listing) {
        setSelectedListing(listing);
        setShowBuyModal(true);
        // Clean the URL
        router.replace('/marketplace', undefined, { shallow: true });
      }
    }
  }, [router.query.pay, listings, wallet.connected]);

  // Auto-open offer modal when arriving from vendor profile (?offer=escrowPda)
  useEffect(() => {
    const offerPda = router.query.offer as string;
    if (offerPda && listings?.length && wallet.connected) {
      const listing = listings.find((l: EscrowListing) => l.escrowPda === offerPda);
      if (listing) {
        setSelectedListing(listing);
        setShowOfferModal(true);
        router.replace('/marketplace', undefined, { shallow: true });
      }
    }
  }, [router.query.offer, listings, wallet.connected]);

  // Tour state
  const [showTour, setShowTour] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem('luxhub_marketplace_tour_seen');
    if (!seen) setShowTour(true);
  }, []);

  // View state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeSection, setActiveSection] = useState<MarketSection>('direct_sales');
  const [showFilters, setShowFilters] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [selectedPriceRange, setSelectedPriceRange] = useState<[number, number]>([0, 500000]);
  const [committedPriceRange, setCommittedPriceRange] = useState<[number, number]>([0, 500000]);
  const [sortBy, setSortBy] = useState('latest');

  // Expanded filter sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    brand: true,
    price: true,
    material: false,
    condition: false,
  });

  // Modal state
  const [selectedListing, setSelectedListing] = useState<EscrowListing | null>(null);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
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
    setSelectedConditions([]);
    setSelectedPriceRange([0, 500000]);
    setCommittedPriceRange([0, 500000]);
    setSearchQuery('');
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedBrands.length) count += selectedBrands.length;
    if (selectedMaterials.length) count += selectedMaterials.length;
    if (selectedConditions.length) count += selectedConditions.length;
    if (committedPriceRange[0] > 0 || committedPriceRange[1] < 500000) count += 1;
    return count;
  }, [selectedBrands, selectedMaterials, selectedConditions, committedPriceRange]);

  // Filter groups for the sidebar component (price handled by PriceRangeSlider slot)
  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        key: 'brand',
        label: 'Brand',
        options: BRANDS,
        selected: selectedBrands,
        onToggle: (v: string) => toggleFilter(v, selectedBrands, setSelectedBrands),
        defaultExpanded: true,
      },
      {
        key: 'material',
        label: 'Material',
        options: MATERIALS,
        selected: selectedMaterials,
        onToggle: (v: string) => toggleFilter(v, selectedMaterials, setSelectedMaterials),
      },
      {
        key: 'condition',
        label: 'Condition',
        options: CONDITIONS,
        selected: selectedConditions,
        onToggle: (v: string) => toggleFilter(v, selectedConditions, setSelectedConditions),
      },
    ],
    [selectedBrands, selectedMaterials, selectedConditions]
  );

  // Source listings: real data with mock fallback
  const sourceListings = useMemo(() => {
    const real = listings.filter(
      (l: EscrowListing) => l.status === 'listed' || l.status === 'initiated'
    );
    return real.length > 0 ? real : MOCK_LISTINGS;
  }, [listings]);

  // Filter and sort listings
  const filteredListings = useMemo(() => {
    let result = [...sourceListings];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (l: EscrowListing) =>
          l.asset?.model?.toLowerCase().includes(query) ||
          l.asset?.brand?.toLowerCase().includes(query) ||
          l.asset?.description?.toLowerCase().includes(query) ||
          l.nftMint?.toLowerCase().includes(query)
      );
    }

    // Brand filter
    if (selectedBrands.length) {
      result = result.filter(
        (l: EscrowListing) => l.asset?.brand && selectedBrands.includes(l.asset.brand)
      );
    }

    // Price filter
    if (committedPriceRange[0] > 0 || committedPriceRange[1] < 500000) {
      result = result.filter(
        (l: EscrowListing) =>
          l.listingPriceUSD >= committedPriceRange[0] && l.listingPriceUSD <= committedPriceRange[1]
      );
    }

    // Material filter
    if (selectedMaterials.length) {
      result = result.filter(
        (l: EscrowListing) => l.asset?.material && selectedMaterials.includes(l.asset.material)
      );
    }

    // Condition filter
    if (selectedConditions.length) {
      result = result.filter(
        (l: EscrowListing) => l.asset?.condition && selectedConditions.includes(l.asset.condition)
      );
    }

    // Sort
    switch (sortBy) {
      case 'price_low':
        result.sort(
          (a: EscrowListing, b: EscrowListing) =>
            (a.listingPriceUSD || 0) - (b.listingPriceUSD || 0)
        );
        break;
      case 'price_high':
        result.sort(
          (a: EscrowListing, b: EscrowListing) =>
            (b.listingPriceUSD || 0) - (a.listingPriceUSD || 0)
        );
        break;
      case 'brand_az':
        result.sort((a: EscrowListing, b: EscrowListing) =>
          (a.asset?.brand || '').localeCompare(b.asset?.brand || '')
        );
        break;
      case 'latest':
      default:
        result.sort(
          (a: EscrowListing, b: EscrowListing) =>
            new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
    }

    return result;
  }, [
    sourceListings,
    searchQuery,
    selectedBrands,
    selectedMaterials,
    selectedConditions,
    committedPriceRange,
    sortBy,
  ]);

  // Filter pools
  const filteredPools = useMemo(() => {
    let result = openPools as Pool[];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p: Pool) =>
          p.asset?.model?.toLowerCase().includes(query) ||
          p.asset?.brand?.toLowerCase().includes(query) ||
          p.title?.toLowerCase().includes(query) ||
          p.brand?.toLowerCase().includes(query)
      );
    }

    if (selectedBrands.length) {
      result = result.filter((p: Pool) => selectedBrands.includes(p.asset?.brand || p.brand || ''));
    }

    return result;
  }, [openPools, searchQuery, selectedBrands]);

  // Transform listed pools to custody items
  const custodyItems: CustodyItem[] = useMemo(() => {
    return (listedPools as Pool[]).map((pool) => ({
      _id: pool._id,
      poolId: pool._id,
      title: pool.asset?.model || pool.model || 'Luxury Item',
      description:
        pool.asset?.description || pool.description || 'Verified item in LuxHub custody.',
      image: resolvePoolImage(pool),
      originalPurchaseUSD: pool.targetAmountUSD,
      resaleListingPriceUSD: pool.targetAmountUSD * 1.15, // 15% markup
      resaleListingPriceSol: (pool.targetAmountUSD * 1.15) / (solPrice || 100),
      totalInvestors: new Set(pool.participants?.map((p) => p.wallet) || []).size,
      projectedProfitPercent: 15,
      brand: pool.asset?.brand || pool.brand || '',
      model: pool.asset?.model || pool.model || '',
      status: 'listed',
    }));
  }, [listedPools, solPrice]);

  // Filter vendors by search
  const filteredVendors = useMemo(() => {
    if (!searchQuery)
      return [
        ...verifiedVendors,
        ...vendors.filter((v) => !verifiedVendors.some((vv) => vv.wallet === v.wallet)),
      ];
    const query = searchQuery.toLowerCase();
    const allVendors = [
      ...verifiedVendors,
      ...vendors.filter((v) => !verifiedVendors.some((vv) => vv.wallet === v.wallet)),
    ];
    return allVendors.filter(
      (v) => v.name?.toLowerCase().includes(query) || v.username?.toLowerCase().includes(query)
    );
  }, [vendors, verifiedVendors, searchQuery]);

  // Handle buy action
  const handleBuy = useCallback(
    (listing: EscrowListing) => {
      if (!wallet.connected) {
        toast.error('Connect your wallet to buy');
        return;
      }
      setSelectedListing(listing);
      setShowBuyModal(true);
    },
    [wallet.connected]
  );

  // Handle offer action
  const handleOffer = useCallback(
    (listing: EscrowListing) => {
      if (!wallet.connected) {
        toast.error('Connect your wallet to make an offer');
        return;
      }
      setSelectedListing(listing);
      setShowOfferModal(true);
    },
    [wallet.connected]
  );

  // Handle view details
  const handleViewDetails = useCallback((listing: EscrowListing) => {
    setSelectedListing(listing);
    setShowDetailModal(true);
  }, []);

  // Handle demo listing clicks
  const handleDemoClick = useCallback((listing: EscrowListing) => {
    const title = listing.asset?.title || listing.asset?.model || 'this item';
    alert(
      `This is a demo listing for "${title}". Real purchases will be available when live NFTs are minted.\n\nContact LuxHub to list your luxury items!`
    );
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
    if (!solPrice || solPrice <= 0) return '0';
    return (usd / solPrice).toFixed(2);
  };
  // Debug: log current SOL price for verification
  useEffect(() => {
    if (solPrice) console.log('[Marketplace] SOL price:', solPrice);
  }, [solPrice]);

  // Animation variants
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

  const isLoading = isLoadingListings || isLoadingVendors;

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
          {/* Vendor Slider */}
          <div className={styles.vendorSliderContainer} data-tour="vendor-slider">
            <div className={styles.vendorSliderHeader}>
              <span className={styles.vendorSliderLabel}>Dealers</span>
              <Link href="/vendors" className={styles.viewAllLink}>
                View All
              </Link>
            </div>
            <div className={styles.vendorSlider}>
              <div className={styles.vendorSliderTrack}>
                {filteredVendors.slice(0, 12).map((vendor) => (
                  <VendorCard
                    key={vendor.wallet}
                    vendor={vendor}
                    variant="slider"
                    showStats={false}
                  />
                ))}
                {filteredVendors.length === 0 && !isLoadingVendors && (
                  <div className={styles.emptyVendorSlider}>No vendors found</div>
                )}
              </div>
            </div>
          </div>

          {/* Section Tabs */}
          <div className={styles.sectionTabs} data-tour="section-tabs">
            <button
              className={`${styles.sectionTab} ${activeSection === 'direct_sales' ? styles.activeTab : ''}`}
              onClick={() => setActiveSection('direct_sales')}
            >
              <HiOutlineBuildingStorefront className={styles.tabIcon} />
              <span>Direct Sales</span>
              <span className={styles.tabCount}>{filteredListings.length}</span>
            </button>
            <button
              className={`${styles.sectionTab} ${activeSection === 'pools' ? styles.activeTab : ''}`}
              onClick={() => setActiveSection('pools')}
            >
              <FaUsers className={styles.tabIcon} />
              <span>Pools</span>
              <span className={styles.tabCount}>{filteredPools.length}</span>
            </button>
            <button
              className={`${styles.sectionTab} ${activeSection === 'custody' ? styles.activeTab : ''}`}
              onClick={() => setActiveSection('custody')}
            >
              <FaLock className={styles.tabIcon} />
              <span>Custody</span>
              <span className={styles.tabCount}>{custodyItems.length}</span>
            </button>
          </div>

          {/* Top Bar */}
          <div className={styles.topBar}>
            {/* Search */}
            <div className={styles.searchWrapper} data-tour="search-bar">
              <HiOutlineSearch className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by brand, model, or mint address..."
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
            <div className={styles.controls} data-tour="controls-area">
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
                className={`${styles.mobileFilterBtn} ${styles.mobileFilterButton}`}
                onClick={() => setShowMobileFilters(true)}
              >
                <HiOutlineFilter />
                {activeFilterCount > 0 && (
                  <span className={styles.filterBadge}>{activeFilterCount}</span>
                )}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className={styles.contentArea}>
            {/* Sidebar Filters (Desktop) */}
            {activeSection === 'direct_sales' && showFilters && (
              <FilterSidebar
                groups={filterGroups}
                activeCount={activeFilterCount}
                onClearAll={clearFilters}
                priceRangeSlot={
                  <PriceRangeSlider
                    min={0}
                    max={500000}
                    value={selectedPriceRange}
                    onChange={setSelectedPriceRange}
                    onChangeCommitted={setCommittedPriceRange}
                  />
                }
              />
            )}

            {/* Main Grid */}
            <div className={styles.gridArea} data-tour="nft-grid">
              {/* Active Filters Display */}
              {activeFilterCount > 0 && (
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
                  {(committedPriceRange[0] > 0 || committedPriceRange[1] < 500000) && (
                    <span
                      className={styles.activeChip}
                      onClick={() => {
                        setSelectedPriceRange([0, 500000]);
                        setCommittedPriceRange([0, 500000]);
                      }}
                    >
                      ${committedPriceRange[0].toLocaleString()} - $
                      {committedPriceRange[1].toLocaleString()} <HiOutlineX />
                    </span>
                  )}
                  {selectedMaterials.map((m) => (
                    <span
                      key={m}
                      className={styles.activeChip}
                      onClick={() => toggleFilter(m, selectedMaterials, setSelectedMaterials)}
                    >
                      {m} <HiOutlineX />
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
                </div>
              )}

              {/* Direct Sales Section */}
              {activeSection === 'direct_sales' && (
                <>
                  {isLoading ? (
                    <div className={styles.skeletonGrid}>
                      {[...Array(8)].map((_, i) => (
                        <div key={i} className={styles.skeletonCard}>
                          <div className={styles.skeletonImage} />
                          <div className={styles.skeletonContent}>
                            <div className={styles.skeletonTitle} />
                            <div className={styles.skeletonPrice} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredListings.length > 0 ? (
                    <motion.div
                      className={styles.nftGrid}
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      key={`${sortBy}-${activeFilterCount}`}
                    >
                      {filteredListings.map((listing: EscrowListing) => {
                        const isDemo = listing._id.startsWith('demo_');
                        const priceSol = parseFloat(formatSol(listing.listingPriceUSD || 0));
                        const walletAddr = wallet.publicKey?.toBase58();
                        const isOwnListing = !!(
                          walletAddr &&
                          (listing.sellerWallet === walletAddr ||
                            listing.vendorWallet === walletAddr)
                        );
                        return (
                          <motion.div
                            key={listing._id}
                            className={styles.cardWrapper}
                            variants={cardVariants}
                          >
                            {isDemo && <span className={styles.demoBadge}>Demo</span>}
                            <UnifiedNFTCard
                              title={listing.asset?.model || 'Unknown Watch'}
                              image={resolveImage(listing)}
                              price={listing.listingPriceUSD || 0}
                              priceLabel="USD"
                              subtitle={solPrice ? `${priceSol} SOL` : undefined}
                              mintAddress={listing.nftMint}
                              owner={listing.sellerWallet}
                              brand={listing.asset?.brand}
                              model={listing.asset?.model}
                              material={listing.asset?.material}
                              dialColor={listing.asset?.dialColor}
                              caseSize={listing.asset?.caseSize}
                              condition={listing.asset?.condition}
                              status={
                                listing.status === 'offer_accepted' &&
                                listing.buyerWallet === wallet.publicKey?.toBase58()
                                  ? 'escrow'
                                  : 'listed'
                              }
                              isVerified={listing.vendor?.verified}
                              acceptingOffers={
                                listing.status !== 'offer_accepted' && listing.acceptingOffers
                              }
                              showBadge={true}
                              showPrice={true}
                              showOverlay={true}
                              showActionButtons={!isOwnListing}
                              onQuickBuy={
                                isOwnListing
                                  ? undefined
                                  : () => {
                                      if (isDemo) return handleDemoClick(listing);
                                      handleBuy(listing);
                                    }
                              }
                              onOffer={
                                isOwnListing
                                  ? undefined
                                  : listing.escrowPda && listing.status !== 'offer_accepted'
                                    ? () =>
                                        isDemo ? handleDemoClick(listing) : handleOffer(listing)
                                    : undefined
                              }
                              onViewDetails={() =>
                                isDemo ? handleDemoClick(listing) : handleViewDetails(listing)
                              }
                            />
                          </motion.div>
                        );
                      })}
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

              {/* Asset Pools Section */}
              {activeSection === 'pools' && (
                <>
                  <span className={styles.sectionLabel}>Asset Pools</span>

                  {isLoadingPools ? (
                    <div className={styles.poolGrid}>
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className={styles.skeletonCard}>
                          <div className={styles.skeletonImage} />
                          <div className={styles.skeletonContent}>
                            <div className={styles.skeletonTitle} />
                            <div className={styles.skeletonPrice} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredPools.length > 0 ? (
                    <div className={styles.poolGrid}>
                      {filteredPools.map((pool: Pool) => {
                        const raisedUSD = pool.sharesSold * pool.sharePriceUSD;
                        const fundingPercent =
                          pool.targetAmountUSD > 0
                            ? Math.round((raisedUSD / pool.targetAmountUSD) * 100)
                            : 0;
                        const brand = pool.asset?.brand || pool.brand || '';
                        const model = pool.asset?.model || pool.model || 'Luxury Watch';
                        const holders = new Set(pool.participants?.map((p) => p.wallet) || []).size;
                        return (
                          <div key={pool._id} className={styles.poolCard}>
                            <div className={styles.poolImageWrapper}>
                              <img
                                src={resolvePoolImage(pool)}
                                alt={model}
                                className={styles.poolImage}
                                onError={handleImageError}
                              />
                              {brand && <div className={styles.poolBrand}>{brand}</div>}
                            </div>
                            <div className={styles.poolContent}>
                              <h4 className={styles.poolTitle}>{model}</h4>
                              {brand && <p className={styles.poolModel}>{brand}</p>}

                              <div className={styles.progressSection}>
                                <div className={styles.progressHeader}>
                                  <span>Funding</span>
                                  <span className={styles.progressPercent}>{fundingPercent}%</span>
                                </div>
                                <div className={styles.progressBarTrack}>
                                  <div
                                    className={styles.progressBarFill}
                                    style={{ width: `${Math.min(fundingPercent, 100)}%` }}
                                  />
                                </div>
                              </div>

                              <div className={styles.poolStats}>
                                <div className={styles.poolStat}>
                                  <BiTargetLock />
                                  <span>${pool.targetAmountUSD.toLocaleString()}</span>
                                </div>
                                <div className={styles.poolStat}>
                                  <FaUsers />
                                  <span>{holders} holders</span>
                                </div>
                                <div className={styles.poolStat}>
                                  <FaChartLine />
                                  <span>{((pool.projectedROI - 1) * 100).toFixed(0)}% Est.</span>
                                </div>
                              </div>

                              <Link href={`/pool/${pool._id}`} className={styles.investButton}>
                                Join Pool
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <FaUsers className={styles.emptyIcon} />
                      <h3>No active pools</h3>
                      <p>New pool opportunities coming soon</p>
                    </div>
                  )}
                </>
              )}

              {/* Custody Section */}
              {activeSection === 'custody' && (
                <>
                  <span className={styles.sectionLabel}>Custody</span>

                  {isLoadingCustody ? (
                    <div className={styles.custodyGrid}>
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className={styles.skeletonCard}>
                          <div className={styles.skeletonImage} />
                          <div className={styles.skeletonContent}>
                            <div className={styles.skeletonTitle} />
                            <div className={styles.skeletonPrice} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : custodyItems.length > 0 ? (
                    <div className={styles.custodyGrid}>
                      {custodyItems.map((item) => (
                        <div key={item._id} className={styles.custodyCard}>
                          <div className={styles.custodyBadge}>
                            <FaLock /> In Custody
                          </div>
                          <div className={styles.custodyImageWrapper}>
                            <img
                              src={item.image}
                              alt={item.title}
                              className={styles.custodyImage}
                              onError={handleImageError}
                            />
                          </div>
                          <div className={styles.custodyContent}>
                            <div className={styles.custodyBrandLabel}>{item.brand}</div>
                            <h4 className={styles.custodyTitle}>{item.title}</h4>

                            <div className={styles.custodyPricing}>
                              <div className={styles.custodyPrice}>
                                <span>Resale:</span>
                                <span className={styles.priceHighlight}>
                                  ${item.resaleListingPriceUSD.toLocaleString()}
                                </span>
                              </div>
                              <div className={styles.custodySol}>
                                <SiSolana />
                                <span>{item.resaleListingPriceSol.toFixed(1)} SOL</span>
                              </div>
                            </div>

                            <div className={styles.custodyStats}>
                              <span>
                                <FaUsers /> {item.totalInvestors} participants
                              </span>
                              <span className={styles.profitBadge}>
                                <FaChartLine /> +{item.projectedProfitPercent}% est.
                              </span>
                            </div>

                            <Link href={`/pool/${item.poolId}`} className={styles.purchaseButton}>
                              Purchase & Distribute
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      <FaLock className={styles.emptyIcon} />
                      <h3>No custody items</h3>
                      <p>Items appear here once pools are fully funded</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        {/* FilterDrawer (slide-in sidebar for mobile) */}
        <FilterDrawer isOpen={filterDrawerOpen} onClose={() => setFilterDrawerOpen(false)}>
          <FilterSidebar
            groups={filterGroups}
            activeCount={activeFilterCount}
            onClearAll={clearFilters}
            priceRangeSlot={
              <PriceRangeSlider
                min={0}
                max={500000}
                value={selectedPriceRange}
                onChange={setSelectedPriceRange}
                onChangeCommitted={setCommittedPriceRange}
              />
            }
          />
        </FilterDrawer>

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
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Drag Handle */}
                <div className={styles.mobileFilterHandle} />

                <div className={styles.mobileFilterHeader}>
                  <div className={styles.mobileFilterHeaderLeft}>
                    <HiOutlineFilter className={styles.mobileFilterIcon} />
                    <h3>Filters</h3>
                    {activeFilterCount > 0 && (
                      <span className={styles.mobileFilterCount}>{activeFilterCount}</span>
                    )}
                  </div>
                  <button
                    className={styles.mobileFilterClose}
                    onClick={() => setShowMobileFilters(false)}
                  >
                    <HiOutlineX />
                  </button>
                </div>

                <div className={styles.mobileFilterBody}>
                  {/* Brand Section */}
                  <div className={styles.mobileFilterSection}>
                    <button
                      className={styles.mobileFilterSectionHeader}
                      onClick={() => toggleSection('brand')}
                    >
                      <span>Brand</span>
                      <HiOutlineChevronDown
                        className={`${styles.chevron} ${expandedSections.brand ? styles.expanded : ''}`}
                      />
                    </button>
                    {expandedSections.brand && (
                      <div className={styles.mobileFilterChips}>
                        {BRANDS.map((brand) => (
                          <button
                            key={brand}
                            className={`${styles.mobileChip} ${selectedBrands.includes(brand) ? styles.mobileChipActive : ''}`}
                            onClick={() => toggleFilter(brand, selectedBrands, setSelectedBrands)}
                          >
                            {brand}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price Range Section */}
                  <div className={styles.mobileFilterSection}>
                    <button
                      className={styles.mobileFilterSectionHeader}
                      onClick={() => toggleSection('price')}
                    >
                      <span>Price Range (USD)</span>
                      <HiOutlineChevronDown
                        className={`${styles.chevron} ${expandedSections.price ? styles.expanded : ''}`}
                      />
                    </button>
                    {expandedSections.price && (
                      <div className={styles.mobileFilterChips}>
                        <PriceRangeSlider
                          min={0}
                          max={500000}
                          value={selectedPriceRange}
                          onChange={setSelectedPriceRange}
                          onChangeCommitted={setCommittedPriceRange}
                        />
                      </div>
                    )}
                  </div>

                  {/* Material Section */}
                  <div className={styles.mobileFilterSection}>
                    <button
                      className={styles.mobileFilterSectionHeader}
                      onClick={() => toggleSection('material')}
                    >
                      <span>Material</span>
                      <HiOutlineChevronDown
                        className={`${styles.chevron} ${expandedSections.material ? styles.expanded : ''}`}
                      />
                    </button>
                    {expandedSections.material && (
                      <div className={styles.mobileFilterChips}>
                        {MATERIALS.map((mat) => (
                          <button
                            key={mat}
                            className={`${styles.mobileChip} ${selectedMaterials.includes(mat) ? styles.mobileChipActive : ''}`}
                            onClick={() =>
                              toggleFilter(mat, selectedMaterials, setSelectedMaterials)
                            }
                          >
                            {mat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Condition Section */}
                  <div className={styles.mobileFilterSection}>
                    <button
                      className={styles.mobileFilterSectionHeader}
                      onClick={() => toggleSection('condition')}
                    >
                      <span>Condition</span>
                      <HiOutlineChevronDown
                        className={`${styles.chevron} ${expandedSections.condition ? styles.expanded : ''}`}
                      />
                    </button>
                    {expandedSections.condition && (
                      <div className={styles.mobileFilterChips}>
                        {CONDITIONS.map((cond) => (
                          <button
                            key={cond}
                            className={`${styles.mobileChip} ${selectedConditions.includes(cond) ? styles.mobileChipActive : ''}`}
                            onClick={() =>
                              toggleFilter(cond, selectedConditions, setSelectedConditions)
                            }
                          >
                            {cond}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.mobileFilterFooter}>
                  <button className={styles.mobileClearBtn} onClick={clearFilters}>
                    Clear All
                  </button>
                  <button
                    className={styles.mobileApplyBtn}
                    onClick={() => setShowMobileFilters(false)}
                  >
                    Show {filteredListings.length} Results
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        {showDetailModal &&
          selectedListing &&
          (() => {
            const detailWalletAddr = wallet.publicKey?.toBase58();
            const isOwnDetailListing = !!(
              detailWalletAddr &&
              (selectedListing.sellerWallet === detailWalletAddr ||
                selectedListing.vendorWallet === detailWalletAddr)
            );
            return (
              <div className={styles.detailOverlay} onClick={() => setShowDetailModal(false)}>
                <div className={styles.detailModal} onClick={(e) => e.stopPropagation()}>
                  <button className={styles.closeModal} onClick={() => setShowDetailModal(false)}>
                    <HiOutlineX />
                  </button>
                  <NftDetailCard
                    mintAddress={selectedListing.nftMint}
                    owner={selectedListing.sellerWallet}
                    buyerWallet={wallet.publicKey?.toBase58()}
                    priceSol={parseFloat(formatSol(selectedListing.listingPriceUSD || 0))}
                    status={selectedListing.status === 'offer_accepted' ? 'escrow' : 'listed'}
                    acceptingOffers={isOwnDetailListing ? false : selectedListing.acceptingOffers}
                    onBuy={
                      isOwnDetailListing
                        ? undefined
                        : () => {
                            setShowDetailModal(false);
                            handleBuy(selectedListing);
                          }
                    }
                    onOffer={
                      isOwnDetailListing
                        ? undefined
                        : () => {
                            setShowDetailModal(false);
                            handleOffer(selectedListing);
                          }
                    }
                    previewData={{
                      title:
                        selectedListing.asset?.title ||
                        selectedListing.asset?.model ||
                        'Luxury Watch',
                      image: resolveImage(selectedListing),
                      imageUrl: selectedListing.asset?.imageUrl,
                      imageIpfsUrls: selectedListing.asset?.imageIpfsUrls,
                      images: selectedListing.asset?.images,
                      description: selectedListing.asset?.description || '',
                      priceSol: parseFloat(formatSol(selectedListing.listingPriceUSD || 0)),
                      attributes: [
                        { trait_type: 'Brand', value: selectedListing.asset?.brand || '~' },
                        { trait_type: 'Model', value: selectedListing.asset?.model || '~' },
                        { trait_type: 'Serial', value: selectedListing.asset?.serial || '~' },
                        { trait_type: 'Material', value: selectedListing.asset?.material || '~' },
                        {
                          trait_type: 'Dial Color',
                          value: selectedListing.asset?.dialColor || '~',
                        },
                        { trait_type: 'Case Size', value: selectedListing.asset?.caseSize || '~' },
                        { trait_type: 'Condition', value: selectedListing.asset?.condition || '~' },
                        {
                          trait_type: 'Production Year',
                          value: selectedListing.asset?.productionYear || '~',
                        },
                        { trait_type: 'Movement', value: selectedListing.asset?.movement || '~' },
                        {
                          trait_type: 'Water Resistance',
                          value: selectedListing.asset?.waterResistance || '~',
                        },
                        {
                          trait_type: 'Box & Papers',
                          value: selectedListing.asset?.boxPapers || '~',
                        },
                        {
                          trait_type: 'Certificate',
                          value: selectedListing.asset?.certificate || '~',
                        },
                        { trait_type: 'Country', value: selectedListing.asset?.country || '~' },
                        { trait_type: 'Features', value: selectedListing.asset?.features || '~' },
                        {
                          trait_type: 'Limited Edition',
                          value: selectedListing.asset?.limitedEdition || '~',
                        },
                        {
                          trait_type: 'Warranty',
                          value: selectedListing.asset?.warrantyInfo || '~',
                        },
                        {
                          trait_type: 'Provenance',
                          value: selectedListing.asset?.provenance || '~',
                        },
                        {
                          trait_type: 'Price',
                          value: `$${selectedListing.listingPriceUSD?.toLocaleString() || '0'}`,
                        },
                      ],
                    }}
                    onClose={() => setShowDetailModal(false)}
                  />
                </div>
              </div>
            );
          })()}

        {/* Offer Modal */}
        {showOfferModal && selectedListing && (
          <MakeOfferModal
            escrow={{
              escrowPda: selectedListing.escrowPda || '',
              listingPriceUSD: selectedListing.listingPriceUSD,
              minimumOfferUSD: selectedListing.minimumOfferUSD,
              asset: {
                model: selectedListing.asset?.model,
                imageUrl: resolveImage(selectedListing),
              },
              vendor: selectedListing.vendor
                ? { businessName: selectedListing.vendor.businessName }
                : undefined,
            }}
            solPrice={solPrice || 150}
            onClose={() => setShowOfferModal(false)}
            onSuccess={() => {
              setShowOfferModal(false);
            }}
          />
        )}

        {/* Onboarding Tour */}
        {showTour && typeof document !== 'undefined' && (
          <MarketplaceTour onClose={() => setShowTour(false)} />
        )}

        {/* Retake tour button */}
        {!showTour && (
          <button
            className={styles.retakeTourBtn}
            onClick={() => {
              localStorage.removeItem('luxhub_marketplace_tour_seen');
              setShowTour(true);
            }}
            title="Take the guided tour"
          >
            ?
          </button>
        )}

        {/* Buy Modal */}
        {showBuyModal && selectedListing && (
          <BuyModal
            escrow={{
              escrowPda: selectedListing.escrowPda || '',
              nftMint: selectedListing.nftMint,
              listingPrice: selectedListing.listingPrice,
              listingPriceUSD: selectedListing.listingPriceUSD,
              asset: {
                model: selectedListing.asset?.model,
                brand: selectedListing.asset?.brand,
                title: selectedListing.asset?.title,
                imageUrl: resolveImage(selectedListing),
              },
              vendor: selectedListing.vendor
                ? { businessName: selectedListing.vendor.businessName }
                : undefined,
            }}
            solPrice={solPrice || 100}
            onClose={() => setShowBuyModal(false)}
            onSuccess={() => {
              setShowBuyModal(false);
              // Refresh listings after successful purchase
              mutateListings();
            }}
          />
        )}
      </div>
    </>
  );
}
