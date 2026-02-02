// src/components/admins/AssetCleanupPanel.tsx
// Admin panel for cleaning up failed/test mints
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/AdminDashboard.module.css';
import {
  HiOutlineTrash,
  HiOutlineFire,
  HiOutlineEyeOff,
  HiOutlineRefresh,
  HiOutlineExclamation,
  HiOutlinePhotograph,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

interface CleanupAsset {
  _id: string;
  model: string;
  mintAddress: string;
  status: string;
  priceUSD: number;
  createdAt: string;
  owner: string;
  hasImage: boolean;
  flags: string[];
}

const AssetCleanupPanel: React.FC = () => {
  const wallet = useWallet();
  const [assets, setAssets] = useState<CleanupAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);

  const fetchAssets = useCallback(async () => {
    if (!wallet.publicKey) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('wallet', wallet.publicKey.toBase58());
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/admin/assets/cleanup?${params}`);
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setAssets(data.assets || []);
    } catch (err) {
      console.error('Failed to fetch assets:', err);
      toast.error('Failed to load assets');
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, statusFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    const displayedAssets = showOnlyFlagged ? assets.filter((a) => a.flags.length > 0) : assets;
    if (selectedIds.size === displayedAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedAssets.map((a) => a._id)));
    }
  };

  const handleAction = async (action: 'soft_delete' | 'hard_delete' | 'burn') => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one asset');
      return;
    }

    const actionLabels = {
      soft_delete: 'soft delete',
      hard_delete: 'permanently delete',
      burn: 'burn',
    };

    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabels[action]} ${selectedIds.size} asset(s)?\n\n` +
        (action === 'hard_delete'
          ? 'WARNING: This permanently removes them from the database!'
          : '')
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/assets/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey?.toBase58() || '',
        },
        body: JSON.stringify({
          assetIds: Array.from(selectedIds),
          action,
          reason: `Admin cleanup - ${action}`,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        setSelectedIds(new Set());
        fetchAssets();
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch (err) {
      console.error('Action failed:', err);
      toast.error('Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const displayedAssets = showOnlyFlagged ? assets.filter((a) => a.flags.length > 0) : assets;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const truncate = (str: string, len: number = 8) => {
    if (!str || str.length <= len) return str || '—';
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  return (
    <div className={styles.section}>
      {/* Header Controls */}
      <div className={styles.panelHeader}>
        <div className={styles.filterRow}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={styles.filterSelect}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="listed">Listed</option>
            <option value="reviewed">Reviewed</option>
            <option value="in_escrow">In Escrow</option>
            <option value="burned">Burned</option>
          </select>

          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={showOnlyFlagged}
              onChange={(e) => setShowOnlyFlagged(e.target.checked)}
            />
            Show only flagged (missing data)
          </label>

          <button onClick={fetchAssets} className={styles.refreshBtn} disabled={loading}>
            <HiOutlineRefresh className={loading ? styles.spinning : ''} />
            Refresh
          </button>
        </div>

        {/* Action Buttons */}
        <div className={styles.actionRow}>
          <span className={styles.selectedCount}>
            {selectedIds.size} of {displayedAssets.length} selected
          </span>

          <button
            onClick={() => handleAction('soft_delete')}
            className={styles.actionBtnWarning}
            disabled={actionLoading || selectedIds.size === 0}
          >
            <HiOutlineEyeOff />
            Soft Delete
          </button>

          <button
            onClick={() => handleAction('burn')}
            className={styles.actionBtnWarning}
            disabled={actionLoading || selectedIds.size === 0}
          >
            <HiOutlineFire />
            Mark Burned
          </button>

          <button
            onClick={() => handleAction('hard_delete')}
            className={styles.actionBtnDanger}
            disabled={actionLoading || selectedIds.size === 0}
          >
            <HiOutlineTrash />
            Hard Delete
          </button>
        </div>
      </div>

      {/* Assets Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    selectedIds.size === displayedAssets.length && displayedAssets.length > 0
                  }
                  onChange={toggleSelectAll}
                />
              </th>
              <th>Model</th>
              <th>Mint Address</th>
              <th>Status</th>
              <th>Price</th>
              <th>Created</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className={styles.loadingCell}>
                  Loading assets...
                </td>
              </tr>
            ) : displayedAssets.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  No assets found
                </td>
              </tr>
            ) : (
              displayedAssets.map((asset) => (
                <tr
                  key={asset._id}
                  className={selectedIds.has(asset._id) ? styles.selectedRow : ''}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(asset._id)}
                      onChange={() => toggleSelect(asset._id)}
                    />
                  </td>
                  <td className={styles.modelCell}>
                    {asset.hasImage ? (
                      <HiOutlinePhotograph className={styles.hasImageIcon} />
                    ) : (
                      <HiOutlineExclamation className={styles.noImageIcon} />
                    )}
                    {asset.model || 'Untitled'}
                  </td>
                  <td className={styles.mintCell}>
                    <code>{truncate(asset.mintAddress, 12)}</code>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${asset.status}`]}`}>
                      {asset.status}
                    </span>
                  </td>
                  <td>${asset.priceUSD?.toLocaleString() || '0'}</td>
                  <td>{formatDate(asset.createdAt)}</td>
                  <td>
                    {asset.flags.length > 0 ? (
                      <div className={styles.flagsList}>
                        {asset.flags.map((flag) => (
                          <span key={flag} className={styles.flagBadge}>
                            {flag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <HiOutlineCheckCircle className={styles.okIcon} />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <h4>Actions:</h4>
        <ul>
          <li>
            <strong>Soft Delete:</strong> Hides asset from UI (can be recovered)
          </li>
          <li>
            <strong>Mark Burned:</strong> Sets status to &quot;burned&quot; (permanent status)
          </li>
          <li>
            <strong>Hard Delete:</strong> Permanently removes from database (cannot recover)
          </li>
        </ul>
        <p className={styles.note}>
          Note: These actions only affect database records. On-chain NFTs remain on Solana.
        </p>
      </div>
    </div>
  );
};

export default AssetCleanupPanel;
