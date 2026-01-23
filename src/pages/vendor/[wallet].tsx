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
import { IoClose, IoGridOutline, IoBookmarkOutline } from 'react-icons/io5';

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
const FUNDS_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS_PER_SOL = 1_000_000_000;

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
  attributes?: { trait_type: string; value: string }[];
}

interface ProfileStats {
  totalItems: number;
  itemsListed: number;
  totalSales: number;
}

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
  const [activeFilter, setActiveFilter] = useState<'all' | 'available' | 'holding'>('all');
  const [stats, setStats] = useState<ProfileStats>({
    totalItems: 0,
    itemsListed: 0,
    totalSales: 0,
  });
  const [showDetailCard, setShowDetailCard] = useState(false);

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
      } catch (err) {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [query.wallet]);

  useEffect(() => {
    if (!profile?.wallet) return;

    const fetchNFTs = async () => {
      const res = await fetch('/api/pinata/nfts');
      const pins = await res.json();

      const grouped: Record<string, { json: any; cid: string; date: string }[]> = {};

      for (const pin of pins) {
        try {
          const url = `${GATEWAY}${pin.ipfs_pin_hash}`;
          const head = await fetch(url, { method: 'HEAD' });
          if (!head.headers.get('Content-Type')?.includes('application/json')) continue;

          const json = await (await fetch(url)).json();
          const mint = json.mintAddress;
          const isOwner =
            json.currentOwner === profile.wallet ||
            json.attributes?.find((a: any) => a.trait_type === 'Current Owner')?.value ===
              profile.wallet;
          const isSeller = json.seller === profile.wallet;
          if (!mint || (!isOwner && !isSeller)) continue;

          grouped[mint] = grouped[mint] || [];
          grouped[mint].push({ json, cid: pin.ipfs_pin_hash, date: pin.date_pinned });
        } catch {
          // Skip invalid JSON entries
        }
      }

      const result: NFT[] = Object.entries(grouped).map(([mint, versions]) => {
        const latest = versions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )[0].json;
        return {
          mintAddress: mint,
          title: latest.name || 'Untitled',
          description: latest.description || '',
          image: latest.image || '/fallback-nft.png',
          priceSol: parseFloat(
            latest.priceSol ||
              latest.attributes?.find((a: any) => a.trait_type === 'Price')?.value ||
              '0'
          ),
          metadataUri: `${GATEWAY}${versions[0].cid}`,
          currentOwner:
            latest.currentOwner ||
            latest.attributes?.find((a: any) => a.trait_type === 'Current Owner')?.value ||
            profile.wallet,
          marketStatus:
            latest.marketStatus ||
            latest.attributes?.find((a: any) => a.trait_type === 'Market Status')?.value ||
            'inactive',
          nftId: mint,
          fileCid: latest.image?.split('/').pop() || '',
          timestamp: Date.now(),
          seller: latest.seller || profile.wallet,
          attributes: latest.attributes || [],
        };
      });

      setNftData(result);

      // Calculate stats
      const listed = result.filter((n) => n.marketStatus === 'active').length;
      setStats({
        totalItems: result.length,
        itemsListed: listed,
        totalSales: profile.totalSales || 0,
      });
    };

    fetchNFTs();
  }, [profile]);

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

  const filteredNFTs = nftData.filter((nft) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'available') return nft.marketStatus === 'active';
    if (activeFilter === 'holding') return nft.marketStatus !== 'active';
    return true;
  });

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

            {/* Stats Row - X/Twitter Style */}
            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.totalItems}</span>
                <span className={styles.statLabel}>Items</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.itemsListed}</span>
                <span className={styles.statLabel}>Listed</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{stats.totalSales}</span>
                <span className={styles.statLabel}>Sales</span>
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
        </div>

        {/* Section Heading */}
        <div className={styles.sectionHeading}>
          <h2>Collection ({filteredNFTs.length})</h2>
        </div>

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
                >
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
    </div>
  );
};

export default VendorProfilePage;
