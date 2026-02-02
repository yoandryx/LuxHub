// src/components/admins/DelistRequestsPanel.tsx
// Admin panel for reviewing and processing vendor delist requests
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import toast from 'react-hot-toast';
import styles from '../../styles/AdminDashboard.module.css';
import {
  HiOutlineRefresh,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlineExternalLink,
  HiOutlineFilter,
  HiOutlineExclamation,
} from 'react-icons/hi';

interface DelistRequest {
  _id: string;
  asset: {
    _id: string;
    model: string;
    nftMint: string;
    priceUSD?: number;
    images?: string[];
    status: string;
  };
  mintAddress: string;
  vendor: {
    _id: string;
    businessName?: string;
    username?: string;
    wallet: string;
  };
  vendorWallet: string;
  reason: 'sold_externally' | 'damaged' | 'lost' | 'stolen' | 'returned' | 'other';
  reasonDetails: string;
  requestedAction: 'delist' | 'burn';
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
}

interface DelistRequestStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

const REASON_LABELS: Record<string, { label: string; color: string }> = {
  sold_externally: { label: 'Sold Externally', color: '#22c55e' },
  damaged: { label: 'Damaged', color: '#f59e0b' },
  lost: { label: 'Lost', color: '#ef4444' },
  stolen: { label: 'Stolen', color: '#ef4444' },
  returned: { label: 'Returned', color: '#3b82f6' },
  other: { label: 'Other', color: '#a1a1a1' },
};

const DelistRequestsPanel: React.FC = () => {
  const wallet = useWallet();
  const [requests, setRequests] = useState<DelistRequest[]>([]);
  const [stats, setStats] = useState<DelistRequestStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const res = await fetch(`/api/admin/delist-requests?${params.toString()}`);
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setRequests(data.requests || []);
      setStats(data.stats || { total: 0, pending: 0, approved: 0, rejected: 0 });
    } catch (err) {
      console.error('Failed to fetch delist requests:', err);
      toast.error('Failed to fetch delist requests');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleAction = async (requestId: string, action: 'approve' | 'reject') => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    const confirmed = window.confirm(
      action === 'approve'
        ? 'Approve this delist request? The asset status will be updated accordingly.'
        : 'Reject this delist request? The asset will remain in its current state.'
    );

    if (!confirmed) return;

    setProcessing(requestId);

    try {
      const res = await fetch(`/api/admin/delist-requests/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          action,
          reviewNotes: reviewNotes[requestId] || '',
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(data.message);
        // Refresh the list
        await fetchRequests();
        // Clear notes for this request
        setReviewNotes((prev) => {
          const updated = { ...prev };
          delete updated[requestId];
          return updated;
        });
      } else {
        toast.error(data.error || 'Failed to process request');
      }
    } catch (err) {
      console.error('Failed to process delist request:', err);
      toast.error('Failed to process request');
    } finally {
      setProcessing(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h3>
          <HiOutlineExclamation /> Delist Requests
        </h3>
        <button className={styles.refreshBtn} onClick={fetchRequests} disabled={loading}>
          <HiOutlineRefresh className={loading ? styles.spinning : ''} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid} style={{ marginBottom: '20px' }}>
        <div
          className={styles.statCard}
          onClick={() => setFilter('pending')}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.statValue} style={{ color: '#f59e0b' }}>
            {stats.pending}
          </span>
          <span className={styles.statLabel}>Pending</span>
        </div>
        <div
          className={styles.statCard}
          onClick={() => setFilter('approved')}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.statValue} style={{ color: '#22c55e' }}>
            {stats.approved}
          </span>
          <span className={styles.statLabel}>Approved</span>
        </div>
        <div
          className={styles.statCard}
          onClick={() => setFilter('rejected')}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.statValue} style={{ color: '#ef4444' }}>
            {stats.rejected}
          </span>
          <span className={styles.statLabel}>Rejected</span>
        </div>
        <div
          className={styles.statCard}
          onClick={() => setFilter('all')}
          style={{ cursor: 'pointer' }}
        >
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid #222',
          paddingBottom: '8px',
        }}
      >
        {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              background: filter === f ? 'rgba(200, 161, 255, 0.1)' : 'transparent',
              border: '1px solid',
              borderColor: filter === f ? '#c8a1ff' : '#333',
              borderRadius: '6px',
              color: filter === f ? '#c8a1ff' : '#a1a1a1',
              cursor: 'pointer',
              fontSize: '0.875rem',
              textTransform: 'capitalize',
              transition: 'all 0.2s',
            }}
          >
            <HiOutlineFilter style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            {f} {f === 'pending' && stats.pending > 0 && `(${stats.pending})`}
          </button>
        ))}
      </div>

      {/* Requests Table */}
      {loading ? (
        <div className={styles.loadingTab}>Loading requests...</div>
      ) : requests.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: '#a1a1a1',
          }}
        >
          <HiOutlineExclamation style={{ fontSize: '2rem', marginBottom: '8px' }} />
          <p>No {filter !== 'all' ? filter : ''} delist requests found</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.proposalTable}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Vendor</th>
                <th>Reason</th>
                <th>Action</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request._id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {request.asset?.images?.[0] && (
                        <img
                          src={request.asset.images[0]}
                          alt={request.asset?.model || 'Asset'}
                          style={{
                            width: '40px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius: '4px',
                          }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 500, color: '#fff' }}>
                          {request.asset?.model || 'Unknown Asset'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#a1a1a1' }}>
                          {request.mintAddress?.slice(0, 8)}...
                        </div>
                        {request.asset?.priceUSD && (
                          <div style={{ fontSize: '0.75rem', color: '#c8a1ff' }}>
                            ${request.asset.priceUSD.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem', color: '#fff' }}>
                      {request.vendor?.businessName || request.vendor?.username || 'Unknown'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#a1a1a1' }}>
                      {request.vendorWallet?.slice(0, 6)}...{request.vendorWallet?.slice(-4)}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: `${REASON_LABELS[request.reason]?.color}20`,
                        color: REASON_LABELS[request.reason]?.color || '#a1a1a1',
                      }}
                    >
                      {REASON_LABELS[request.reason]?.label || request.reason}
                    </span>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#a1a1a1',
                        marginTop: '4px',
                        maxWidth: '200px',
                      }}
                    >
                      {request.reasonDetails?.slice(0, 50)}
                      {request.reasonDetails?.length > 50 && '...'}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background: request.requestedAction === 'burn' ? '#ef444420' : '#3b82f620',
                        color: request.requestedAction === 'burn' ? '#ef4444' : '#3b82f6',
                      }}
                    >
                      {request.requestedAction.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        background:
                          request.status === 'pending'
                            ? '#f59e0b20'
                            : request.status === 'approved'
                              ? '#22c55e20'
                              : '#ef444420',
                        color:
                          request.status === 'pending'
                            ? '#f59e0b'
                            : request.status === 'approved'
                              ? '#22c55e'
                              : '#ef4444',
                      }}
                    >
                      {request.status.toUpperCase()}
                    </span>
                    {request.reviewedAt && (
                      <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '2px' }}>
                        by {request.reviewedBy?.slice(0, 6)}...
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#a1a1a1' }}>
                    {formatDate(request.createdAt)}
                  </td>
                  <td>
                    {request.status === 'pending' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => handleAction(request._id, 'approve')}
                            disabled={processing === request._id}
                            style={{
                              padding: '6px 12px',
                              background: '#22c55e',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: processing === request._id ? 0.6 : 1,
                            }}
                          >
                            <HiOutlineCheck /> Approve
                          </button>
                          <button
                            onClick={() => handleAction(request._id, 'reject')}
                            disabled={processing === request._id}
                            style={{
                              padding: '6px 12px',
                              background: '#ef4444',
                              border: 'none',
                              borderRadius: '4px',
                              color: '#fff',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              opacity: processing === request._id ? 0.6 : 1,
                            }}
                          >
                            <HiOutlineX /> Reject
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Review notes (optional)"
                          value={reviewNotes[request._id] || ''}
                          onChange={(e) =>
                            setReviewNotes((prev) => ({ ...prev, [request._id]: e.target.value }))
                          }
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid #333',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '0.75rem',
                            width: '100%',
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>
                        {request.reviewNotes || 'No notes'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DelistRequestsPanel;
