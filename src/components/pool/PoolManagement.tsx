// src/components/pool/PoolManagement.tsx
// Pools management dashboard for vendors and admins (D-17, INFRA-04)
// Shows pools with status, volume, holders, and context-dependent actions
// Resale chain: set price -> escrow created -> buyer purchase -> vendor ship -> buyer confirm -> distribute -> claim
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import {
  FiEye,
  FiDollarSign,
  FiSend,
  FiCheck,
  FiInfo,
  FiLoader,
  FiAlertTriangle,
  FiPlus,
} from 'react-icons/fi';
import { FaWater } from 'react-icons/fa';
import toast from 'react-hot-toast';
import styles from '../../styles/PoolManagement.module.css';

interface Pool {
  _id: string;
  poolNumber?: string;
  asset?: {
    _id?: string;
    brand?: string;
    model?: string;
    priceUSD?: number;
    imageUrl?: string;
    imageIpfsUrls?: string[];
    images?: string[];
  } | null;
  vendor?: { businessName?: string } | null;
  vendorWallet?: string;
  status?: string;
  custodyStatus?: string;
  totalVolumeUSD?: number;
  lastPriceUSD?: number;
  currentBondingPrice?: number;
  participants?: { wallet: string }[];
  bagsTokenMint?: string;
  tokenStatus?: string;
  graduated?: boolean;
  resaleListingPriceUSD?: number;
  resaleEscrowId?: string;
  createdAt?: string;
  [key: string]: any;
}

interface PoolManagementProps {
  pools: Pool[];
  isAdmin?: boolean;
  onRefresh?: () => void;
  onCreatePool?: () => void;
}

// Lifecycle stage mapper -- mirrors the getLifecycleStage from LifecycleStepper
// (that component is in a parallel worktree; this is a self-contained version)
function getLifecycleStage(pool: Pool): string {
  const s = pool.status?.toLowerCase() || '';
  if (s === 'closed' || s === 'distributed') return 'distributed';
  if (s === 'distributing') return 'distributing';
  if (pool.resaleListingPriceUSD && pool.resaleListingPriceUSD > 0) return 'resale';
  if (pool.graduated || s === 'graduated') return 'graduated';
  if (s === 'trading' || (pool.bagsTokenMint && pool.tokenStatus === 'minted')) return 'trading';
  if (s === 'open' || s === 'funding') return 'funding';
  return 'launch';
}

function getBadgeClass(stage: string): string {
  switch (stage) {
    case 'launch': return styles.badgeLaunch;
    case 'funding': return styles.badgeFunding;
    case 'graduated': return styles.badgeGraduated;
    case 'trading': return styles.badgeTrading;
    case 'resale': return styles.badgeResale;
    case 'distributed':
    case 'distributing': return styles.badgeDistributed;
    default: return styles.badgeLaunch;
  }
}

function getBadgeLabel(stage: string): string {
  switch (stage) {
    case 'launch': return 'New';
    case 'funding': return 'Funding';
    case 'graduated': return 'Graduated';
    case 'trading': return 'Trading';
    case 'resale': return 'Resale';
    case 'distributing': return 'Distributing';
    case 'distributed': return 'Closed';
    default: return stage;
  }
}

function getAssetImage(pool: Pool): string {
  const a = pool.asset;
  if (!a) return '';
  return a.imageUrl || a.imageIpfsUrls?.[0] || a.images?.[0] || '';
}

function formatUSD(val: number | undefined): string {
  if (val === undefined || val === null) return '$0';
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function PoolManagement({ pools, isAdmin, onRefresh, onCreatePool }: PoolManagementProps) {
  const router = useRouter();
  const { publicKey } = useEffectiveWallet();
  const [resaleModal, setResaleModal] = useState<{ poolId: string; name: string } | null>(null);
  const [resalePrice, setResalePrice] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Summary stats
  const stats = useMemo(() => {
    const total = pools.length;
    const active = pools.filter((p) => {
      const stage = getLifecycleStage(p);
      return stage !== 'distributed';
    }).length;
    const volume = pools.reduce((sum, p) => sum + (p.totalVolumeUSD || 0), 0);
    const holders = pools.reduce(
      (sum, p) => sum + (p.participants?.length || 0),
      0
    );
    return { total, active, volume, holders };
  }, [pools]);

  const walletAddress = publicKey?.toBase58() || '';

  // Action handlers
  const handleSetResalePrice = async () => {
    if (!resaleModal || !resalePrice || !walletAddress) return;
    setActionLoading(resaleModal.poolId);
    try {
      const res = await fetch('/api/pool/list-for-resale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId: resaleModal.poolId,
          adminWallet: walletAddress,
          resaleListingPriceUSD: parseFloat(resalePrice),
          resaleListingPrice: Math.round(parseFloat(resalePrice) * 1e9), // lamports approx
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to set resale price');
      }
      toast.success('Resale price set. Escrow created for buyer delivery.');
      setResaleModal(null);
      setResalePrice('');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set resale price');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDistribute = async (poolId: string, action: 'propose' | 'finalize') => {
    if (!walletAddress) return;
    setActionLoading(poolId);
    try {
      const res = await fetch('/api/pool/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolId,
          adminWallet: walletAddress,
          action,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to ${action} distribution`);
      }
      toast.success(action === 'propose' ? 'Distribution proposed.' : 'Distribution finalized.');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Context-dependent action for each pool
  const renderAction = (pool: Pool) => {
    const stage = getLifecycleStage(pool);
    const isLoading = actionLoading === pool._id;

    // Resale flow (INFRA-04): check escrow states
    if (stage === 'resale' && isAdmin) {
      // If resale escrow exists and is funded (buyer paid), next step depends on escrow status
      if (pool.resaleEscrowId) {
        // Check if escrow is shipped/delivered based on pool status
        const s = pool.status?.toLowerCase();
        if (s === 'resale_delivered' || s === 'delivered') {
          return (
            <button
              className={styles.actionBtnPrimary}
              onClick={() => handleDistribute(pool._id, 'propose')}
              disabled={isLoading}
            >
              {isLoading ? <FiLoader className={styles.spinner} /> : <FiSend />}
              Distribute
            </button>
          );
        }
        return (
          <span className={`${styles.badge} ${styles.badgeAwaitingBuyer}`}>
            Awaiting Buyer
          </span>
        );
      }
    }

    if (stage === 'distributing' && isAdmin) {
      return (
        <button
          className={styles.actionBtnPrimary}
          onClick={() => handleDistribute(pool._id, 'finalize')}
          disabled={isLoading}
        >
          {isLoading ? <FiLoader className={styles.spinner} /> : <FiCheck />}
          Finalize
        </button>
      );
    }

    // Admin can set resale price for graduated/sold pools
    if ((stage === 'graduated' || stage === 'trading') && isAdmin && pool.custodyStatus === 'in_custody') {
      return (
        <button
          className={styles.actionBtnPrimary}
          onClick={() =>
            setResaleModal({
              poolId: pool._id,
              name: `${pool.asset?.brand || ''} ${pool.asset?.model || ''}`.trim(),
            })
          }
          title="Setting a resale price creates an escrow for the physical delivery."
        >
          <FiDollarSign /> Set Resale Price
          <FiInfo className={styles.tooltipIcon} />
        </button>
      );
    }

    // Default: View
    return (
      <button
        className={styles.actionBtn}
        onClick={() => router.push(`/pools/${pool._id}`)}
      >
        <FiEye /> View
      </button>
    );
  };

  // Render pool row (desktop)
  const renderRow = (pool: Pool) => {
    const stage = getLifecycleStage(pool);
    return (
      <div
        key={pool._id}
        className={styles.tableRow}
        onClick={() => router.push(`/pools/${pool._id}`)}
      >
        <div>
          {getAssetImage(pool) ? (
            <img src={getAssetImage(pool)} alt="" className={styles.thumbnail} />
          ) : (
            <div
              className={styles.thumbnail}
              style={{ background: '#181818', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <FaWater style={{ color: '#333', fontSize: '18px' }} />
            </div>
          )}
        </div>
        <div>
          <div className={styles.poolName}>
            {pool.asset?.brand} {pool.asset?.model}
          </div>
          <div className={styles.poolNumber}>{pool.poolNumber || pool._id.slice(-6)}</div>
        </div>
        <div>
          <span className={`${styles.badge} ${getBadgeClass(stage)}`}>
            {getBadgeLabel(stage)}
          </span>
        </div>
        <div className={styles.mono}>{formatUSD(pool.totalVolumeUSD)}</div>
        <div className={styles.mono}>{pool.participants?.length || 0}</div>
        <div className={styles.mono}>
          {formatUSD(pool.lastPriceUSD || pool.currentBondingPrice)}
        </div>
        <div onClick={(e) => e.stopPropagation()}>{renderAction(pool)}</div>
      </div>
    );
  };

  // Render pool card (mobile)
  const renderCard = (pool: Pool) => {
    const stage = getLifecycleStage(pool);
    return (
      <div key={pool._id} className={styles.card}>
        <div className={styles.cardHeader}>
          {getAssetImage(pool) ? (
            <img src={getAssetImage(pool)} alt="" className={styles.thumbnail} />
          ) : (
            <div
              className={styles.thumbnail}
              style={{ background: '#181818', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
            >
              <FaWater style={{ color: '#333' }} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div className={styles.poolName}>
              {pool.asset?.brand} {pool.asset?.model}
            </div>
            <div className={styles.poolNumber}>{pool.poolNumber || pool._id.slice(-6)}</div>
          </div>
          <span className={`${styles.badge} ${getBadgeClass(stage)}`}>
            {getBadgeLabel(stage)}
          </span>
        </div>
        <div className={styles.cardStats}>
          <div>
            <div className={styles.cardStatLabel}>Volume</div>
            <div className={styles.cardStatValue}>{formatUSD(pool.totalVolumeUSD)}</div>
          </div>
          <div>
            <div className={styles.cardStatLabel}>Holders</div>
            <div className={styles.cardStatValue}>{pool.participants?.length || 0}</div>
          </div>
          <div>
            <div className={styles.cardStatLabel}>Price</div>
            <div className={styles.cardStatValue}>
              {formatUSD(pool.lastPriceUSD || pool.currentBondingPrice)}
            </div>
          </div>
        </div>
        <div className={styles.cardActions}>{renderAction(pool)}</div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* Summary Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.total}</div>
          <div className={styles.statLabel}>Total Pools</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.active}</div>
          <div className={styles.statLabel}>Active Pools</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{formatUSD(stats.volume)}</div>
          <div className={styles.statLabel}>Total Volume</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{stats.holders}</div>
          <div className={styles.statLabel}>Total Holders</div>
        </div>
      </div>

      {/* Header */}
      <div className={styles.headerRow}>
        <div className={styles.headerTitle}>
          {isAdmin ? 'All Pools' : 'My Pools'}
        </div>
        {onCreatePool && (
          <button className={styles.createBtn} onClick={onCreatePool}>
            <FiPlus /> {isAdmin ? 'Create Pool for Vendor' : 'Create Pool'}
          </button>
        )}
      </div>

      {/* Table (desktop) */}
      {pools.length > 0 ? (
        <>
          <div className={styles.tableHeader}>
            <div></div>
            <div>Pool</div>
            <div>Status</div>
            <div>Volume</div>
            <div>Holders</div>
            <div>Price</div>
            <div>Action</div>
          </div>
          {pools.map(renderRow)}

          {/* Card list (mobile) */}
          <div className={styles.cardList}>{pools.map(renderCard)}</div>
        </>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <FaWater />
          </div>
          <div className={styles.emptyText}>No pools found</div>
        </div>
      )}

      {/* Resale Price Modal */}
      {resaleModal && (
        <div className={styles.stepperOverlay} onClick={() => setResaleModal(null)}>
          <div className={styles.stepperModal} onClick={(e) => e.stopPropagation()}>
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                Set Resale Price
              </h3>
              <p style={{ color: '#a1a1a1', fontSize: '13px' }}>{resaleModal.name}</p>
            </div>

            <div className={styles.resaleModal}>
              <div>
                <label className={styles.formLabel}>Resale Price (USD)</label>
                <input
                  className={styles.resaleInput}
                  type="number"
                  value={resalePrice}
                  onChange={(e) => setResalePrice(e.target.value)}
                  placeholder="e.g. 18000"
                  min={0}
                  autoFocus
                />
              </div>

              <div className={styles.resaleHint}>
                <FiInfo />
                Setting a resale price creates an escrow for the physical delivery.
                The buyer purchases via escrow, vendor ships, buyer confirms delivery,
                then proceeds are distributed to token holders.
              </div>

              <div className={styles.btnRow}>
                <button className={styles.btnSecondary} onClick={() => setResaleModal(null)}>
                  Cancel
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSetResalePrice}
                  disabled={!resalePrice || parseFloat(resalePrice) <= 0 || actionLoading === resaleModal.poolId}
                >
                  {actionLoading === resaleModal.poolId ? (
                    <FiLoader className={styles.spinner} />
                  ) : null}
                  Set Resale Price
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PoolManagement;
