// src/pages/vendor/pools.tsx
// Vendor pool hub — eligible listings, pool creation, active pool management
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import {
  FiArrowLeft,
  FiLoader,
  FiDroplet,
  FiGrid,
  FiPlus,
  FiExternalLink,
  FiBarChart2,
  FiUsers,
  FiTrendingUp,
  FiBookOpen,
} from 'react-icons/fi';
import { resolveImageUrl } from '../../utils/imageUtils';
import dynamic from 'next/dynamic';
import styles from '../../styles/VendorPools.module.css';

const PoolManagement = dynamic(
  () => import('../../components/pool/PoolManagement').then((m) => ({ default: m.PoolManagement })),
  { ssr: false }
);

const PoolCreationStepper = dynamic(
  () => import('../../components/pool/PoolCreationStepper'),
  { ssr: false }
);

interface EligibleListing {
  _id: string;
  title: string;
  brand: string;
  model: string;
  priceUSD: number;
  imageUrl?: string;
  mintAddress?: string;
}

export default function VendorPoolsPage() {
  const router = useRouter();
  const { publicKey, connected } = useEffectiveWallet();
  const [pools, setPools] = useState<any[]>([]);
  const [eligible, setEligible] = useState<EligibleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'eligible' | 'active'>('eligible');
  const [creatingPoolFor, setCreatingPoolFor] = useState<EligibleListing | null>(null);

  useEffect(() => {
    if (router.query.action === 'create') setTab('eligible');
  }, [router.query]);

  const fetchData = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    const wallet = publicKey.toBase58();

    try {
      const [poolsRes, listingsRes] = await Promise.all([
        fetch(`/api/pool/list?vendorWallet=${wallet}&includeIncomplete=true`),
        fetch(`/api/vendor/mint-request?wallet=${wallet}&status=minted`),
      ]);

      if (poolsRes.ok) {
        const data = await poolsRes.json();
        setPools(data.pools || []);
      }

      if (listingsRes.ok) {
        const data = await listingsRes.json();
        const listings = Array.isArray(data) ? data : data.requests || [];
        const eligibleItems = listings.filter(
          (l: any) => l.status === 'minted' && !l.pooled && l.mintAddress
        );
        setEligible(eligibleItems);

        if (router.query.assetId) {
          const target = eligibleItems.find((l: any) => l._id === router.query.assetId);
          if (target) setCreatingPoolFor(target);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [publicKey, router.query.assetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Pool stats
  const totalVolume = pools.reduce((sum, p) => sum + (p.totalVolumeUSD || 0), 0);
  const totalHolders = pools.reduce((sum, p) => sum + (p.participants?.length || 0), 0);
  const activePools = pools.filter((p) => !['closed', 'canceled', 'dead', 'burned'].includes(p.status));

  if (!connected) {
    return (
      <div className={styles.page}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Connect your wallet to manage pools</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Pools | LuxHub Vendor</title>
      </Head>
      <div className={styles.page}>
        <div className={styles.ambientBg} />

        {/* Header */}
        <div className={styles.header}>
          <Link href="/vendor/vendorDashboard" className={styles.backLink}>
            <FiArrowLeft /> Back to Dashboard
          </Link>
          <div className={styles.titleRow}>
            <FiDroplet className={styles.titleIcon} />
            <h1 className={styles.title}>Pool Management</h1>
          </div>
          <p className={styles.subtitle}>
            Tokenize your watches into tradeable pools on Solana
          </p>
        </div>

        {/* Stats Row */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{eligible.length}</span>
            <span className={styles.statLabel}>Eligible Listings</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{activePools.length}</span>
            <span className={styles.statLabel}>Active Pools</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{totalHolders}</span>
            <span className={styles.statLabel}>Total Holders</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>
              ${totalVolume > 1000 ? `${(totalVolume / 1000).toFixed(1)}K` : totalVolume.toFixed(0)}
            </span>
            <span className={styles.statLabel}>Total Volume</span>
          </div>
        </div>

        {/* Quick Links */}
        <div className={styles.quickLinks}>
          <Link href="/pools" className={styles.quickLink}>
            <FiBarChart2 /> Public Pools Page
          </Link>
          <Link href="/learnMore#pools" className={styles.quickLink}>
            <FiBookOpen /> How Pools Work
          </Link>
          <a
            href="https://bags.fm"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.quickLink}
          >
            <FiExternalLink /> Bags Dashboard
          </a>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'eligible' ? styles.tabActive : ''}`}
            onClick={() => setTab('eligible')}
          >
            <FiGrid /> Eligible Listings ({eligible.length})
          </button>
          <button
            className={`${styles.tab} ${tab === 'active' ? styles.tabActive : ''}`}
            onClick={() => setTab('active')}
          >
            <FiDroplet /> Active Pools ({pools.length})
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>
            <FiLoader className={styles.spinner} />
            Loading...
          </div>
        ) : tab === 'eligible' ? (
          /* Eligible Listings Tab */
          eligible.length === 0 ? (
            <div className={styles.emptyState}>
              <FiDroplet className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>No eligible listings</p>
              <p className={styles.emptyText}>
                Mint some watches first, then you can tokenize them into pools.
              </p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {eligible.map((item) => (
                <div key={item._id} className={styles.listingCard}>
                  <div className={styles.listingImage}>
                    {item.imageUrl ? (
                      <img
                        src={resolveImageUrl(item.imageUrl)}
                        alt={item.title}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <FiDroplet className={styles.listingImagePlaceholder} />
                    )}
                    <span className={styles.listingPriceBadge}>
                      ${item.priceUSD?.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.listingInfo}>
                    <div className={styles.listingTitle}>
                      {item.title || `${item.brand} ${item.model}`}
                    </div>
                    <div className={styles.listingMeta}>
                      <span className={styles.listingBrand}>{item.brand}</span>
                      {item.mintAddress && (
                        <span className={styles.listingMint}>
                          {item.mintAddress.slice(0, 6)}...
                        </span>
                      )}
                    </div>
                    <button
                      className={styles.createPoolBtn}
                      onClick={() => setCreatingPoolFor(item)}
                    >
                      <FiPlus /> Create Pool
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Active Pools Tab */
          <PoolManagement pools={pools} isAdmin={false} onRefresh={fetchData} />
        )}
      </div>

      {/* Pool Creation Stepper Modal */}
      {creatingPoolFor && (
        <div className={styles.modalOverlay} onClick={() => setCreatingPoolFor(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <PoolCreationStepper
              assetId={creatingPoolFor._id}
              assetData={{
                _id: creatingPoolFor._id,
                brand: creatingPoolFor.brand,
                model: creatingPoolFor.model,
                priceUSD: creatingPoolFor.priceUSD,
                imageUrl: creatingPoolFor.imageUrl,
              }}
              vendorWallet={publicKey?.toBase58() || ''}
              onComplete={() => {
                setCreatingPoolFor(null);
                fetchData();
                setTab('active');
              }}
              onCancel={() => setCreatingPoolFor(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
