// src/pages/user/[wallet].tsx
// Public user profile page — mirrors vendor/[wallet].tsx layout
import { useRouter } from 'next/router';
import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Head from 'next/head';
import styles from '../../styles/VendorProfilePage.module.css';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import NFTCard from '../../components/marketplace/NFTCard';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { SiSolana } from 'react-icons/si';
import { getClusterConfig } from '@/lib/solana/clusterConfig';
import {
  FaCopy,
  FaArrowUpRightFromSquare,
  FaCalendarDays,
  FaRegCircleCheck,
} from 'react-icons/fa6';
import { IoGridOutline, IoBookmarkOutline } from 'react-icons/io5';
import { FiPieChart } from 'react-icons/fi';

// Generate a deterministic gradient from wallet address
const GRADIENT_PALETTES = [
  ['#c8a1ff', '#7c3aed'], // Purple (default LuxHub)
  ['#60a5fa', '#3b82f6'], // Blue
  ['#34d399', '#059669'], // Emerald
  ['#f472b6', '#db2777'], // Pink
  ['#fb923c', '#ea580c'], // Orange
  ['#a78bfa', '#6d28d9'], // Violet
  ['#2dd4bf', '#0d9488'], // Teal
  ['#fbbf24', '#d97706'], // Amber
  ['#f87171', '#dc2626'], // Red
  ['#818cf8', '#4f46e5'], // Indigo
];

function getWalletGradient(wallet: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < wallet.length; i++) {
    hash = wallet.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENT_PALETTES.length;
  return GRADIENT_PALETTES[index] as [string, string];
}
import toast from 'react-hot-toast';

interface ProfileData {
  profile: {
    wallet: string;
    name: string | null;
    username: string | null;
    bio: string | null;
    avatar: string | null;
    banner: string | null;
    role: string;
    joinedAt: string | null;
    isVendor: boolean;
    isVerified: boolean;
  };
  nfts: {
    _id?: string;
    title: string;
    image: string;
    priceSol: number;
    priceUSD?: number;
    mintAddress: string;
    nftId: string;
    fileCid?: string;
    timestamp: number;
    seller: string;
    marketStatus: string;
    status?: string;
    attributes?: { trait_type: string; value: string }[];
  }[];
  pools: {
    poolId: string;
    status: string;
    asset: { model: string; brand: string; image: string } | null;
    shares: number;
    ownershipPercent: number;
    investedUSD: number;
  }[];
  stats: {
    totalNFTs: number;
    totalNFTValueSOL: number;
    totalPoolInvested: number;
    activePools: number;
    totalPools: number;
  };
}

const UserProfilePage = () => {
  const router = useRouter();
  const { wallet: routeWallet } = router.query;
  const { publicKey: connectedPublicKey } = useEffectiveWallet();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'nfts' | 'pools'>('nfts');

  const walletStr = typeof routeWallet === 'string' ? routeWallet : '';
  const isOwnProfile = connectedPublicKey?.toBase58() === walletStr;
  const [gradientA, gradientB] = useMemo(() => getWalletGradient(walletStr), [walletStr]);

  useEffect(() => {
    if (!walletStr) return;
    setLoading(true);
    setError(null);
    fetch(`/api/users/profile/${walletStr}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setData(d);
          // If they're a vendor, redirect to vendor profile
          if (d.profile?.isVendor) {
            router.replace(`/vendor/${walletStr}`);
            return;
          }
        } else {
          // No user found — show empty profile for the wallet
          setData({
            profile: {
              wallet: walletStr,
              name: null,
              username: null,
              bio: null,
              avatar: null,
              banner: null,
              role: 'user',
              joinedAt: null,
              isVendor: false,
              isVerified: false,
            },
            nfts: [],
            pools: [],
            stats: {
              totalNFTs: 0,
              totalNFTValueSOL: 0,
              totalPoolInvested: 0,
              activePools: 0,
              totalPools: 0,
            },
          });
        }
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [walletStr]);

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(walletStr);
    setCopied(true);
    toast.success('Address copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (timestamp?: string | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const profile = data?.profile;
  const displayName = profile?.name || `${walletStr.slice(0, 4)}...${walletStr.slice(-4)}`;

  // Loading
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

  // Error
  if (error || !data) {
    return (
      <div className={styles.pageContainer}>
        <motion.div
          className={styles.errorContainer}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2>Profile Not Found</h2>
          <p>Could not load profile for this wallet.</p>
          <button onClick={() => router.push('/')} className={styles.backButton}>
            Go Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{displayName} — LuxHub</title>
      </Head>
      <div className={styles.pageContainer}>
        {/* Banner Section - X/Twitter Style */}
        <div className={styles.bannerSection}>
          {profile?.banner ? (
            <img
              src={resolveImageUrl(profile.banner)}
              alt="Profile banner"
              className={styles.bannerImage}
            />
          ) : (
            <div className={styles.bannerPlaceholder}>
              <div
                className={styles.bannerGradient}
                style={{
                  background: `linear-gradient(135deg, #1a1a2e 0%, ${gradientA}18 40%, ${gradientB}10 60%, #16161a 100%)`,
                }}
              />
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
                {profile?.avatar ? (
                  <img
                    src={resolveImageUrl(profile.avatar)}
                    alt={displayName}
                    className={styles.avatar}
                  />
                ) : (
                  <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.avatar} />
                )}
              </motion.div>

              {/* Action Buttons */}
              <div className={styles.headerActions}>
                {isOwnProfile && (
                  <button
                    className={styles.editProfileBtn}
                    onClick={() => router.push('/profile/edit')}
                  >
                    Edit profile
                  </button>
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className={styles.profileInfo}>
              <div className={styles.nameRow}>
                <h1 className={styles.profileName}>{displayName}</h1>
                {profile?.isVerified && (
                  <span className={styles.vendorBadge}>
                    <FaRegCircleCheck />
                    Verified
                  </span>
                )}
              </div>

              <p className={styles.username}>@{profile?.username || walletStr.slice(0, 8)}</p>

              <p className={styles.bio}>{profile?.bio || 'LuxHub collector'}</p>

              {/* Meta Info Row */}
              <div className={styles.metaRow}>
                {profile?.joinedAt && (
                  <span className={styles.metaItem}>
                    <FaCalendarDays />
                    Joined {formatDate(profile.joinedAt)}
                  </span>
                )}
              </div>

              {/* Social / Wallet Row */}
              <div className={styles.socialRow}>
                <button onClick={handleCopyAddress} className={styles.walletBtn}>
                  <span>
                    {walletStr.slice(0, 4)}...{walletStr.slice(-4)}
                  </span>
                  <FaCopy />
                  {copied && <span className={styles.copiedTooltip}>Copied!</span>}
                </button>
                <a
                  href={getClusterConfig().explorerUrl(walletStr)}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.explorerBtn}
                >
                  <FaArrowUpRightFromSquare />
                </a>
              </div>

              {/* Stats Row */}
              <div className={styles.statsRow}>
                <div className={styles.statBadge}>
                  <span className={styles.statValue}>{data.stats.totalNFTs}</span>
                  <span className={styles.statLabel}>NFTs</span>
                </div>
                <div className={styles.statBadge}>
                  <span className={styles.statValue}>{data.stats.totalNFTValueSOL.toFixed(1)}</span>
                  <span className={styles.statLabel}>SOL Value</span>
                </div>
                <div className={styles.statBadge}>
                  <span className={styles.statValue}>{data.stats.activePools}</span>
                  <span className={styles.statLabel}>Pools</span>
                </div>
                <div className={styles.statBadge}>
                  <span className={styles.statValue}>
                    ${data.stats.totalPoolInvested.toFixed(0)}
                  </span>
                  <span className={styles.statLabel}>Contributed</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Tab Navigation - Instagram Style */}
          <div className={styles.tabNav}>
            <button
              className={`${styles.tabItem} ${activeTab === 'nfts' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('nfts')}
            >
              <IoGridOutline />
              <span>HOLDINGS ({data.nfts.length})</span>
            </button>
            <button
              className={`${styles.tabItem} ${activeTab === 'pools' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('pools')}
            >
              <FiPieChart />
              <span>POOLS ({data.pools.length})</span>
            </button>
          </div>

          {/* Section Heading */}
          <div className={styles.sectionHeading}>
            <h2>
              {activeTab === 'nfts'
                ? `Collection (${data.nfts.length})`
                : `Pool Positions (${data.pools.length})`}
            </h2>
          </div>

          {/* NFT Grid */}
          {activeTab === 'nfts' && (
            <div className={styles.nftGrid}>
              {data.nfts.length === 0 && (
                <div className={styles.emptyState}>
                  <IoBookmarkOutline className={styles.emptyIcon} />
                  <h3>No NFTs held yet</h3>
                  <p>This wallet doesn&apos;t hold any LuxHub NFTs</p>
                </div>
              )}
              {data.nfts.map((nft, index) => (
                <motion.div
                  key={nft.mintAddress || nft.nftId}
                  className={styles.nftCardWrapper}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <NFTCard
                    nft={{
                      nftId: nft.nftId || nft.mintAddress,
                      fileCid: nft.fileCid,
                      image: nft.image,
                      title: nft.title,
                      salePrice: nft.priceSol,
                      timestamp: nft.timestamp || Date.now(),
                      seller: nft.seller || walletStr,
                      marketStatus: nft.marketStatus || 'Holding',
                      attributes: nft.attributes,
                    }}
                    onClick={() => {}}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Pool Positions */}
          {activeTab === 'pools' && (
            <div className={styles.nftGrid}>
              {data.pools.length === 0 && (
                <div className={styles.emptyState}>
                  <FiPieChart className={styles.emptyIcon} />
                  <h3>No pool contributions yet</h3>
                  <p>This wallet hasn&apos;t contributed to any pools</p>
                </div>
              )}
              {data.pools.map((pool, index) => (
                <motion.div
                  key={pool.poolId}
                  className={styles.nftCardWrapper}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => router.push('/pools')}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.poolCard}>
                    <div className={styles.poolCardImage}>
                      {pool.asset?.image ? (
                        <img
                          src={resolveImageUrl(pool.asset.image) || PLACEHOLDER_IMAGE}
                          alt={pool.asset?.model || 'Pool Asset'}
                        />
                      ) : (
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            background: '#111',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <FiPieChart style={{ fontSize: '2rem', color: '#333' }} />
                        </div>
                      )}
                      <span
                        className={`${styles.poolStatus} ${
                          pool.status === 'active'
                            ? styles.poolStatusOpen
                            : pool.status === 'filled'
                              ? styles.poolStatusFilled
                              : styles.poolStatusClosed
                        }`}
                      >
                        {pool.status}
                      </span>
                    </div>
                    <div className={styles.poolCardInfo}>
                      <h4>
                        {pool.asset?.brand}{' '}
                        {pool.asset?.model || `Pool #${pool.poolId.toString().slice(-6)}`}
                      </h4>
                      <div className={styles.poolProgress}>
                        <div
                          className={styles.poolProgressBar}
                          style={{ width: `${Math.min(pool.ownershipPercent, 100)}%` }}
                        />
                      </div>
                      <div className={styles.poolShareInfo}>
                        <span>
                          {pool.shares} shares · {pool.ownershipPercent?.toFixed(1)}%
                        </span>
                        <span>${pool.investedUSD?.toFixed(0)}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default UserProfilePage;
