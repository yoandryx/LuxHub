// src/components/admins/VaultInventoryTab.tsx
// Vault Inventory Tab - Display NFTs held in the LuxHub vault

import React, { useState, useEffect, useCallback } from 'react';
import { HiOutlineRefresh, HiOutlineExternalLink, HiOutlineEye } from 'react-icons/hi';
import { LuSparkles, LuShield, LuBadgeCheck } from 'react-icons/lu';
import styles from '../../styles/VaultInventoryTab.module.css';

interface VaultNFT {
  _id: string;
  nftMint: string;
  name: string;
  description: string;
  imageUrl: string;
  metadataUri: string;
  mintedBy: string;
  mintedAt: string;
  status: string;
  tags: string[];
  isVerifiedCreator: boolean;
  listing?: {
    priceSol: number;
    priceUsd: number;
    listedAt: string;
  };
  offers: Array<{
    buyer: string;
    priceSol: number;
    status: string;
  }>;
  history: Array<{
    action: string;
    performedBy: string;
    performedAt: string;
    details?: Record<string, unknown>;
  }>;
}

interface VaultStats {
  total: number;
  byStatus: Record<string, number>;
  vaultAddress?: string;
  multisigAddress?: string;
}

interface VaultInventoryTabProps {
  onSelectNFT?: (nft: VaultNFT) => void;
}

const PLACEHOLDER_IMAGE = '/images/purpleLGG.png';

// Status badge configuration
const statusConfig: Record<string, { label: string; className: string }> = {
  minted: { label: 'Minted', className: styles.statusMinted },
  pending_review: { label: 'Pending Review', className: styles.statusPending },
  ready_to_list: { label: 'Ready', className: styles.statusReady },
  listed: { label: 'Listed', className: styles.statusListed },
  transferred: { label: 'Transferred', className: styles.statusTransferred },
  pooled: { label: 'Pooled', className: styles.statusPooled },
  reserved: { label: 'Reserved', className: styles.statusReserved },
};

export const VaultInventoryTab: React.FC<VaultInventoryTabProps> = ({ onSelectNFT }) => {
  const [items, setItems] = useState<VaultNFT[]>([]);
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedNFT, setSelectedNFT] = useState<VaultNFT | null>(null);

  const fetchVaultInventory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/vault/assets?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch vault inventory');
      }

      setItems(data.data.items || []);
      setStats(data.data.stats || null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('[VaultInventoryTab] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchVaultInventory();
  }, [fetchVaultInventory]);

  const handleViewNFT = (nft: VaultNFT) => {
    setSelectedNFT(nft);
    if (onSelectNFT) {
      onSelectNFT(nft);
    }
  };

  const truncateAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr || 'N/A';
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const openSolscan = (mint: string) => {
    window.open(`https://solscan.io/token/${mint}?cluster=devnet`, '_blank');
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>
            <LuShield className={styles.titleIcon} />
            Vault Inventory
          </h2>
          {stats && <span className={styles.totalCount}>{stats.total} NFTs in vault</span>}
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="minted">Minted</option>
            <option value="ready_to_list">Ready to List</option>
            <option value="listed">Listed</option>
            <option value="pooled">Pooled</option>
            <option value="transferred">Transferred</option>
          </select>
          <button className={styles.refreshBtn} onClick={fetchVaultInventory} disabled={loading}>
            <HiOutlineRefresh className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Total Holdings</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.byStatus?.minted || 0}</div>
            <div className={styles.statLabel}>Minted</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.byStatus?.listed || 0}</div>
            <div className={styles.statLabel}>Listed</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.byStatus?.transferred || 0}</div>
            <div className={styles.statLabel}>Transferred</div>
          </div>
          {stats.vaultAddress && (
            <div className={styles.statCard}>
              <div className={styles.statValueSmall}>{truncateAddress(stats.vaultAddress)}</div>
              <div className={styles.statLabel}>Vault PDA</div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading vault inventory...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button onClick={fetchVaultInventory}>Try Again</button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className={styles.emptyState}>
          <LuSparkles className={styles.emptyIcon} />
          <h3>No NFTs in vault</h3>
          <p>Mint NFTs using the Create NFT page to add them to the vault.</p>
        </div>
      )}

      {/* NFT Grid */}
      {!loading && !error && items.length > 0 && (
        <div className={styles.nftGrid}>
          {items.map((nft) => {
            const config = statusConfig[nft.status] || statusConfig.minted;
            return (
              <div key={nft._id} className={styles.nftCard} onClick={() => handleViewNFT(nft)}>
                <div className={styles.imageContainer}>
                  <img
                    src={nft.imageUrl || PLACEHOLDER_IMAGE}
                    alt={nft.name}
                    className={styles.nftImage}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                    }}
                  />
                  <div className={`${styles.statusBadge} ${config.className}`}>{config.label}</div>
                  {nft.isVerifiedCreator && (
                    <div className={styles.verifiedBadge}>
                      <LuBadgeCheck />
                    </div>
                  )}
                </div>

                <div className={styles.nftInfo}>
                  <h4 className={styles.nftName}>{nft.name}</h4>

                  <div className={styles.nftMeta}>
                    <span className={styles.mintAddress} title={nft.nftMint}>
                      {truncateAddress(nft.nftMint)}
                    </span>
                    <span className={styles.mintDate}>{formatDate(nft.mintedAt)}</span>
                  </div>

                  {nft.listing && (
                    <div className={styles.priceTag}>
                      <LuSparkles className={styles.priceIcon} />
                      <span>{nft.listing.priceSol?.toFixed(2)} SOL</span>
                      {nft.listing.priceUsd && (
                        <span className={styles.priceUsd}>
                          ${nft.listing.priceUsd.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}

                  {nft.offers && nft.offers.length > 0 && (
                    <div className={styles.offerCount}>
                      {nft.offers.length} offer{nft.offers.length > 1 ? 's' : ''}
                    </div>
                  )}

                  <div className={styles.cardActions}>
                    <button
                      className={styles.viewBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewNFT(nft);
                      }}
                    >
                      <HiOutlineEye />
                      View
                    </button>
                    <button
                      className={styles.solscanBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        openSolscan(nft.nftMint);
                      }}
                    >
                      <HiOutlineExternalLink />
                      Solscan
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedNFT && (
        <div className={styles.modalOverlay} onClick={() => setSelectedNFT(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{selectedNFT.name}</h3>
              <button className={styles.closeBtn} onClick={() => setSelectedNFT(null)}>
                &times;
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalImage}>
                <img
                  src={selectedNFT.imageUrl || PLACEHOLDER_IMAGE}
                  alt={selectedNFT.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                  }}
                />
              </div>

              <div className={styles.modalDetails}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Mint Address</span>
                  <span className={styles.detailValue}>
                    <a
                      href={`https://solscan.io/token/${selectedNFT.nftMint}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selectedNFT.nftMint}
                      <HiOutlineExternalLink />
                    </a>
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Status</span>
                  <span
                    className={`${styles.detailBadge} ${(statusConfig[selectedNFT.status] || statusConfig.minted).className}`}
                  >
                    {(statusConfig[selectedNFT.status] || statusConfig.minted).label}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Minted By</span>
                  <span className={styles.detailValue}>
                    {truncateAddress(selectedNFT.mintedBy)}
                  </span>
                </div>

                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Minted At</span>
                  <span className={styles.detailValue}>{formatDate(selectedNFT.mintedAt)}</span>
                </div>

                {selectedNFT.description && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Description</span>
                    <p className={styles.detailDescription}>{selectedNFT.description}</p>
                  </div>
                )}

                {selectedNFT.metadataUri && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Metadata</span>
                    <a
                      href={selectedNFT.metadataUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.metadataLink}
                    >
                      View on IPFS
                      <HiOutlineExternalLink />
                    </a>
                  </div>
                )}

                {selectedNFT.tags && selectedNFT.tags.length > 0 && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Tags</span>
                    <div className={styles.tagList}>
                      {selectedNFT.tags.map((tag, idx) => (
                        <span key={idx} className={styles.tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNFT.history && selectedNFT.history.length > 0 && (
                  <div className={styles.historySection}>
                    <h4>History</h4>
                    <div className={styles.historyList}>
                      {selectedNFT.history.map((entry, idx) => (
                        <div key={idx} className={styles.historyItem}>
                          <span className={styles.historyAction}>{entry.action}</span>
                          <span className={styles.historyDate}>
                            {formatDate(entry.performedAt)}
                          </span>
                          <span className={styles.historyBy}>
                            by {truncateAddress(entry.performedBy)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultInventoryTab;
