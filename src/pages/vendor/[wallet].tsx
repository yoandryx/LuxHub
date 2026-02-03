import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import {
  PublicKey,
  Connection,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from '@solana/web3.js';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../styles/VendorProfilePage.module.css';
import { NftDetailCard } from '../../components/marketplace/NftDetailCard';
import NFTCard from '../../components/marketplace/NFTCard';
import { useWallet } from '@solana/wallet-adapter-react';
import { getProgram } from '../../utils/programUtils';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createSyncNativeInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SiSolana } from 'react-icons/si';
import {
  FaCopy,
  FaGlobe,
  FaInstagram,
  FaXTwitter,
  FaArrowUpRightFromSquare,
  FaStore,
  FaEnvelope,
  FaLocationDot,
  FaCalendarDays,
  FaRegCircleCheck,
  FaEllipsis,
} from 'react-icons/fa6';
import {
  IoClose,
  IoGridOutline,
  IoBookmarkOutline,
  IoFlameOutline,
  IoCheckboxOutline,
  IoSquareOutline,
  IoPinOutline,
  IoPin,
} from 'react-icons/io5';
import { HiOutlineShoppingCart, HiOutlineTag } from 'react-icons/hi';
import toast from 'react-hot-toast';
import DelistRequestModal from '../../components/vendor/DelistRequestModal';
import BulkDelistModal from '../../components/vendor/BulkDelistModal';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
const FUNDS_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

interface NFT {
  _id?: string; // Asset ID for database operations
  title: string;
  description: string;
  image: string;
  priceSol: number;
  priceUSD?: number;
  mintAddress: string;
  metadataUri: string;
  currentOwner: string;
  marketStatus: string;
  status?: string; // Raw status from database
  nftId: string;
  fileCid: string;
  timestamp: number;
  seller: string;
  attributes?: { trait_type: string; value: string }[];
}

interface ProfileStats {
  totalItems: number;
  itemsListed: number;
  itemsBurned: number;
  totalSales: number;
  inventoryValue: number;
}

// Inventory value tiers for badge styling
const getInventoryTier = (value: number) => {
  if (value >= 500000) return { tier: 'diamond', label: 'Diamond', color: '#b9f2ff' };
  if (value >= 250000) return { tier: 'platinum', label: 'Platinum', color: '#e5e4e2' };
  if (value >= 100000) return { tier: 'gold', label: 'Gold', color: '#ffd700' };
  if (value >= 25000) return { tier: 'silver', label: 'Silver', color: '#c0c0c0' };
  if (value >= 5000) return { tier: 'bronze', label: 'Bronze', color: '#cd7f32' };
  return { tier: 'starter', label: 'Starter', color: '#888888' };
};

const VendorProfilePage = () => {
  const router = useRouter();
  const { query } = router;
  const wallet = useWallet();
  const [profile, setProfile] = useState<any>(null);
  const [nftData, setNftData] = useState<NFT[]>([]);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_loadingMint, setLoadingMint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'available' | 'holding' | 'burned'>(
    'all'
  );
  const [burnedNfts, setBurnedNfts] = useState<NFT[]>([]);
  const [stats, setStats] = useState<ProfileStats>({
    totalItems: 0,
    itemsListed: 0,
    itemsBurned: 0,
    totalSales: 0,
    inventoryValue: 0,
  });
  const [showDetailCard, setShowDetailCard] = useState(false);
  const [listingAssetId, setListingAssetId] = useState<string | null>(null);
  const [delistingNft, setDelistingNft] = useState<NFT | null>(null);

  // Bulk selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNfts, setSelectedNfts] = useState<Set<string>>(new Set());
  const [showBulkDelistModal, setShowBulkDelistModal] = useState(false);

  // Pinned NFTs (max 3)
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinningId, setPinningId] = useState<string | null>(null);

  // Buying state
  const [buyingMint, setBuyingMint] = useState<string | null>(null);

  // Offer state
  const [offeringMint, setOfferingMint] = useState<string | null>(null);

  const connection = useMemo(
    () =>
      new Connection(process.env.NEXT_PUBLIC_SOLANA_ENDPOINT || 'https://api.devnet.solana.com'),
    []
  );
  const program = useMemo(() => (wallet.publicKey ? getProgram(wallet) : null), [wallet.publicKey]);

  const isOwnProfile = wallet.publicKey?.toBase58() === profile?.wallet;
  const isVendor = profile?.verified || profile?.businessName;

  useEffect(() => {
    if (!query.wallet) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/vendor/profile?wallet=${query.wallet}`);
        const data = await res.json();
        setProfile(data?.error ? null : data);
        // Load pinned asset IDs from profile
        if (data?.pinnedAssets && Array.isArray(data.pinnedAssets)) {
          setPinnedIds(data.pinnedAssets);
        }
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [query.wallet]);

  // Helper to map API response to NFT interface
  const mapNftData = (nfts: any[], ownerWallet: string): NFT[] => {
    return nfts.map((nft: any) => ({
      _id: nft._id,
      mintAddress: nft.mintAddress,
      title: nft.title || 'Untitled',
      description: nft.description || '',
      image: nft.image || '/fallback.png',
      priceSol: nft.priceSol || 0,
      priceUSD: nft.priceUSD || 0,
      metadataUri: nft.metadataUri || '',
      currentOwner: nft.currentOwner || ownerWallet,
      marketStatus: nft.status === 'listed' ? 'active' : nft.status || 'inactive',
      status: nft.status,
      nftId: nft.nftId || nft.mintAddress,
      fileCid: nft.fileCid || '',
      timestamp: nft.timestamp || Date.now(),
      seller: nft.seller || ownerWallet,
      attributes: nft.attributes || [],
    }));
  };

  useEffect(() => {
    if (!profile?.wallet) return;

    const fetchNFTs = async () => {
      try {
        // Fetch active NFTs (excludes burned by default)
        const res = await fetch(`/api/vendor/nfts?wallet=${profile.wallet}`);
        const data = await res.json();

        if (data.error) {
          console.error('Error fetching NFTs:', data.error);
          return;
        }

        const nfts = mapNftData(data.nfts || [], profile.wallet);
        setNftData(nfts);

        // Calculate inventory value from NFT prices
        const inventoryValue = nfts.reduce((sum, nft) => sum + (nft.priceUSD || 0), 0);

        // Use stats from API + calculated inventory value
        setStats({
          totalItems: data.stats?.totalItems || 0,
          itemsListed: data.stats?.itemsListed || 0,
          itemsBurned: data.stats?.itemsBurned || 0,
          totalSales: data.stats?.totalSales || profile.totalSales || 0,
          inventoryValue,
        });
      } catch (err) {
        console.error('Failed to fetch NFTs:', err);
      }
    };

    fetchNFTs();
  }, [profile]);

  // Fetch burned NFTs only when burned tab is selected (lazy load)
  useEffect(() => {
    if (!profile?.wallet || activeFilter !== 'burned' || burnedNfts.length > 0) return;

    const fetchBurnedNFTs = async () => {
      try {
        const res = await fetch(`/api/vendor/nfts?wallet=${profile.wallet}&onlyBurned=true`);
        const data = await res.json();

        if (!data.error) {
          setBurnedNfts(mapNftData(data.nfts || [], profile.wallet));
        }
      } catch (err) {
        console.error('Failed to fetch burned NFTs:', err);
      }
    };

    fetchBurnedNFTs();
  }, [profile, activeFilter, burnedNfts.length]);

  const _handlePurchase = async (nft: NFT) => {
    if (!wallet.publicKey || !program) return alert('Connect wallet first.');
    if (!confirm(`Purchase ${nft.title} for ${nft.priceSol} SOL?`)) return;

    setLoadingMint(nft.mintAddress);

    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT);
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);

      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
      const buyerFundsInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftInfo = await connection.getAccountInfo(buyerNftAta);

      const balance = await connection.getBalance(buyer);
      if (balance < priceLamports + 1_000_000) throw new Error('Not enough SOL.');

      const preIx: TransactionInstruction[] = [];

      if (!buyerFundsInfo)
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerFundsAta, buyer, fundsMint));
      if (!buyerNftInfo)
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerNftAta, buyer, nftMint));

      preIx.push(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: buyerFundsAta,
          lamports: priceLamports,
        }),
        createSyncNativeInstruction(buyerFundsAta)
      );

      const escrowAccounts = await (program.account as any).escrow.all([
        { memcmp: { offset: 113, bytes: nft.mintAddress } },
      ]);
      if (escrowAccounts.length !== 1) throw new Error('Escrow not found.');
      const escrowPda = escrowAccounts[0].publicKey;
      const vault = await getAssociatedTokenAddress(fundsMint, escrowPda, true);

      if (!(await connection.getAccountInfo(vault))) {
        preIx.push(createAssociatedTokenAccountInstruction(buyer, vault, escrowPda, fundsMint));
      }

      await program.methods
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

      alert('Purchase successful!');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoadingMint(null);
    }
  };

  const handleCopyAddress = () => {
    if (profile?.wallet) {
      navigator.clipboard.writeText(profile.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleListForSale = async (nft: NFT) => {
    if (!wallet.publicKey || !nft._id) return;

    const confirmed = window.confirm(
      `List "${nft.title}" for sale at $${nft.priceUSD?.toLocaleString() || nft.priceSol} ?`
    );
    if (!confirmed) return;

    setListingAssetId(nft._id);

    try {
      const res = await fetch('/api/vendor/assets/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: nft._id,
          wallet: wallet.publicKey.toBase58(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        // Update local state to reflect the listing
        setNftData((prev) =>
          prev.map((n) =>
            n._id === nft._id ? { ...n, status: 'listed', marketStatus: 'active' } : n
          )
        );
        setStats((prev) => ({
          ...prev,
          itemsListed: prev.itemsListed + 1,
        }));
        alert('Successfully listed for sale!');
      } else {
        alert(data.error || 'Failed to list for sale');
      }
    } catch (err) {
      console.error('Failed to list for sale:', err);
      alert('Failed to list for sale. Please try again.');
    } finally {
      setListingAssetId(null);
    }
  };

  const filteredNFTs =
    activeFilter === 'burned'
      ? burnedNfts
      : nftData.filter((nft) => {
          if (activeFilter === 'all') return true;
          if (activeFilter === 'available') return nft.marketStatus === 'active';
          if (activeFilter === 'holding') return nft.marketStatus !== 'active';
          return true;
        });

  // Get NFTs that can be delisted (listed status)
  const delistableNfts = nftData.filter((nft) => nft.status === 'listed' && nft._id);

  // Toggle individual NFT selection
  const toggleNftSelection = (nftId: string) => {
    setSelectedNfts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nftId)) {
        newSet.delete(nftId);
      } else {
        newSet.add(nftId);
      }
      return newSet;
    });
  };

  // Select all delistable NFTs
  const selectAllDelistable = () => {
    setSelectedNfts(new Set(delistableNfts.map((nft) => nft._id!)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedNfts(new Set());
    setSelectionMode(false);
  };

  // Get selected NFT objects for bulk modal
  const getSelectedNftObjects = () => {
    return nftData.filter((nft) => nft._id && selectedNfts.has(nft._id));
  };

  // Get pinned NFTs
  const pinnedNfts = nftData.filter((nft) => nft._id && pinnedIds.includes(nft._id));

  // Pin/Unpin an NFT (max 3)
  const togglePin = async (nftId: string) => {
    if (!wallet.publicKey || !profile?.wallet) return;

    const isPinned = pinnedIds.includes(nftId);
    const newPinnedIds = isPinned
      ? pinnedIds.filter((id) => id !== nftId)
      : pinnedIds.length < 3
        ? [...pinnedIds, nftId]
        : pinnedIds;

    if (!isPinned && pinnedIds.length >= 3) {
      toast.error('You can only pin up to 3 items');
      return;
    }

    setPinningId(nftId);

    try {
      const res = await fetch('/api/vendor/updateProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.publicKey.toBase58(),
          pinnedAssets: newPinnedIds,
        }),
      });

      const data = await res.json();

      if (data.success || !data.error) {
        setPinnedIds(newPinnedIds);
        toast.success(isPinned ? 'Unpinned from profile' : 'Pinned to profile');
      } else {
        toast.error(data.error || 'Failed to update pins');
      }
    } catch (err) {
      console.error('Failed to toggle pin:', err);
      toast.error('Failed to update pins');
    } finally {
      setPinningId(null);
    }
  };

  // Handle purchase from vendor profile
  const handleBuyNow = async (nft: NFT) => {
    if (!wallet.publicKey || !program) {
      toast.error('Please connect your wallet');
      return;
    }

    if (wallet.publicKey.toBase58() === profile?.wallet) {
      toast.error("You can't buy your own NFT");
      return;
    }

    const confirmed = window.confirm(
      `Purchase "${nft.title}" for ${nft.priceSol} SOL ($${nft.priceUSD?.toLocaleString() || '?'})?`
    );
    if (!confirmed) return;

    setBuyingMint(nft.mintAddress);

    try {
      const buyer = wallet.publicKey;
      const nftMint = new PublicKey(nft.mintAddress);
      const fundsMint = new PublicKey(FUNDS_MINT);
      const priceLamports = Math.floor(nft.priceSol * LAMPORTS_PER_SOL);

      const buyerFundsAta = await getAssociatedTokenAddress(fundsMint, buyer);
      const buyerNftAta = await getAssociatedTokenAddress(nftMint, buyer);
      const buyerFundsInfo = await connection.getAccountInfo(buyerFundsAta);
      const buyerNftInfo = await connection.getAccountInfo(buyerNftAta);

      const balance = await connection.getBalance(buyer);
      if (balance < priceLamports + 1_000_000) {
        toast.error('Not enough SOL in wallet');
        setBuyingMint(null);
        return;
      }

      const preIx: TransactionInstruction[] = [];

      if (!buyerFundsInfo)
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerFundsAta, buyer, fundsMint));
      if (!buyerNftInfo)
        preIx.push(createAssociatedTokenAccountInstruction(buyer, buyerNftAta, buyer, nftMint));

      preIx.push(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: buyerFundsAta,
          lamports: priceLamports,
        }),
        createSyncNativeInstruction(buyerFundsAta)
      );

      // Find escrow PDA
      const escrowAccounts = await (program.account as any).escrow.all([
        { memcmp: { offset: 113, bytes: nft.mintAddress } },
      ]);

      if (escrowAccounts.length !== 1) {
        toast.error('Escrow not found for this NFT');
        setBuyingMint(null);
        return;
      }

      const escrowPda = escrowAccounts[0].publicKey;
      const vault = await getAssociatedTokenAddress(fundsMint, escrowPda, true);

      if (!(await connection.getAccountInfo(vault))) {
        preIx.push(createAssociatedTokenAccountInstruction(buyer, vault, escrowPda, fundsMint));
      }

      await program.methods
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

      // Update backend
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

      toast.success('Purchase successful!');

      // Remove from local state
      setNftData((prev) => prev.filter((n) => n.mintAddress !== nft.mintAddress));
    } catch (e: any) {
      console.error('Purchase error:', e);
      toast.error('Purchase failed: ' + (e.message || 'Unknown error'));
    } finally {
      setBuyingMint(null);
    }
  };

  // Handle making an offer on an NFT
  const handleMakeOffer = async (nft: NFT) => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (wallet.publicKey.toBase58() === profile?.wallet) {
      toast.error("You can't make an offer on your own NFT");
      return;
    }

    // Prompt for offer amount
    const offerInput = window.prompt(
      `Make an offer on "${nft.title}"\n\nListed Price: $${nft.priceUSD?.toLocaleString() || '?'} (${nft.priceSol} SOL)\n\nEnter your offer in USD:`
    );

    if (!offerInput) return;

    const offerAmountUSD = parseFloat(offerInput);
    if (isNaN(offerAmountUSD) || offerAmountUSD <= 0) {
      toast.error('Please enter a valid offer amount');
      return;
    }

    setOfferingMint(nft.mintAddress);

    try {
      const res = await fetch('/api/offers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mintAddress: nft.mintAddress,
          offerPriceUSD: offerAmountUSD,
          buyerWallet: wallet.publicKey.toBase58(),
          message: `Offer on ${nft.title} from ${wallet.publicKey.toBase58().slice(0, 8)}...`,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Offer of $${offerAmountUSD.toLocaleString()} submitted!`);
      } else {
        toast.error(data.error || 'Failed to submit offer');
      }
    } catch (err) {
      console.error('Offer error:', err);
      toast.error('Failed to submit offer');
    } finally {
      setOfferingMint(null);
    }
  };

  const formatDate = (timestamp?: number | string) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.pageContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  // Error or not found state
  if (error || !profile) {
    return (
      <div className={styles.pageContainer}>
        <motion.div
          className={styles.errorContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2>Profile Not Found</h2>
          <p>This wallet doesn&apos;t have a profile yet.</p>
          <button onClick={() => router.push('/vendors')} className={styles.backButton}>
            Browse Vendors
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* Banner Section - X/Twitter Style */}
      <div className={styles.bannerSection}>
        {profile?.bannerUrl ? (
          <img src={profile.bannerUrl} alt="Profile banner" className={styles.bannerImage} />
        ) : (
          <div className={styles.bannerPlaceholder}>
            <div className={styles.bannerGradient}></div>
          </div>
        )}
      </div>

      {/* Profile Header - X/Twitter Style */}
      <div className={styles.profileWrapper}>
        <motion.div
          className={styles.profileHeader}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* Avatar Row with Actions */}
          <div className={styles.avatarRow}>
            <motion.div
              className={styles.avatarSection}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {profile?.avatarUrl ? (
                <img src={profile.avatarUrl} alt={profile.name} className={styles.avatar} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <FaStore />
                </div>
              )}
            </motion.div>

            {/* Action Buttons - Right aligned like X */}
            <div className={styles.headerActions}>
              {isOwnProfile ? (
                <button
                  className={styles.editProfileBtn}
                  onClick={() => router.push('/vendor/vendorDashboard')}
                >
                  Edit profile
                </button>
              ) : (
                <>
                  <button className={styles.moreBtn}>
                    <FaEllipsis />
                  </button>
                  <button className={styles.messageBtn}>
                    <FaEnvelope />
                  </button>
                  <button className={styles.followBtn}>Follow</button>
                </>
              )}
            </div>
          </div>

          {/* Profile Info */}
          <div className={styles.profileInfo}>
            <div className={styles.nameRow}>
              <h1 className={styles.profileName}>
                {profile.name || profile.businessName || 'User'}
              </h1>
              {isVendor && (
                <span className={styles.vendorBadge}>
                  <FaRegCircleCheck />
                  Verified Vendor
                </span>
              )}
            </div>

            <p className={styles.username}>@{profile.username || profile.wallet?.slice(0, 8)}</p>

            {profile.bio && <p className={styles.bio}>{profile.bio}</p>}

            {/* Meta Info Row */}
            <div className={styles.metaRow}>
              {profile.location && (
                <span className={styles.metaItem}>
                  <FaLocationDot />
                  {profile.location}
                </span>
              )}
              <span className={styles.metaItem}>
                <FaCalendarDays />
                Joined {formatDate(profile.createdAt)}
              </span>
            </div>

            {/* Social Links */}
            <div className={styles.socialRow}>
              {profile.socialLinks?.x && (
                <a
                  href={profile.socialLinks.x}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.socialLink}
                >
                  <FaXTwitter />
                </a>
              )}
              {profile.socialLinks?.instagram && (
                <a
                  href={profile.socialLinks.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.socialLink}
                >
                  <FaInstagram />
                </a>
              )}
              {profile.socialLinks?.website && (
                <a
                  href={profile.socialLinks.website}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.socialLink}
                >
                  <FaGlobe />
                </a>
              )}
              <button onClick={handleCopyAddress} className={styles.walletBtn}>
                <span>
                  {profile.wallet?.slice(0, 4)}...{profile.wallet?.slice(-4)}
                </span>
                <FaCopy />
                {copied && <span className={styles.copiedTooltip}>Copied!</span>}
              </button>
              <a
                href={`https://explorer.solana.com/address/${profile.wallet}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className={styles.explorerBtn}
              >
                <FaArrowUpRightFromSquare />
              </a>
            </div>

            {/* Stats Row - Badge Style */}
            <div className={styles.statsRow}>
              <div className={styles.statBadge}>
                <span className={styles.statValue}>{stats.totalItems}</span>
                <span className={styles.statLabel}>Items</span>
              </div>
              <div className={styles.statBadge}>
                <span className={styles.statValue}>{stats.itemsListed}</span>
                <span className={styles.statLabel}>Listed</span>
              </div>
              {/* Tiered Inventory Badge */}
              <div
                className={`${styles.inventoryBadge} ${styles[`tier${getInventoryTier(stats.inventoryValue).tier.charAt(0).toUpperCase() + getInventoryTier(stats.inventoryValue).tier.slice(1)}`]}`}
                title={`${getInventoryTier(stats.inventoryValue).label} Tier - $${stats.inventoryValue.toLocaleString()} inventory`}
              >
                <div className={styles.tierGlow} />
                <div className={styles.tierShine} />
                <span className={styles.tierValue}>
                  $
                  {stats.inventoryValue >= 1000
                    ? `${(stats.inventoryValue / 1000).toFixed(0)}k`
                    : stats.inventoryValue}
                </span>
                <span className={styles.tierLabel}>
                  {getInventoryTier(stats.inventoryValue).label}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Tab Navigation - Instagram Style */}
        <div className={styles.tabNav}>
          <button
            className={`${styles.tabItem} ${activeFilter === 'all' ? styles.activeTab : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            <IoGridOutline />
            <span>ALL</span>
          </button>
          <button
            className={`${styles.tabItem} ${activeFilter === 'available' ? styles.activeTab : ''}`}
            onClick={() => setActiveFilter('available')}
          >
            <SiSolana />
            <span>LISTED</span>
          </button>
          <button
            className={`${styles.tabItem} ${activeFilter === 'holding' ? styles.activeTab : ''}`}
            onClick={() => setActiveFilter('holding')}
          >
            <IoBookmarkOutline />
            <span>HOLDING</span>
          </button>
          {/* Only show Burned tab if there are burned items or viewing own profile */}
          {(stats.itemsBurned > 0 || isOwnProfile) && (
            <button
              className={`${styles.tabItem} ${styles.burnedTab} ${activeFilter === 'burned' ? styles.activeTab : ''}`}
              onClick={() => setActiveFilter('burned')}
            >
              <IoFlameOutline />
              <span>BURNED{stats.itemsBurned > 0 ? ` (${stats.itemsBurned})` : ''}</span>
            </button>
          )}
        </div>

        {/* Section Heading with Bulk Selection Toggle */}
        <div className={styles.sectionHeading}>
          <h2>
            {activeFilter === 'burned' ? 'Burned Assets' : 'Collection'} ({filteredNFTs.length})
          </h2>

          {/* Bulk Selection Controls - Only for own profile with listed items */}
          {isOwnProfile && delistableNfts.length > 0 && activeFilter !== 'burned' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {selectionMode ? (
                <>
                  <span style={{ fontSize: '0.875rem', color: '#c8a1ff' }}>
                    {selectedNfts.size} selected
                  </span>
                  <button
                    onClick={selectAllDelistable}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(200, 161, 255, 0.1)',
                      border: '1px solid #c8a1ff40',
                      borderRadius: '6px',
                      color: '#c8a1ff',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Select All Listed ({delistableNfts.length})
                  </button>
                  <button
                    onClick={() => {
                      if (selectedNfts.size > 0) {
                        setShowBulkDelistModal(true);
                      }
                    }}
                    disabled={selectedNfts.size === 0}
                    style={{
                      padding: '6px 12px',
                      background: selectedNfts.size > 0 ? '#f59e0b' : 'rgba(245, 158, 11, 0.3)',
                      border: 'none',
                      borderRadius: '6px',
                      color: selectedNfts.size > 0 ? '#000' : '#666',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: selectedNfts.size > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Bulk Delist ({selectedNfts.size})
                  </button>
                  <button
                    onClick={clearSelection}
                    style={{
                      padding: '6px 12px',
                      background: 'transparent',
                      border: '1px solid #333',
                      borderRadius: '6px',
                      color: '#a1a1a1',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setSelectionMode(true)}
                  style={{
                    padding: '6px 12px',
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '6px',
                    color: '#f59e0b',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <IoCheckboxOutline /> Bulk Delist Mode
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pinned Section - Show at top when there are pinned items */}
        {pinnedNfts.length > 0 && activeFilter !== 'burned' && !selectionMode && (
          <div className={styles.pinnedSection}>
            <div className={styles.pinnedHeader}>
              <IoPin />
              <span>Pinned ({pinnedNfts.length}/3)</span>
            </div>
            <div className={styles.pinnedGrid}>
              {pinnedNfts.map((nft) => (
                <motion.div
                  key={`pinned-${nft.mintAddress}`}
                  className={styles.nftCardWrapper}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ position: 'relative' }}
                >
                  <div className={styles.pinnedBadge}>
                    <IoPin size={10} /> Pinned
                  </div>
                  <NFTCard
                    nft={{
                      nftId: nft.nftId,
                      fileCid: nft.fileCid,
                      title: nft.title,
                      image: nft.image,
                      salePrice: nft.priceSol,
                      seller: profile?.wallet || nft.seller,
                      marketStatus: nft.marketStatus,
                      timestamp: nft.timestamp,
                      attributes: nft.attributes,
                    }}
                    onClick={() => {
                      setSelectedNFT(nft);
                      setShowDetailCard(true);
                    }}
                  />
                  {/* Buy & Offer buttons for visitors on listed pinned NFTs */}
                  {!isOwnProfile && nft.status === 'listed' && (
                    <div className={styles.actionBtns}>
                      <button
                        className={styles.buyBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBuyNow(nft);
                        }}
                        disabled={buyingMint === nft.mintAddress}
                      >
                        <HiOutlineShoppingCart />
                        {buyingMint === nft.mintAddress ? 'Buying...' : 'Buy'}
                      </button>
                      <button
                        className={styles.offerBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMakeOffer(nft);
                        }}
                        disabled={offeringMint === nft.mintAddress}
                      >
                        <HiOutlineTag />
                        {offeringMint === nft.mintAddress ? 'Sending...' : 'Offer'}
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* NFT Grid - Using NFTCard component */}
        <div className={styles.gridSection}>
          {filteredNFTs.length > 0 ? (
            <div className={styles.nftGrid}>
              {filteredNFTs.map((nft, index) => (
                <motion.div
                  key={nft.mintAddress}
                  className={styles.nftCardWrapper}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  style={{
                    position: 'relative',
                    ...(selectionMode &&
                      nft._id &&
                      selectedNfts.has(nft._id) && {
                        outline: '2px solid #c8a1ff',
                        outlineOffset: '2px',
                        borderRadius: '12px',
                      }),
                  }}
                >
                  {/* Selection checkbox overlay */}
                  {selectionMode && isOwnProfile && nft.status === 'listed' && nft._id && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleNftSelection(nft._id!);
                      }}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        zIndex: 10,
                        width: '28px',
                        height: '28px',
                        background: selectedNfts.has(nft._id) ? '#c8a1ff' : 'rgba(0, 0, 0, 0.6)',
                        border: selectedNfts.has(nft._id) ? 'none' : '2px solid #fff',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      {selectedNfts.has(nft._id) ? (
                        <IoCheckboxOutline size={18} color="#000" />
                      ) : (
                        <IoSquareOutline size={18} color="#fff" />
                      )}
                    </div>
                  )}

                  {/* Pin button for owners (not in selection mode, not burned) */}
                  {isOwnProfile && !selectionMode && nft._id && activeFilter !== 'burned' && (
                    <button
                      className={`${styles.pinBtn} ${pinnedIds.includes(nft._id) ? styles.pinned : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(nft._id!);
                      }}
                      disabled={pinningId === nft._id}
                      title={pinnedIds.includes(nft._id) ? 'Unpin from profile' : 'Pin to profile'}
                    >
                      {pinnedIds.includes(nft._id) ? (
                        <IoPin size={16} />
                      ) : (
                        <IoPinOutline size={16} />
                      )}
                    </button>
                  )}

                  <NFTCard
                    nft={{
                      nftId: nft.nftId,
                      fileCid: nft.fileCid,
                      title: nft.title,
                      image: nft.image,
                      salePrice: nft.priceSol,
                      seller: profile?.wallet || nft.seller,
                      marketStatus: nft.marketStatus,
                      timestamp: nft.timestamp,
                      attributes: nft.attributes,
                    }}
                    onClick={() => {
                      if (selectionMode && nft.status === 'listed' && nft._id) {
                        toggleNftSelection(nft._id);
                      } else {
                        setSelectedNFT(nft);
                        setShowDetailCard(true);
                      }
                    }}
                  />

                  {/* Action buttons */}
                  {!selectionMode && (
                    <>
                      {/* List for Sale button for own pending NFTs */}
                      {isOwnProfile && nft.status === 'pending' && nft._id && (
                        <button
                          className={styles.listForSaleBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleListForSale(nft);
                          }}
                          disabled={listingAssetId === nft._id}
                        >
                          {listingAssetId === nft._id ? 'Listing...' : 'List for Sale'}
                        </button>
                      )}

                      {/* Request Delist button for own listed NFTs */}
                      {isOwnProfile && nft.status === 'listed' && nft._id && (
                        <button
                          className={styles.delistBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDelistingNft(nft);
                          }}
                        >
                          Request Delist
                        </button>
                      )}

                      {/* Buy & Offer buttons for visitors on listed NFTs */}
                      {!isOwnProfile && nft.status === 'listed' && (
                        <div className={styles.actionBtns}>
                          <button
                            className={styles.buyBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBuyNow(nft);
                            }}
                            disabled={buyingMint === nft.mintAddress}
                          >
                            <HiOutlineShoppingCart />
                            {buyingMint === nft.mintAddress ? 'Buying...' : 'Buy'}
                          </button>
                          <button
                            className={styles.offerBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMakeOffer(nft);
                            }}
                            disabled={offeringMint === nft.mintAddress}
                          >
                            <HiOutlineTag />
                            {offeringMint === nft.mintAddress ? 'Sending...' : 'Offer'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <IoGridOutline className={styles.emptyIcon} />
              <h3>No items yet</h3>
              <p>
                {activeFilter === 'all'
                  ? 'Start collecting luxury assets'
                  : `No ${activeFilter} items`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* NFT Detail Modal - Using NftDetailCard */}
      <AnimatePresence>
        {selectedNFT && showDetailCard && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setSelectedNFT(null);
              setShowDetailCard(false);
            }}
          >
            <motion.div
              className={styles.detailCardWrapper}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.closeModal}
                onClick={() => {
                  setSelectedNFT(null);
                  setShowDetailCard(false);
                }}
              >
                <IoClose />
              </button>
              <NftDetailCard
                mintAddress={selectedNFT.mintAddress}
                previewData={{
                  title: selectedNFT.title,
                  image: selectedNFT.image,
                  description: selectedNFT.description,
                  priceSol: selectedNFT.priceSol,
                  attributes: selectedNFT.attributes || [],
                }}
                priceSol={selectedNFT.priceSol}
                owner={selectedNFT.currentOwner}
                onClose={() => {
                  setSelectedNFT(null);
                  setShowDetailCard(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delist Request Modal */}
      {delistingNft && (
        <DelistRequestModal
          asset={{
            _id: delistingNft._id || '',
            model: delistingNft.title,
            mintAddress: delistingNft.mintAddress,
            priceUSD: delistingNft.priceUSD,
            image: delistingNft.image,
          }}
          onClose={() => setDelistingNft(null)}
          onSuccess={() => {
            // Refresh NFTs after successful delist request
            setDelistingNft(null);
          }}
        />
      )}

      {/* Bulk Delist Request Modal */}
      {showBulkDelistModal && (
        <BulkDelistModal
          assets={getSelectedNftObjects().map((nft) => ({
            _id: nft._id!,
            model: nft.title,
            mintAddress: nft.mintAddress,
            priceUSD: nft.priceUSD,
            image: nft.image,
          }))}
          onClose={() => {
            setShowBulkDelistModal(false);
          }}
          onSuccess={() => {
            // Clear selection and exit selection mode after successful submission
            clearSelection();
          }}
        />
      )}
    </div>
  );
};

export default VendorProfilePage;
