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
import { FaRegCircleCheck, FaAngleRight } from 'react-icons/fa6';
import { NftDetailCard } from '../components/marketplace/NftDetailCard';
import styles from '../styles/WatchMarket.module.css';
import { IoMdInformationCircle } from 'react-icons/io';
import { SiSolana } from 'react-icons/si';
import NFTCard from '../components/marketplace/NFTCard';
import FilterSortPanel from '../components/marketplace/FilterSortPanel';
import { CiSearch } from 'react-icons/ci';
import Loader from '../components/common/Loader';
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
}

type FilterOptions = {
  brands: string[];
  materials: string[];
  colors: string[];
  sizes: string[];
  categories: string[];
};

const FUNDS_MINT = 'So11111111111111111111111111111111111111112';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Marketplace = () => {
  const wallet = useWallet();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [pendingPurchaseNft, setPendingPurchaseNft] = useState<NFT | null>(null);

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
              marketStatus: 'active',
              nftId: listing._id,
              fileCid: '',
              timestamp: new Date(listing.createdAt).getTime(),
              seller: listing.vendor?.businessName || '',
              attributes: [
                { trait_type: 'Brand', value: listing.asset?.model?.split(' ')[0] || '' },
                { trait_type: 'Price', value: String((listing.listingPrice || 0) / 1e9) },
                { trait_type: 'Market Status', value: 'active' },
              ],
              salePrice: listing.listingPriceUSD,
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
      setNfts(nftList);
    } catch (error) {
      console.error('❌ Error fetching NFTs:', error);
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

  // Handle wallet connected callback from WalletGuide modal
  const handleWalletConnected = useCallback(() => {
    setShowWalletModal(false);
    // If there was a pending purchase, proceed with it
    if (pendingPurchaseNft && wallet.publicKey) {
      handlePurchase(pendingPurchaseNft);
      setPendingPurchaseNft(null);
    }
  }, [pendingPurchaseNft, wallet.publicKey]);

  // ------------------------------------------------
  // 2. Purchase Handler
  // ------------------------------------------------
  const handlePurchase = async (nft: NFT) => {
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
              {[...Array(8)].map((_, i) => (
                <div key={i} className={styles.vendorSliderCardSkeleton}>
                  <div className={styles.vendorSliderAvatarPlaceholder} />
                  <div className={styles.vendorSliderInfo}>
                    <p>Loading...</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      {/* === END VENDOR SLIDER === */}

      <div className={styles.vendorSliderHeader}>
        <h3>Timepieces</h3>
        <Link href="/vendors" className={styles.viewAllButton}>
          View Collections <FaAngleRight />
        </Link>
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

      {isLoading ? (
        <div className={styles.loadingContainer}>
          <Loader />
          <p>Loading marketplace...</p>
        </div>
      ) : nfts.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No items available</h3>
          <p>Check back soon for new luxury listings</p>
        </div>
      ) : (
        <div className={styles.nftGrid}>
          {filteredNfts.map((nft, index) => (
            <div key={index} className={styles.cardWrapper}>
              <NFTCard nft={nft} onClick={() => setSelectedNFT(nft)} />
              <div className={styles.sellerActions}>
                {nft.marketStatus === 'pending' ? (
                  <div
                    className={styles.tooltipWrapper}
                    data-tooltip="This NFT is waiting for admin approval before it can be listed"
                  >
                    <p>
                      Awaiting admin approval
                      <IoMdInformationCircle className={styles.infoIcon} />
                    </p>
                  </div>
                ) : nft.marketStatus === 'requested' ? (
                  <div
                    className={styles.tooltipWrapper}
                    data-tooltip="Submit your NFT for admin approval"
                  >
                    <p>
                      Listed in marketplace
                      <IoMdInformationCircle className={styles.infoIcon} />
                    </p>
                  </div>
                ) : nft.marketStatus === 'Holding LuxHub' ? (
                  <button
                    className={styles.contactButton}
                    data-tooltip="Reach out to the current owner to make an offer"
                    onClick={() =>
                      window.open(
                        `https://explorer.solana.com/address/${nft.currentOwner}?cluster=devnet`,
                        '_blank'
                      )
                    }
                  >
                    Make Offer
                  </button>
                ) : (
                  <button
                    className={styles.tooltipButton}
                    data-tooltip="This LuxHub NFT is in escrow ready for purchase"
                    onClick={() => handlePurchase(nft)}
                    disabled={loadingMint === nft.mintAddress}
                  >
                    {loadingMint === nft.mintAddress ? 'Processing...' : 'BUY'}
                  </button>
                )}

                <div className={styles.tooltipWrapper} data-tooltip="The price of this NFT">
                  <p className={styles.priceInfo}>
                    <SiSolana />
                    {nft.priceSol}
                    <IoMdInformationCircle className={styles.infoIcon} />
                  </p>
                </div>

                <p
                  className={styles.tooltipWrapper}
                  data-tooltip="The current holding status of this NFT in the marketplace"
                >
                  {nft.marketStatus === 'active' ? 'Available' : 'Holding'}
                  <IoMdInformationCircle className={styles.infoIcon} />
                </p>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
};

export default Marketplace;
