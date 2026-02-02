// src/components/admins/MintRequestsPanel.tsx
// Admin panel to review, approve, and reject vendor mint requests
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
  HiOutlinePhotograph,
  HiOutlineCube,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi';

interface MintRequest {
  _id: string;
  title: string;
  brand: string;
  model: string;
  referenceNumber: string;
  priceUSD: number;
  wallet: string;
  imageUrl?: string;
  imageCid?: string;
  description?: string;
  material?: string;
  productionYear?: string;
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  condition?: string;
  boxPapers?: string;
  country?: string;
  status: 'pending' | 'approved' | 'rejected' | 'minted';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  mintAddress?: string;
  createdAt: string;
}

const MintRequestsPanel: React.FC = () => {
  const wallet = useWallet();
  const [requests, setRequests] = useState<MintRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'minted' | 'all'>(
    'pending'
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);

  const fetchRequests = useCallback(async () => {
    if (!wallet.publicKey) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.append('status', filter);
      }

      const res = await fetch(`/api/admin/mint-requests?${params.toString()}`, {
        headers: {
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
      });
      const data = await res.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setRequests(data.requests || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch mint requests:', err);
      toast.error('Failed to fetch mint requests');
    } finally {
      setLoading(false);
    }
  }, [filter, wallet.publicKey]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApproveAndMint = async (requestId: string) => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    const confirmed = window.confirm(
      'Approve and mint this NFT? This will:\n\n' +
        '1. Upload the image to storage\n' +
        '2. Mint the NFT on-chain\n' +
        '3. Transfer to the vendor wallet\n\n' +
        'This action cannot be undone.'
    );

    if (!confirmed) return;

    setProcessing(requestId);
    const toastId = toast.loading('Minting NFT...');

    try {
      const res = await fetch('/api/admin/mint-requests/approve-and-mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          mintRequestId: requestId,
          adminNotes: adminNotes[requestId] || '',
        }),
      });

      const data = await res.json();

      if (data.mintAddress) {
        toast.success(`NFT minted: ${data.mintAddress.slice(0, 8)}...`, { id: toastId });
        await fetchRequests();
      } else {
        toast.error(data.error || 'Failed to mint', { id: toastId });
      }
    } catch (err) {
      console.error('Failed to mint:', err);
      toast.error('Failed to mint NFT', { id: toastId });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    const reason = adminNotes[requestId] || prompt('Reason for rejection:');
    if (!reason) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setProcessing(requestId);

    try {
      const res = await fetch(`/api/admin/mint-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify({
          status: 'rejected',
          adminNotes: reason,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Request rejected');
        await fetchRequests();
      } else {
        toast.error(data.error || 'Failed to reject');
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      toast.error('Failed to reject request');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'approved':
        return '#3b82f6';
      case 'minted':
        return '#22c55e';
      case 'rejected':
        return '#ef4444';
      default:
        return '#a1a1a1';
    }
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h3>
          <HiOutlineCube /> Mint Requests
        </h3>
        <button className={styles.refreshBtn} onClick={fetchRequests} disabled={loading}>
          <HiOutlineRefresh className={loading ? styles.spinning : ''} />
          Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
          borderBottom: '1px solid #222',
          paddingBottom: '8px',
          flexWrap: 'wrap',
        }}
      >
        {(['pending', 'approved', 'minted', 'rejected', 'all'] as const).map((f) => (
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
            {f}
          </button>
        ))}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className={styles.loadingTab}>Loading mint requests...</div>
      ) : requests.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px',
            color: '#a1a1a1',
          }}
        >
          <HiOutlineCube style={{ fontSize: '2rem', marginBottom: '8px' }} />
          <p>No {filter !== 'all' ? filter : ''} mint requests found</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {requests.map((request) => (
            <div
              key={request._id}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid #222',
                borderRadius: '12px',
                overflow: 'hidden',
              }}
            >
              {/* Request Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(expandedId === request._id ? null : request._id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Image Preview */}
                  <div
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      background: '#1a1a1a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {request.imageUrl ? (
                      <img
                        src={request.imageUrl}
                        alt={request.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <HiOutlinePhotograph style={{ fontSize: '1.5rem', color: '#666' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff' }}>{request.title}</div>
                    <div style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>
                      {request.brand} {request.model} - #{request.referenceNumber}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#c8a1ff', fontWeight: 500 }}>
                      ${request.priceUSD?.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Status Badge */}
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: `${getStatusColor(request.status)}20`,
                      color: getStatusColor(request.status),
                    }}
                  >
                    {request.status}
                  </span>

                  {/* Expand Icon */}
                  {expandedId === request._id ? (
                    <HiOutlineChevronUp style={{ color: '#666' }} />
                  ) : (
                    <HiOutlineChevronDown style={{ color: '#666' }} />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === request._id && (
                <div
                  style={{
                    padding: '16px',
                    borderTop: '1px solid #222',
                    background: 'rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {/* Details Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '12px',
                      marginBottom: '16px',
                    }}
                  >
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Vendor Wallet</span>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                        {request.wallet?.slice(0, 8)}...{request.wallet?.slice(-6)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Submitted</span>
                      <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                        {formatDate(request.createdAt)}
                      </div>
                    </div>
                    {request.material && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Material</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.material}</div>
                      </div>
                    )}
                    {request.movement && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Movement</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>{request.movement}</div>
                      </div>
                    )}
                    {request.condition && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Condition</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.condition}
                        </div>
                      </div>
                    )}
                    {request.productionYear && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Year</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.productionYear}
                        </div>
                      </div>
                    )}
                    {request.boxPapers && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Box & Papers</span>
                        <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                          {request.boxPapers}
                        </div>
                      </div>
                    )}
                    {request.mintAddress && (
                      <div>
                        <span style={{ color: '#666', fontSize: '0.75rem' }}>Mint Address</span>
                        <div
                          style={{
                            color: '#22c55e',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          {request.mintAddress?.slice(0, 8)}...
                          <a
                            href={`https://explorer.solana.com/address/${request.mintAddress}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ marginLeft: '4px', color: '#c8a1ff' }}
                          >
                            <HiOutlineExternalLink />
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {request.description && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Description</span>
                      <div style={{ color: '#fff', fontSize: '0.85rem' }}>
                        {request.description}
                      </div>
                    </div>
                  )}

                  {/* Admin Notes */}
                  {request.adminNotes && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ color: '#666', fontSize: '0.75rem' }}>Admin Notes</span>
                      <div style={{ color: '#f59e0b', fontSize: '0.85rem' }}>
                        {request.adminNotes}
                      </div>
                    </div>
                  )}

                  {/* Actions for pending requests */}
                  {request.status === 'pending' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <input
                        type="text"
                        placeholder="Admin notes (optional for approval, required for rejection)"
                        value={adminNotes[request._id] || ''}
                        onChange={(e) =>
                          setAdminNotes((prev) => ({ ...prev, [request._id]: e.target.value }))
                        }
                        style={{
                          padding: '10px 12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid #333',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '0.875rem',
                          width: '100%',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => handleApproveAndMint(request._id)}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: '#22c55e',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                          }}
                        >
                          <HiOutlineCheck />
                          {processing === request._id ? 'Minting...' : 'Approve & Mint'}
                        </button>
                        <button
                          onClick={() => handleReject(request._id)}
                          disabled={processing === request._id}
                          style={{
                            flex: 1,
                            padding: '12px 16px',
                            background: '#ef4444',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: processing === request._id ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            opacity: processing === request._id ? 0.6 : 1,
                          }}
                        >
                          <HiOutlineX />
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MintRequestsPanel;
