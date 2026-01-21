// src/pages/WatchMarket.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import WalletGuide from '../components/common/WalletGuide';
import {
  PublicKey,
  Connection,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import { getProgram } from '../utils/programUtils';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  AccountLayout,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Metaplex, walletAdapterIdentity } from '@metaplex-foundation/js';
import Link from 'next/link';
import { FaRegCircleCheck, FaAngleRight, FaChartLine, FaLock, FaUsers } from 'react-icons/fa6';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import styles from '../styles/WatchMarket.module.css';
import { IoMdInformationCircle } from 'react-icons/io';
import { SiSolana } from 'react-icons/si';
import { HiOutlineBuildingStorefront } from 'react-icons/hi2';
import { BiTargetLock } from 'react-icons/bi';
import NFTCard from '../components/marketplace/NFTCard';
import FilterSortPanel from '../components/marketplace/FilterSortPanel';
import { CiSearch } from 'react-icons/ci';
import MakeOfferModal from '../components/marketplace/MakeOfferModal';
import { VendorProfile } from '@/lib/models/VendorProfile';

interface NFT {
  title: string;
  description: string;
  image: string;
  priceSol: number;
  mintAddress: string;
  metadataUri: string;
  currentOwner: string;
  marketStatus: string;

  nftId: string;
  fileCid: string;
  timestamp: number;
  seller: string;

  attributes?: {
    trait_type: string;
    value: string;
  }[];
  salePrice?: number;
  // Escrow data for offers
  escrowPda?: string;
  acceptingOffers?: boolean;
  minimumOfferUSD?: number;
  vendorName?: string;
}

type FilterOptions = {
  brands: string[];
  materials: string[];
  colors: string[];
  sizes: string[];
  categories: string[];
};

// Pool interface for fractional ownership
interface Pool {
  _id: string;
  title: string;
  description: string;
  image: string;
  targetAmountUSD: number;
  currentAmountUSD: number;
  sharesSold: number;
  totalShares: number;
  sharePriceUSD: number;
  minBuyInUSD: number;
  maxInvestors: number;
  currentInvestors: number;
  projectedROI: number;
  status: 'open' | 'filled' | 'funded' | 'custody' | 'active' | 'listed' | 'sold' | 'distributed';
  brand: string;
  model: string;
  createdAt: string;
}

// Custody item interface (pools listed for resale)
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
  custodyVerifiedAt: string;
  brand: string;
  model: string;
  status: 'listed' | 'pending_sale' | 'sold';
}

type MarketSection = 'direct_sales' | 'pools' | 'custody';

const FUNDS_MINT = 'So11111111111111111111111111111111111111112';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock NFT data for display when no real NFTs are available
const MOCK_NFTS: NFT[] = [
  {
    title: 'Rolex Daytona Rainbow',
    description:
      'Limited edition Daytona with factory-set rainbow sapphires. 40mm Everose gold case.',
    image: '/images/rolex-daytona-rainbow.jpg',
    priceSol: 450.0,
    mintAddress: 'mock_rolex_daytona_001',
    metadataUri: '',
    currentOwner: 'LuxHub',
    marketStatus: 'active',
    nftId: 'mock_001',
    fileCid: '',
    timestamp: Date.now() - 86400000,
    seller: 'LuxHub Verified',
    attributes: [
      { trait_type: 'Brand', value: 'Rolex' },
      { trait_type: 'Model', value: 'Daytona Rainbow' },
      { trait_type: 'Material', value: 'Gold' },
      { trait_type: 'Case Size', value: '40mm' },
      { trait_type: 'Dial Color', value: 'Black' },
      { trait_type: 'Category', value: 'Chronograph' },
    ],
    salePrice: 250000,
    acceptingOffers: true,
    minimumOfferUSD: 220000,
    vendorName: 'LuxHub Official',
  },
  {
    title: 'Richard Mille RM 027',
    description: 'Ultra-lightweight tourbillon worn by Rafael Nadal. Extremely rare piece.',
    image: '/images/rm-027.jpg',
    priceSol: 1250.0,
    mintAddress: 'mock_rm_027_001',
    metadataUri: '',
    currentOwner: 'LuxHub',
    marketStatus: 'active',
    nftId: 'mock_002',
    fileCid: '',
    timestamp: Date.now() - 172800000,
    seller: 'LuxHub Verified',
    attributes: [
      { trait_type: 'Brand', value: 'Richard Mille' },
      { trait_type: 'Model', value: 'RM 027' },
      { trait_type: 'Material', value: 'Titanium' },
      { trait_type: 'Case Size', value: '47mm' },
      { trait_type: 'Dial Color', value: 'Skeleton' },
      { trait_type: 'Category', value: 'Sports Watch' },
    ],
    salePrice: 800000,
    acceptingOffers: true,
    minimumOfferUSD: 700000,
    vendorName: 'LuxHub Official',
  },
  {
    title: 'AP Royal Oak Offshore',
    description: 'Limited edition collaboration piece. High demand expected on secondary market.',
    image: '/images/ap-offshore.jpg',
    priceSol: 280.0,
    mintAddress: 'mock_ap_offshore_001',
    metadataUri: '',
    currentOwner: 'LuxHub',
    marketStatus: 'active',
    nftId: 'mock_003',
    fileCid: '',
    timestamp: Date.now() - 259200000,
    seller: 'LuxHub Verified',
    attributes: [
      { trait_type: 'Brand', value: 'Audemars Piguet' },
      { trait_type: 'Model', value: 'Royal Oak Offshore' },
      { trait_type: 'Material', value: 'Steel' },
      { trait_type: 'Case Size', value: '44mm' },
      { trait_type: 'Dial Color', value: 'Blue' },
      { trait_type: 'Category', value: 'Sports Watch' },
    ],
    salePrice: 85000,
    acceptingOffers: true,
    minimumOfferUSD: 75000,
    vendorName: 'LuxHub Official',
  },
  {
    title: 'Cartier Crash London',
    description: 'Iconic asymmetric design. Museum-quality piece with exceptional provenance.',
    image: '/images/cartier-crash.jpg',
    priceSol: 520.0,
    mintAddress: 'mock_cartier_crash_001',
    metadataUri: '',
    currentOwner: 'LuxHub',
    marketStatus: 'active',
    nftId: 'mock_004',
    fileCid: '',
    timestamp: Date.now() - 345600000,
    seller: 'LuxHub Verified',
    attributes: [
      { trait_type: 'Brand', value: 'Cartier' },
      { trait_type: 'Model', value: 'Crash London' },
      { trait_type: 'Material', value: 'Gold' },
      { trait_type: 'Case Size', value: '38mm' },
      { trait_type: 'Dial Color', value: 'White' },
      { trait_type: 'Category', value: 'Dress Watch' },
    ],
    salePrice: 280000,
    acceptingOffers: true,
    minimumOfferUSD: 250000,
    vendorName: 'LuxHub Official',
  },
];

// Mock Pool data for fractional ownership
const MOCK_POOLS: Pool[] = [
  {
    _id: 'pool_001',
    title: 'Rolex Daytona Rainbow',
    description:
      'Limited edition Daytona with factory-set sapphires. Investment pool for fractional ownership.',
    image: '/images/rolex-daytona-rainbow.jpg',
    targetAmountUSD: 250000,
    currentAmountUSD: 187500,
    sharesSold: 75,
    totalShares: 100,
    sharePriceUSD: 2500,
    minBuyInUSD: 2500,
    maxInvestors: 50,
    currentInvestors: 32,
    projectedROI: 1.25,
    status: 'open',
    brand: 'Rolex',
    model: 'Daytona Rainbow',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'pool_002',
    title: 'AP Royal Oak Offshore',
    description: 'Limited edition collaboration piece. High demand expected on secondary market.',
    image: '/images/ap-offshore.jpg',
    targetAmountUSD: 85000,
    currentAmountUSD: 68000,
    sharesSold: 80,
    totalShares: 100,
    sharePriceUSD: 850,
    minBuyInUSD: 850,
    maxInvestors: 30,
    currentInvestors: 24,
    projectedROI: 1.18,
    status: 'open',
    brand: 'Audemars Piguet',
    model: 'Royal Oak Offshore',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    _id: 'pool_003',
    title: 'Richard Mille RM 027',
    description: 'Ultra-lightweight tourbillon worn by Rafael Nadal. Extremely rare piece.',
    image: '/images/rm-027.jpg',
    targetAmountUSD: 800000,
    currentAmountUSD: 240000,
    sharesSold: 30,
    totalShares: 100,
    sharePriceUSD: 8000,
    minBuyInUSD: 8000,
    maxInvestors: 80,
    currentInvestors: 15,
    projectedROI: 1.35,
    status: 'open',
    brand: 'Richard Mille',
    model: 'RM 027',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// Mock Custody items (100% funded pools listed for resale)
const MOCK_CUSTODY: CustodyItem[] = [
  {
    _id: 'custody_001',
    poolId: 'completed_pool_001',
    title: 'Rolex Daytona Rainbow',
    description:
      'Pool fully funded. Watch verified and secured in LuxHub vault. Listed for profit distribution.',
    image: '/images/rolex-daytona-rainbow.jpg',
    originalPurchaseUSD: 250000,
    resaleListingPriceUSD: 295000,
    resaleListingPriceSol: 1735,
    totalInvestors: 32,
    projectedProfitPercent: 18.0,
    custodyVerifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    brand: 'Rolex',
    model: 'Daytona Rainbow',
    status: 'listed',
  },
  {
    _id: 'custody_002',
    poolId: 'completed_pool_002',
    title: 'Cartier Crash London',
    description: 'Iconic asymmetric design. Museum-quality piece in LuxHub secure storage.',
    image: '/images/cartier-crash.jpg',
    originalPurchaseUSD: 280000,
    resaleListingPriceUSD: 325000,
    resaleListingPriceSol: 1912,
    totalInvestors: 42,
    projectedProfitPercent: 16.1,
    custodyVerifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    brand: 'Cartier',
    model: 'Crash London',
    status: 'listed',
  },
];

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [custodyItems, setCustodyItems] = useState<CustodyItem[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [pendingPurchaseNft, setPendingPurchaseNft] = useState<NFT | null>(null);
  const [offerNft, setOfferNft] = useState<NFT | null>(null);

  const [activeSection, setActiveSection] = useState<MarketSection>('direct_sales');
  const [searchQuery, setSearchQuery] = useState('');

  const [showFilters, setShowFilters] = useState(false);
  const [sortOption, setSortOption] = useState<'price_low' | 'price_high' | 'latest'>('latest');

  const [filters, setFilters] = useState<FilterOptions>({
    brands: [],
    materials: [],
    colors: [],
    sizes: [],
    categories: [],
  });

  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [verifiedVendors, setVerifiedVendors] = useState<VendorProfile[]>([]);
  const [isLoadingPools, setIsLoadingPools] = useState(true);
  const [isLoadingCustody, setIsLoadingCustody] = useState(true);

  const filteredNfts = useMemo(() => {
    return nfts
      .filter((nft) => {
        const brand = nft.attributes?.find((attr) => attr.trait_type === 'Brand')?.value ?? '';
        const material =
          nft.attributes?.find((attr) => attr.trait_type === 'Material')?.value ?? '';
        const color = nft.attributes?.find((attr) => attr.trait_type === 'Dial Color')?.value ?? '';
        const size = nft.attributes?.find((attr) => attr.trait_type === 'Case Size')?.value ?? '';
        const category =
          nft.attributes?.find((attr) => attr.trait_type === 'Category')?.value ?? '';

        const matchesFilters =
          (!filters.brands.length || filters.brands.includes(brand)) &&
          (!filters.materials.length || filters.materials.includes(material)) &&
          (!filters.colors.length || filters.colors.includes(color)) &&
          (!filters.sizes.length || filters.sizes.includes(size)) &&
          (!filters.categories.length || filters.categories.includes(category));

        const matchesSearch =
          !searchQuery ||
          brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
          nft.mintAddress.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesFilters && matchesSearch;
      })
      .sort((a, b) => {
        if (a.marketStatus === 'active' && b.marketStatus !== 'active') return -1;
        if (a.marketStatus !== 'active' && b.marketStatus === 'active') return 1;
        if (sortOption === 'price_low') return a.priceSol - b.priceSol;
        if (sortOption === 'price_high') return b.priceSol - a.priceSol;
        if (sortOption === 'latest') return b.timestamp - a.timestamp;
        return 0;
      });
  }, [nfts, filters, searchQuery, sortOption]);

  // Filter pools based on search and brand filters
  const filteredPools = useMemo(() => {
    return pools
      .filter((pool) => {
        const matchesBrand = !filters.brands.length || filters.brands.includes(pool.brand);
        const matchesSearch =
          !searchQuery ||
          pool.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          pool.model.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesBrand && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === 'price_low') return a.sharePriceUSD - b.sharePriceUSD;
        if (sortOption === 'price_high') return b.sharePriceUSD - a.sharePriceUSD;
        if (sortOption === 'latest')
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return 0;
      });
  }, [pools, filters.brands, searchQuery, sortOption]);

  // Filter custody items based on search and brand filters
  const filteredCustody = useMemo(() => {
    return custodyItems
      .filter((item) => {
        const matchesBrand = !filters.brands.length || filters.brands.includes(item.brand);
        const matchesSearch =
          !searchQuery ||
          item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.model.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesBrand && matchesSearch;
      })
      .sort((a, b) => {
        if (sortOption === 'price_low') return a.resaleListingPriceUSD - b.resaleListingPriceUSD;
        if (sortOption === 'price_high') return b.resaleListingPriceUSD - a.resaleListingPriceUSD;
        if (sortOption === 'latest')
          return new Date(b.custodyVerifiedAt).getTime() - new Date(a.custodyVerifiedAt).getTime();
        return 0;
      });
  }, [custodyItems, filters.brands, searchQuery, sortOption]);

  // Create a connection to the devnet endpoint.
  const connection = useMemo(
    () =>
      new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'),
    []
  );

  const VendorSliderCard = ({ vendor }: { vendor: VendorProfile }) => {
    const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';

    return (
      <Link href={`/vendor/${vendor.wallet}`} className={styles.vendorSliderCard}>
        <div className={styles.vendorSliderAvatarWrapper}>
          {vendor.avatarUrl ? (
            <img src={vendor.avatarUrl} alt={vendor.name} className={styles.vendorSliderAvatar} />
          ) : (
            <div className={styles.vendorSliderAvatarPlaceholder} />
          )}
        </div>
        <div className={styles.vendorSliderInfo}>
          <p className={styles.vendorSliderName}>
            {vendor.name}
            {vendor.verified && <FaRegCircleCheck className={styles.verifiedIconSmall} />}
          </p>
          <p className={styles.vendorSliderUsername}>@{vendor.username}</p>
        </div>
      </Link>
    );
  };

  const metaplex = useMemo(() => {
    if (wallet.publicKey) {
      return Metaplex.make(connection).use(walletAdapterIdentity(wallet));
    }
    return null;
  }, [wallet.publicKey, connection]);

  const program = useMemo(() => {
    return wallet.publicKey ? getProgram(wallet) : null;
  }, [wallet.publicKey]);

  const [isLoading, setIsLoading] = useState(true);

  // ------------------------------------------------
  // 1. Fetch NFTs - works without wallet connection
  // ------------------------------------------------
  const fetchNFTs = async () => {
    setIsLoading(true);
    const nftList: NFT[] = [];
    const seenMints = new Set<string>();

    try {
      // First: Fetch from escrow API (no wallet required)
      const escrowRes = await fetch('/api/escrow/list?status=initiated&limit=100');
      if (escrowRes.ok) {
        const { listings } = await escrowRes.json();
        console.log('📦 Escrow listings:', listings?.length || 0);

        for (const listing of listings || []) {
          if (listing.nftMint && !seenMints.has(listing.nftMint)) {
            seenMints.add(listing.nftMint);
            nftList.push({
              title: listing.asset?.model || 'Luxury Item',
              description: listing.asset?.description || 'No description provided.',
              image: listing.asset?.imageUrl || '',
              priceSol: (listing.listingPrice || 0) / 1e9,
              mintAddress: listing.nftMint,
              metadataUri: '',
              currentOwner: listing.sellerWallet || 'Unknown',
              marketStatus: listing.acceptingOffers ? 'accepting_offers' : 'active',
              nftId: listing._id,
              fileCid: '',
              timestamp: new Date(listing.createdAt).getTime(),
              seller: listing.vendor?.businessName || '',
              attributes: [
                { trait_type: 'Brand', value: listing.asset?.model?.split(' ')[0] || '' },
                { trait_type: 'Price', value: String((listing.listingPrice || 0) / 1e9) },
                {
                  trait_type: 'Market Status',
                  value: listing.acceptingOffers ? 'accepting_offers' : 'active',
                },
              ],
              salePrice: listing.listingPriceUSD,
              // Escrow offer data
              escrowPda: listing.escrowPda,
              acceptingOffers: listing.acceptingOffers,
              minimumOfferUSD: listing.minimumOfferUSD,
              vendorName: listing.vendor?.businessName,
            });
          }
        }
      }

      // Second: Fetch from Pinata for additional NFTs (parallel with batching)
      const pinataRes = await fetch('/api/pinata/nfts');
      if (pinataRes.ok) {
        const rawData: any[] = await pinataRes.json();
        console.log('📦 Pinata data received:', rawData?.length || 0);

        // Batch fetch pinned data in parallel (max 10 concurrent)
        const BATCH_SIZE = 10;
        const batches = [];
        for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
          batches.push(rawData.slice(i, i + BATCH_SIZE));
        }

        for (const batch of batches) {
          const results = await Promise.allSettled(
            batch.map(async (item: any) => {
              const ipfsHash = item.ipfs_pin_hash;
              const pinnedRes = await fetch(`${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`);
              if (!pinnedRes.ok) return null;

              const contentType = pinnedRes.headers.get('content-type');
              if (!contentType?.includes('application/json')) return null;

              const pinnedData = await pinnedRes.json();
              return { ipfsHash, pinnedData, datePinned: item.date_pinned };
            })
          );

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              const { ipfsHash, pinnedData } = result.value;
              const mintAddress = pinnedData.mintAddress;

              if (!mintAddress || seenMints.has(mintAddress)) continue;
              seenMints.add(mintAddress);

              const marketStatus =
                pinnedData.attributes?.find((attr: any) => attr.trait_type === 'Market Status')
                  ?.value || 'inactive';

              const validStatuses = ['active', 'Holding LuxHub'];
              if (!validStatuses.includes(marketStatus)) continue;

              const priceAttr = pinnedData.attributes?.find(
                (attr: any) => attr.trait_type === 'Price'
              );
              const extractedPriceSol = parseFloat(priceAttr?.value || '0');

              nftList.push({
                title: pinnedData.name || 'Untitled',
                description: pinnedData.description || 'No description provided.',
                image: pinnedData.image || '',
                priceSol: extractedPriceSol,
                mintAddress,
                metadataUri: `${process.env.NEXT_PUBLIC_GATEWAY_URL}${ipfsHash}`,
                currentOwner:
                  pinnedData.attributes?.find((attr: any) => attr.trait_type === 'Current Owner')
                    ?.value || 'Unknown',
                marketStatus,
                nftId: '',
                fileCid: ipfsHash,
                timestamp: Date.now(),
                seller: '',
                attributes: (pinnedData.attributes || [])
                  .filter((attr: any) => attr.trait_type && attr.value)
                  .map((attr: any) => ({
                    trait_type: attr.trait_type as string,
                    value: attr.value as string,
                  })),
              });
            }
          }
        }
      }

      // Optionally enhance with on-chain data if wallet connected
      if (metaplex && nftList.length > 0) {
        console.log('🔗 Enhancing with on-chain data...');
        const enhanced = await Promise.allSettled(
          nftList.slice(0, 20).map(async (nft) => {
            try {
              const onChainNFT = await metaplex.nfts().findByMint({
                mintAddress: new PublicKey(nft.mintAddress),
              });
              if (onChainNFT.json) {
                return {
                  ...nft,
                  title: onChainNFT.json.name || nft.title,
                  image: onChainNFT.json.image || nft.image,
                  metadataUri: onChainNFT.uri,
                };
              }
            } catch {
              // Ignore on-chain fetch errors
            }
            return nft;
          })
        );

        enhanced.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            nftList[index] = result.value;
          }
        });
      }

      console.log('🔎 Final NFTs:', nftList.length);

      // If no real NFTs found, show mock data for demo purposes
      if (nftList.length === 0) {
        console.log('📦 No real NFTs found, loading mock data for demonstration');
        setNfts(MOCK_NFTS);
      } else {
        setNfts(nftList);
      }
    } catch (error) {
      console.error('❌ Error fetching NFTs:', error);
      // On error, show mock data so the page isn't empty
      setNfts(MOCK_NFTS);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNFTs();
    const interval = setInterval(fetchNFTs, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []); // Remove metaplex dependency - fetch works without wallet

  // Re-enhance with on-chain data when wallet connects
  useEffect(() => {
    if (metaplex && nfts.length > 0) {
      // Optional: re-fetch to get enhanced data
      fetchNFTs();
    }
  }, [metaplex]);

  useEffect(() => {
    fetch('/api/vendor/vendorList')
      .then((res) => res.json())
      .then((data) => {
        setVendors(data.vendors || []);
        setVerifiedVendors(data.verifiedVendors || []);
      })
      .catch((err) => console.error('Failed to load vendors:', err));
  }, []);

  // Fetch pools for fractional ownership
  useEffect(() => {
    const fetchPools = async () => {
      setIsLoadingPools(true);
      try {
        const res = await fetch('/api/pools?status=open');
        if (res.ok) {
          const data = await res.json();
          if (data.pools && data.pools.length > 0) {
            setPools(data.pools);
          } else {
            // Use mock data if no real pools
            setPools(MOCK_POOLS);
          }
        } else {
          setPools(MOCK_POOLS);
        }
      } catch (error) {
        console.error('Error fetching pools:', error);
        setPools(MOCK_POOLS);
      } finally {
        setIsLoadingPools(false);
      }
    };
    fetchPools();
  }, []);

  // Fetch custody items (funded pools listed for resale)
  useEffect(() => {
    const fetchCustody = async () => {
      setIsLoadingCustody(true);
      try {
        const res = await fetch('/api/pools?status=listed');
        if (res.ok) {
          const data = await res.json();
          if (data.pools && data.pools.length > 0) {
            // Transform pool data to custody format
            const custodyData: CustodyItem[] = data.pools.map((pool: any) => ({
              _id: pool._id,
              poolId: pool._id,
              title: pool.asset?.model || pool.title || 'Luxury Item',
              description: pool.description || 'Verified item in LuxHub custody.',
              image: pool.asset?.imageUrl || pool.image || '',
              originalPurchaseUSD: pool.targetAmountUSD,
              resaleListingPriceUSD: pool.resaleListingPriceUSD,
              resaleListingPriceSol: pool.resaleListingPrice,
              totalInvestors: pool.participants?.length || 0,
              projectedProfitPercent:
                ((pool.resaleListingPriceUSD - pool.targetAmountUSD) / pool.targetAmountUSD) * 100,
              custodyVerifiedAt: pool.custodyReceivedAt || pool.updatedAt,
              brand: pool.asset?.brand || pool.brand || '',
              model: pool.asset?.model || pool.model || '',
              status: 'listed',
            }));
            setCustodyItems(custodyData);
          } else {
            setCustodyItems(MOCK_CUSTODY);
          }
        } else {
          setCustodyItems(MOCK_CUSTODY);
        }
      } catch (error) {
        console.error('Error fetching custody items:', error);
        setCustodyItems(MOCK_CUSTODY);
      } finally {
        setIsLoadingCustody(false);
      }
    };
    fetchCustody();
  }, []);

  // Handle wallet connected callback from WalletGuide modal
  const handleWalletConnected = useCallback(() => {
    setShowWalletModal(false);
    // If there was a pending purchase, proceed with it
    if (pendingPurchaseNft && wallet.publicKey) {
      handlePurchase(pendingPurchaseNft);
      setPendingPurchaseNft(null);
    }
  }, [pendingPurchaseNft, wallet.publicKey]);

  // Handle making an offer
  const handleMakeOffer = (nft: NFT) => {
    // Check if this is a mock NFT
    if (nft.mintAddress.startsWith('mock_')) {
      alert(
        `This is a demo listing for "${nft.title}". Real offers will be available when live NFTs are minted.\n\nContact LuxHub to list your luxury items!`
      );
      return;
    }

    if (!wallet.connected) {
      setShowWalletModal(true);
      return;
    }
    setOfferNft(nft);
  };

  // ------------------------------------------------
  // 2. Purchase Handler
  // ------------------------------------------------
  const handlePurchase = async (nft: NFT) => {
    // Check if this is a mock NFT
    if (nft.mintAddress.startsWith('mock_')) {
      alert(
        `This is a demo listing for "${nft.title}". Real purchases will be available when live NFTs are minted.\n\nContact LuxHub to list your luxury items!`
      );
      return;
    }

    if (!wallet.publicKey || !program) {
      // Show wallet guide modal instead of alert
      setPendingPurchaseNft(nft);
      setShowWalletModal(true);
      return;
    }

    if (!window.confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;
    setLoadingMint(nft.mintAddress);

    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT); // So111... is wSOL
      const LAMPORTS_PER_SOL = 1_000_000_000;
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);

      // Prepare ATAs
      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
      const vaultAta = await getAssociatedTokenAddress(fundsMint, buyer, true);

      const buyerFundsAtaInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftAtaInfo = await connection.getAccountInfo(buyerNftAta);

      const balance = await connection.getBalance(buyer);
      const preIx: TransactionInstruction[] = [];

      if (balance < priceLamports + 1_000_000) {
        throw new Error(`Insufficient SOL balance. Required: ${priceLamports}, Found: ${balance}`);
      }

      // Create buyer wSOL ATA if missing
      if (!buyerFundsAtaInfo) {
        console.log('Creating buyer wSOL ATA...');
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerFundsAta, buyer, fundsMint));
      }

      // Create buyer NFT ATA if missing
      if (!buyerNftAtaInfo) {
        console.log('Creating buyer NFT ATA...');
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerNftAta, buyer, nftMint));
      }

      // Wrap SOL into wSOL
      preIx.push(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: buyerFundsAta,
          lamports: priceLamports,
        }),
        createSyncNativeInstruction(buyerFundsAta)
      );

      // Fetch escrow PDA
      const escrowAccounts = await (program.account as any).escrow.all([
        { memcmp: { offset: 113, bytes: nft.mintAddress } },
      ]);
      if (escrowAccounts.length !== 1) {
        throw new Error('Could not uniquely identify escrow account for this NFT.');
      }

      const escrowPda = escrowAccounts[0].publicKey;
      const vault = await getAssociatedTokenAddress(fundsMint, escrowPda, true);
      const vaultExists = await connection.getAccountInfo(vault);

      if (!vaultExists) {
        console.log('Creating escrow vault ATA...');
        preIx.push(createAssociatedTokenAccountInstruction(buyer, vault, escrowPda, fundsMint));
      }

      console.log('📦 Sending exchange()...');
      const tx = await program.methods
        .exchange()
        .preInstructions(preIx)
        .accounts({
          taker: buyer,
          mintA: fundsMint,
          mintB: nftMint,
          takerFundsAta: buyerFundsAta,
          takerNftAta: buyerNftAta,
          vault,
          escrow: escrowPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      alert('✅ Purchase successful! Tx: ' + tx);

      // Update DB
      await fetch('/api/nft/updateBuyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: buyer.toBase58(),
          mintAddress: nft.mintAddress,
          vaultAta: vault.toBase58(),
          priceSol: nft.priceSol,
        }),
      });

      await delay(1000);
      fetchNFTs();
    } catch (err: any) {
      console.error('❌ Purchase failed:', err);
      alert('Purchase failed: ' + err.message);
    } finally {
      setLoadingMint(null);
    }
  };

  const getTotalFiltersSelected = () => {
    return Object.values(filters).reduce(
      (count, arr) => count + (Array.isArray(arr) ? arr.length : 0),
      0
    );
  };

  const totalSelected = getTotalFiltersSelected();

  return (
    <div className={styles.container}>
      {/* Wallet Connection Banner - show when not connected */}
      {!wallet.connected && (
        <div className={styles.walletBanner}>
          <div className={styles.walletBannerContent}>
            <span>Connect your wallet to purchase NFTs and make offers</span>
            <WalletGuide compact />
          </div>
        </div>
      )}

      <div className={styles.title}>
        <h2>Marketplace</h2>

        <div className={styles.titleSeparator}>
          <div className={styles.inputGroupContainer}>
            <div className={styles.inputGroup}>
              <div className={styles.searchContainer}>
                <button>
                  <CiSearch className={styles.searchIcon} />
                </button>
                <input
                  type="text"
                  placeholder="Search by brand or mint address"
                  className={styles.searchBar}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className={styles.clearButton}>
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          <button className={styles.filterToggle} onClick={() => setShowFilters(true)}>
            Filters{' '}
            {totalSelected > 0 ? (
              <span className={styles.filterCount}>({totalSelected})</span>
            ) : (
              <FaAngleRight />
            )}
          </button>
        </div>

        {/* <div className={styles.inputGroupContainer}>
          <div className={styles.inputGroup}>
            <div className={styles.searchContainer}>
              <button><CiSearch className={styles.searchIcon} /></button>
              <input
                type="text"
                placeholder="Search by brand or mint address"
                className={styles.searchBar}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className={styles.clearButton}>
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <button className={styles.filterToggle} onClick={() => setShowFilters(true)}>
          Filters{" "}
          {totalSelected > 0 ? (
            <span className={styles.filterCount}>({totalSelected})</span>
          ) : (
            <FaAngleRight />
          )}
        </button> */}
      </div>

      {/* === VENDOR SLIDER SECTION === */}
      <div className={styles.vendorSliderSection}>
        <div className={styles.vendorSliderHeader}>
          <h3>LuxHub Dealers</h3>
          <Link href="/vendors" className={styles.viewAllButton}>
            View All <FaAngleRight />
          </Link>
        </div>

        <div className={styles.vendorSlider}>
          {/* Verified dealers first */}
          {verifiedVendors.map((vendor) => (
            <VendorSliderCard key={`verified-${vendor.wallet}`} vendor={vendor} />
          ))}

          {/* Then other approved dealers (avoid duplicates) */}
          {vendors
            .filter((v) => !verifiedVendors.some((vv) => vv.wallet === v.wallet))
            .slice(0, 12)
            .map((vendor) => (
              <VendorSliderCard key={vendor.wallet} vendor={vendor} />
            ))}

          {/* Loading/skeleton fallback */}
          {vendors.length === 0 && verifiedVendors.length === 0 && (
            <>
              {[...Array(6)].map((_, i) => (
                <div key={i} className={styles.vendorSliderCardSkeleton}>
                  <div className={styles.vendorSliderAvatarPlaceholder} />
                  <div className={styles.vendorSliderInfo}>
                    <p></p>
                    <p></p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {/* === END VENDOR SLIDER === */}

      {/* Section Tabs */}
      <div className={styles.sectionTabs}>
        <button
          className={`${styles.sectionTab} ${activeSection === 'direct_sales' ? styles.activeTab : ''}`}
          onClick={() => setActiveSection('direct_sales')}
        >
          <HiOutlineBuildingStorefront className={styles.tabIcon} />
          <span>Direct Sales</span>
          <span className={styles.tabCount}>{filteredNfts.length}</span>
        </button>
        <button
          className={`${styles.sectionTab} ${activeSection === 'pools' ? styles.activeTab : ''}`}
          onClick={() => setActiveSection('pools')}
        >
          <FaUsers className={styles.tabIcon} />
          <span>Investment Pools</span>
          <span className={styles.tabCount}>{filteredPools.length}</span>
        </button>
        <button
          className={`${styles.sectionTab} ${activeSection === 'custody' ? styles.activeTab : ''}`}
          onClick={() => setActiveSection('custody')}
        >
          <FaLock className={styles.tabIcon} />
          <span>LuxHub Custody</span>
          <span className={styles.tabCount}>{filteredCustody.length}</span>
        </button>
      </div>

      <div className={`${styles.filterPanelWrapper} ${showFilters ? styles.open : styles.closed}`}>
        <FilterSortPanel
          onFilterChange={(incomingFilters) =>
            setFilters((prev) => ({
              ...prev,
              brands: incomingFilters.brands ?? [],
              materials: incomingFilters.materials ?? [],
              colors: incomingFilters.colors ?? [],
              sizes: incomingFilters.sizes ?? [],
              categories: incomingFilters.categories ?? [],
            }))
          }
          currentFilters={filters}
          onSortChange={setSortOption}
          currentSort={sortOption}
          onClose={() => setShowFilters(false)}
        />
      </div>

      {/* ============================================
          DIRECT SALES SECTION
          ============================================ */}
      {activeSection === 'direct_sales' && (
        <>
          <div className={styles.sectionHeader}>
            <h3>Full Price Watches</h3>
            <p className={styles.sectionDescription}>
              Purchase luxury timepieces directly through our secure escrow system
            </p>
          </div>

          {isLoading ? (
            <div className={styles.skeletonGrid}>
              {[...Array(8)].map((_, i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonContent}>
                    <div className={styles.skeletonTitle} />
                    <div className={styles.skeletonPrice} />
                    <div className={styles.skeletonActions}>
                      <div className={styles.skeletonButton} />
                      <div className={styles.skeletonButton} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredNfts.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No items available</h3>
              <p>Check back soon for new luxury listings</p>
            </div>
          ) : (
            <div className={styles.nftGrid}>
              {filteredNfts.map((nft, index) => (
                <div key={index} className={styles.cardWrapper} style={{ position: 'relative' }}>
                  {nft.mintAddress.startsWith('mock_') && (
                    <span className={styles.demoBadge}>Demo</span>
                  )}
                  <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
                  <div className={styles.sellerActions}>
                    {nft.marketStatus === 'pending' ? (
                      <p className={styles.statusPending}>Pending Approval</p>
                    ) : nft.marketStatus === 'requested' ? (
                      <p className={styles.statusListed}>Listed</p>
                    ) : nft.marketStatus === 'Holding LuxHub' ? (
                      <button
                        className={styles.contactButton}
                        onClick={() =>
                          window.open(
                            `https://explorer.solana.com/address/${nft.currentOwner}?cluster=devnet`,
                            '_blank'
                          )
                        }
                      >
                        Contact
                      </button>
                    ) : nft.acceptingOffers && nft.escrowPda ? (
                      <>
                        <button className={styles.offerButton} onClick={() => handleMakeOffer(nft)}>
                          Offer
                        </button>
                        <button
                          onClick={() => handlePurchase(nft)}
                          disabled={loadingMint === nft.mintAddress}
                        >
                          {loadingMint === nft.mintAddress ? '...' : 'BUY'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handlePurchase(nft)}
                        disabled={loadingMint === nft.mintAddress}
                      >
                        {loadingMint === nft.mintAddress ? '...' : 'BUY'}
                      </button>
                    )}

                    <p className={styles.priceInfo}>
                      <SiSolana />
                      {nft.priceSol.toFixed(1)}
                    </p>

                    <p className={styles.statusBadge}>
                      {nft.acceptingOffers
                        ? 'Offers'
                        : nft.marketStatus === 'active'
                          ? 'Live'
                          : 'Hold'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================================
          INVESTMENT POOLS SECTION
          ============================================ */}
      {activeSection === 'pools' && (
        <>
          <div className={styles.sectionHeader}>
            <h3>Fractional Investment Pools</h3>
            <p className={styles.sectionDescription}>
              Invest in luxury timepieces with fractional ownership. Join pools to share in future
              resale profits.
            </p>
          </div>

          {isLoadingPools ? (
            <div className={styles.poolGrid}>
              {[...Array(4)].map((_, i) => (
                <div key={i} className={styles.poolCardSkeleton}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonContent}>
                    <div className={styles.skeletonTitle} />
                    <div className={styles.skeletonProgressBar} />
                    <div className={styles.skeletonStats}>
                      <div className={styles.skeletonStat} />
                      <div className={styles.skeletonStat} />
                      <div className={styles.skeletonStat} />
                    </div>
                    <div className={styles.skeletonButton} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPools.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No active pools</h3>
              <p>New investment opportunities coming soon</p>
            </div>
          ) : (
            <div className={styles.poolGrid}>
              {filteredPools.map((pool) => {
                const fundingPercent = Math.round(
                  (pool.currentAmountUSD / pool.targetAmountUSD) * 100
                );
                const isDemo = pool._id.startsWith('pool_');
                return (
                  <div key={pool._id} className={styles.poolCard}>
                    {isDemo && <span className={styles.demoBadge}>Demo</span>}
                    <div className={styles.poolImageWrapper}>
                      <img
                        src={pool.image || '/images/purpleLGG.png'}
                        alt={pool.title}
                        className={styles.poolImage}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                        }}
                      />
                      <div className={styles.poolBrand}>{pool.brand}</div>
                    </div>
                    <div className={styles.poolContent}>
                      <h4 className={styles.poolTitle}>{pool.title}</h4>
                      <p className={styles.poolModel}>{pool.model}</p>

                      {/* Funding Progress Bar */}
                      <div className={styles.progressSection}>
                        <div className={styles.progressHeader}>
                          <span>Funding Progress</span>
                          <span className={styles.progressPercent}>{fundingPercent}%</span>
                        </div>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${fundingPercent}%` }}
                          />
                        </div>
                        <div className={styles.progressValues}>
                          <span>${pool.currentAmountUSD.toLocaleString()}</span>
                          <span className={styles.progressTarget}>
                            of ${pool.targetAmountUSD.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Pool Stats */}
                      <div className={styles.poolStats}>
                        <div className={styles.poolStat}>
                          <BiTargetLock className={styles.statIcon} />
                          <div>
                            <span className={styles.statValue}>
                              ${pool.sharePriceUSD.toLocaleString()}
                            </span>
                            <span className={styles.statLabel}>per share</span>
                          </div>
                        </div>
                        <div className={styles.poolStat}>
                          <FaUsers className={styles.statIcon} />
                          <div>
                            <span className={styles.statValue}>
                              {pool.currentInvestors}/{pool.maxInvestors}
                            </span>
                            <span className={styles.statLabel}>investors</span>
                          </div>
                        </div>
                        <div className={styles.poolStat}>
                          <FaChartLine className={styles.statIcon} />
                          <div>
                            <span className={styles.statValue}>
                              {((pool.projectedROI - 1) * 100).toFixed(0)}%
                            </span>
                            <span className={styles.statLabel}>projected ROI</span>
                          </div>
                        </div>
                      </div>

                      {/* Invest Button */}
                      <button
                        className={styles.investButton}
                        onClick={() => {
                          if (isDemo) {
                            alert(
                              `This is a demo pool for "${pool.title}". Real investment pools will be available soon.\n\nMin investment: $${pool.minBuyInUSD.toLocaleString()}`
                            );
                          } else if (!wallet.connected) {
                            setShowWalletModal(true);
                          } else {
                            window.location.href = `/pool/${pool._id}`;
                          }
                        }}
                      >
                        Invest Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============================================
          LUXHUB CUSTODY SECTION
          ============================================ */}
      {activeSection === 'custody' && (
        <>
          <div className={styles.sectionHeader}>
            <h3>LuxHub Custody - Ready for Resale</h3>
            <p className={styles.sectionDescription}>
              Fully funded pools with verified watches in LuxHub secure storage. Purchase to
              distribute profits to investors.
            </p>
          </div>

          {isLoadingCustody ? (
            <div className={styles.custodyGrid}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className={styles.custodyCardSkeleton}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonContent}>
                    <div className={styles.skeletonTitle} />
                    <div className={styles.skeletonPrice} />
                    <div className={styles.skeletonStats}>
                      <div className={styles.skeletonStat} />
                      <div className={styles.skeletonStat} />
                    </div>
                    <div className={styles.skeletonButton} />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredCustody.length === 0 ? (
            <div className={styles.emptyState}>
              <h3>No custody items available</h3>
              <p>Items will appear here once pools are fully funded and verified</p>
            </div>
          ) : (
            <div className={styles.custodyGrid}>
              {filteredCustody.map((item) => {
                const isDemo = item._id.startsWith('custody_');
                return (
                  <div key={item._id} className={styles.custodyCard}>
                    {isDemo && <span className={styles.demoBadge}>Demo</span>}
                    <div className={styles.custodyBadge}>
                      <FaLock className={styles.custodyBadgeIcon} />
                      In Custody
                    </div>
                    <div className={styles.custodyImageWrapper}>
                      <img
                        src={item.image || '/images/purpleLGG.png'}
                        alt={item.title}
                        className={styles.custodyImage}
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/images/purpleLGG.png';
                        }}
                      />
                    </div>
                    <div className={styles.custodyContent}>
                      <div className={styles.custodyBrand}>{item.brand}</div>
                      <h4 className={styles.custodyTitle}>{item.title}</h4>

                      {/* Price Display */}
                      <div className={styles.custodyPricing}>
                        <div className={styles.originalPrice}>
                          <span className={styles.priceLabel}>Pool Value:</span>
                          <span className={styles.priceValue}>
                            ${item.originalPurchaseUSD.toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.resalePrice}>
                          <span className={styles.priceLabel}>Resale Price:</span>
                          <span className={styles.priceValueHighlight}>
                            ${item.resaleListingPriceUSD.toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.solPrice}>
                          <SiSolana className={styles.solIcon} />
                          <span>{item.resaleListingPriceSol.toLocaleString()} SOL</span>
                        </div>
                      </div>

                      {/* Profit Stats */}
                      <div className={styles.custodyStats}>
                        <div className={styles.custodyStat}>
                          <FaUsers className={styles.statIcon} />
                          <span>{item.totalInvestors} investors</span>
                        </div>
                        <div className={styles.profitBadge}>
                          <FaChartLine className={styles.statIcon} />
                          <span>+{item.projectedProfitPercent.toFixed(1)}% profit</span>
                        </div>
                      </div>

                      {/* Purchase Button */}
                      <button
                        className={styles.purchaseCustodyButton}
                        onClick={() => {
                          if (isDemo) {
                            alert(
                              `This is a demo custody item for "${item.title}".\n\nPurchasing this watch will distribute $${item.resaleListingPriceUSD.toLocaleString()} among ${item.totalInvestors} investors.`
                            );
                          } else if (!wallet.connected) {
                            setShowWalletModal(true);
                          } else {
                            // Navigate to custody purchase page
                            window.location.href = `/custody/${item._id}`;
                          }
                        }}
                      >
                        Purchase & Distribute Profits
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {selectedNFT && (
        <div className={styles.overlay}>
          <div className={styles.detailContainer}>
            <button onClick={() => setSelectedNFT(null)}>Close</button>
            <NftDetailCard
              mintAddress={selectedNFT.mintAddress}
              metadataUri={selectedNFT.metadataUri}
              onClose={() => setSelectedNFT(null)}
            />
          </div>
        </div>
      )}

      {/* Wallet Connection Modal */}
      {showWalletModal && (
        <div className={styles.walletModalOverlay} onClick={() => setShowWalletModal(false)}>
          <div className={styles.walletModalContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.walletModalClose}
              onClick={() => {
                setShowWalletModal(false);
                setPendingPurchaseNft(null);
              }}
            >
              ×
            </button>
            {pendingPurchaseNft && (
              <p className={styles.walletModalMessage}>
                Connect your wallet to purchase <strong>{pendingPurchaseNft.title}</strong>
              </p>
            )}
            <WalletGuide onConnected={handleWalletConnected} showSteps={false} />
          </div>
        </div>
      )}

      {/* Make Offer Modal */}
      {offerNft && offerNft.escrowPda && (
        <MakeOfferModal
          escrow={{
            escrowPda: offerNft.escrowPda,
            listingPriceUSD: offerNft.salePrice || offerNft.priceSol * 100,
            minimumOfferUSD: offerNft.minimumOfferUSD,
            asset: {
              model: offerNft.title,
              imageUrl: offerNft.image,
            },
            vendor: {
              businessName: offerNft.vendorName || offerNft.seller,
            },
          }}
          onClose={() => setOfferNft(null)}
          onSuccess={() => {
            setOfferNft(null);
            fetchNFTs(); // Refresh listings
          }}
        />
      )}
    </div>
  );
};

export default Marketplace;
