// src/components/admin/CustodyDashboard.tsx
// Admin dashboard for tracking LuxHub-held pool assets
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/CustodyDashboard.module.css';

// Hoisted outside component to prevent re-creation on each render
const CUSTODY_STATUS_COLORS: Record<string, string> = {
  pending: '#ffd700',
  shipped: '#00bfff',
  received: '#ff69b4',
  verified: '#9370db',
  stored: '#00ff88',
};

const DEFAULT_COLOR = '#c8a1ff';

interface CustodyItem {
  _id: string;
  poolNumber: string;
  status: string;
  custodyStatus: string;
  asset: {
    model: string;
    brand: string;
    serial: string;
    priceUSD: number;
    image: string;
  } | null;
  vendor: string;
  vendorWallet: string;
  vendorPaidAmount: number;
  vendorPaidAt: string;
  trackingCarrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  proofUrls: string[];
  receivedAt: string;
  verifiedBy: string;
  resaleListingPriceUSD: number;
  resaleListedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface CustodyStats {
  total: number;
  awaitingShipment: number;
  inTransit: number;
  pendingVerification: number;
  verified: number;
  securelyStored: number;
}

type CustodyStatusFilter = 'all' | 'pending' | 'shipped' | 'received' | 'verified' | 'stored';

const CustodyDashboard: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [items, setItems] = useState<CustodyItem[]>([]);
  const [stats, setStats] = useState<CustodyStats>({
    total: 0,
    awaitingShipment: 0,
    inTransit: 0,
    pendingVerification: 0,
    verified: 0,
    securelyStored: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<CustodyStatusFilter>('all');

  // Modal states
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CustodyItem | null>(null);
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Memoized fetch function to prevent unnecessary re-renders
  const fetchCustodyItems = useCallback(async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('adminWallet', publicKey.toBase58());

      const response = await fetch(`/api/pool/custody?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch custody items');
      }

      setItems(data.items || []);
      setStats(data.stats || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      fetchCustodyItems();
    }
  }, [connected, publicKey, fetchCustodyItems]);

  // Memoized action handler
  const handleAction = useCallback(
    async (item: CustodyItem, action: string, extraData?: Record<string, any>) => {
      if (!publicKey || actionLoading) return;

      setActionLoading(true);
      try {
        const response = await fetch('/api/pool/custody', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolId: item._id,
            adminWallet: publicKey.toBase58(),
            action,
            ...extraData,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update custody status');
        }

        fetchCustodyItems();
        setShowTrackingModal(false);
        setSelectedItem(null);
      } catch (err: any) {
        alert('Error: ' + err.message);
      } finally {
        setActionLoading(false);
      }
    },
    [publicKey, actionLoading, fetchCustodyItems]
  );

  // Memoized modal opener
  const openTrackingModal = useCallback((item: CustodyItem) => {
    setSelectedItem(item);
    setTrackingCarrier('');
    setTrackingNumber('');
    setShowTrackingModal(true);
  }, []);

  // Memoized submit handler
  const submitTracking = useCallback(() => {
    if (!selectedItem || !trackingCarrier || !trackingNumber) return;
    handleAction(selectedItem, 'submit_tracking', {
      trackingCarrier,
      trackingNumber,
    });
  }, [selectedItem, trackingCarrier, trackingNumber, handleAction]);

  // Memoized filtered items
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'all') return true;
        return item.custodyStatus === filter;
      }),
    [items, filter]
  );

  // Memoized date formatter
  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Use hoisted color map
  const getCustodyStatusColor = useCallback((status: string) => {
    return CUSTODY_STATUS_COLORS[status] || DEFAULT_COLOR;
  }, []);

  if (!connected) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Connect your admin wallet to view custody dashboard</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading custody items...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Error: {error}</p>
          <button onClick={fetchCustodyItems} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Custody Tracking</h2>
        <p className={styles.subtitle}>Track LuxHub-held pool assets</p>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total Items</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#ffd700' }}>
          <span className={styles.statValue}>{stats.awaitingShipment}</span>
          <span className={styles.statLabel}>Awaiting Shipment</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#00bfff' }}>
          <span className={styles.statValue}>{stats.inTransit}</span>
          <span className={styles.statLabel}>In Transit</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#ff69b4' }}>
          <span className={styles.statValue}>{stats.pendingVerification}</span>
          <span className={styles.statLabel}>Pending Verification</span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#00ff88' }}>
          <span className={styles.statValue}>{stats.securelyStored}</span>
          <span className={styles.statLabel}>Securely Stored</span>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {(
          ['all', 'pending', 'shipped', 'received', 'verified', 'stored'] as CustodyStatusFilter[]
        ).map((f) => (
          <button
            key={f}
            className={`${styles.filterButton} ${filter === f ? styles.active : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Items Table */}
      {filteredItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No items in {filter === 'all' ? 'custody' : `${filter} status`}</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Vendor</th>
                <th>Custody Status</th>
                <th>Tracking</th>
                <th>Vendor Paid</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item._id}>
                  <td>
                    <div className={styles.assetCell}>
                      {item.asset?.image && (
                        <img
                          src={item.asset.image}
                          alt={item.asset.model}
                          className={styles.assetThumb}
                        />
                      )}
                      <div className={styles.assetInfo}>
                        <span className={styles.assetModel}>{item.asset?.model || 'Unknown'}</span>
                        <span className={styles.poolNumber}>Pool #{item.poolNumber}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={styles.vendorName}>{item.vendor}</span>
                  </td>
                  <td>
                    <span
                      className={styles.statusBadge}
                      style={{ backgroundColor: getCustodyStatusColor(item.custodyStatus) }}
                    >
                      {item.custodyStatus}
                    </span>
                  </td>
                  <td>
                    {item.trackingNumber ? (
                      <a
                        href={item.trackingUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.trackingLink}
                      >
                        {item.trackingCarrier}: {item.trackingNumber}
                      </a>
                    ) : (
                      <span className={styles.noTracking}>Not submitted</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.paymentInfo}>
                      <span className={styles.paymentAmount}>
                        ${item.vendorPaidAmount?.toLocaleString() || '-'}
                      </span>
                      <span className={styles.paymentDate}>{formatDate(item.vendorPaidAt)}</span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.actions}>
                      {item.custodyStatus === 'pending' && (
                        <button
                          className={styles.actionButton}
                          onClick={() => openTrackingModal(item)}
                        >
                          Add Tracking
                        </button>
                      )}
                      {item.custodyStatus === 'shipped' && (
                        <button
                          className={styles.actionButton}
                          onClick={() => handleAction(item, 'mark_received')}
                          disabled={actionLoading}
                        >
                          Mark Received
                        </button>
                      )}
                      {item.custodyStatus === 'received' && (
                        <button
                          className={styles.actionButton}
                          onClick={() => handleAction(item, 'verify')}
                          disabled={actionLoading}
                        >
                          Verify Asset
                        </button>
                      )}
                      {item.custodyStatus === 'verified' && (
                        <button
                          className={styles.actionButton}
                          onClick={() => handleAction(item, 'store')}
                          disabled={actionLoading}
                        >
                          Move to Storage
                        </button>
                      )}
                      {item.custodyStatus === 'stored' && (
                        <span className={styles.completedBadge}>Secure</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tracking Modal */}
      {showTrackingModal && selectedItem && (
        <div className={styles.modalOverlay} onClick={() => setShowTrackingModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Add Tracking Information</h3>
            <p className={styles.modalSubtitle}>
              Pool #{selectedItem.poolNumber} - {selectedItem.asset?.model}
            </p>

            <div className={styles.inputGroup}>
              <label>Carrier</label>
              <select
                className={styles.select}
                value={trackingCarrier}
                onChange={(e) => setTrackingCarrier(e.target.value)}
              >
                <option value="">Select carrier...</option>
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
                <option value="usps">USPS</option>
                <option value="dhl">DHL</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className={styles.inputGroup}>
              <label>Tracking Number</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Enter tracking number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setShowTrackingModal(false)}>
                Cancel
              </button>
              <button
                className={styles.submitButton}
                onClick={submitTracking}
                disabled={!trackingCarrier || !trackingNumber || actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Submit Tracking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustodyDashboard;
