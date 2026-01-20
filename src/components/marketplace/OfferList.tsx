// src/components/marketplace/OfferList.tsx
// List offers with filtering - supports buyer and vendor views
import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import OfferCard from './OfferCard';
import styles from '../../styles/OfferList.module.css';

interface CounterOffer {
  amount: number;
  amountUSD: number;
  from: string;
  fromType: 'buyer' | 'vendor';
  message?: string;
  at: string;
}

interface Offer {
  _id: string;
  escrowPda: string;
  assetModel?: string;
  assetImage?: string;
  escrowListingPrice?: number;
  offerAmount: number;
  offerPriceUSD: number;
  offerCurrency: string;
  message?: string;
  buyerWallet: string;
  buyerUsername?: string;
  vendorWallet: string;
  vendorName?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired' | 'auto_rejected';
  rejectionReason?: string;
  autoRejectedReason?: string;
  counterOffers?: CounterOffer[];
  latestCounterOffer?: CounterOffer;
  createdAt: string;
  respondedAt?: string;
  expiresAt?: string;
}

interface OfferListProps {
  viewMode: 'buyer' | 'vendor';
  escrowPda?: string; // Filter by specific escrow
  onOfferAction?: () => void; // Callback after any offer action
}

type StatusFilter = 'all' | 'pending' | 'countered' | 'accepted' | 'rejected';

const OfferList: React.FC<OfferListProps> = ({ viewMode, escrowPda, onOfferAction }) => {
  const { publicKey, connected } = useWallet();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    accepted: 0,
    rejected: 0,
    countered: 0,
  });

  // Modal states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      fetchOffers();
    }
  }, [connected, publicKey, statusFilter, escrowPda]);

  const fetchOffers = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (escrowPda) {
        params.append('escrowPda', escrowPda);
      } else if (viewMode === 'buyer') {
        params.append('buyerWallet', publicKey.toBase58());
      } else {
        params.append('vendorWallet', publicKey.toBase58());
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/offers/list?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch offers');
      }

      setOffers(data.offers || []);
      setStats(data.stats || { total: 0, pending: 0, accepted: 0, rejected: 0, countered: 0 });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (offerId: string) => {
    if (!publicKey || actionLoading) return;

    const confirmed = confirm(
      'Are you sure you want to accept this offer? This will reject all other pending offers.'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId,
          vendorWallet: publicKey.toBase58(),
          action: 'accept',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept offer');
      }

      fetchOffers();
      onOfferAction?.();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = (offerId: string) => {
    setSelectedOfferId(offerId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const submitReject = async () => {
    if (!publicKey || !selectedOfferId || !rejectReason.trim()) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOfferId,
          vendorWallet: publicKey.toBase58(),
          action: 'reject',
          rejectionReason: rejectReason,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject offer');
      }

      setShowRejectModal(false);
      fetchOffers();
      onOfferAction?.();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCounter = (offerId: string) => {
    setSelectedOfferId(offerId);
    setCounterAmount('');
    setCounterMessage('');
    setShowCounterModal(true);
  };

  const submitCounter = async () => {
    if (!publicKey || !selectedOfferId || !counterAmount) return;

    const amount = parseFloat(counterAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid counter amount');
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOfferId,
          vendorWallet: publicKey.toBase58(),
          action: 'counter',
          counterAmount: amount * 1_000_000_000, // Convert to lamports approximation
          counterAmountUSD: amount,
          counterMessage: counterMessage || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit counter offer');
      }

      setShowCounterModal(false);
      fetchOffers();
      onOfferAction?.();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async (offerId: string) => {
    if (!publicKey) return;

    const confirmed = confirm('Are you sure you want to withdraw this offer?');
    if (!confirmed) return;

    // TODO: Implement withdraw API endpoint
    alert('Withdraw functionality coming soon');
  };

  if (!connected) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <p>Connect your wallet to view offers</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading offers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <p>Error: {error}</p>
          <button onClick={fetchOffers} className={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{viewMode === 'buyer' ? 'My Offers' : 'Received Offers'}</h2>
        <div className={styles.statsSummary}>
          <span className={styles.statItem}>
            <strong>{stats.pending}</strong> Pending
          </span>
          <span className={styles.statItem}>
            <strong>{stats.countered}</strong> Countered
          </span>
          <span className={styles.statItem}>
            <strong>{stats.accepted}</strong> Accepted
          </span>
        </div>
      </div>

      <div className={styles.filters}>
        {(['all', 'pending', 'countered', 'accepted', 'rejected'] as StatusFilter[]).map(
          (filter) => (
            <button
              key={filter}
              className={`${styles.filterButton} ${statusFilter === filter ? styles.active : ''}`}
              onClick={() => setStatusFilter(filter)}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          )
        )}
      </div>

      {offers.length === 0 ? (
        <div className={styles.emptyState}>
          <p>{statusFilter === 'all' ? 'No offers yet' : `No ${statusFilter} offers`}</p>
        </div>
      ) : (
        <div className={styles.offerGrid}>
          {offers.map((offer) => (
            <OfferCard
              key={offer._id}
              offer={offer}
              viewMode={viewMode}
              onAccept={handleAccept}
              onReject={handleReject}
              onCounter={handleCounter}
              onWithdraw={handleWithdraw}
            />
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRejectModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Reject Offer</h3>
            <p className={styles.modalDescription}>
              Please provide a reason for rejecting this offer.
            </p>
            <textarea
              className={styles.textarea}
              placeholder="Reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button
                className={styles.confirmRejectButton}
                onClick={submitReject}
                disabled={!rejectReason.trim() || actionLoading}
              >
                {actionLoading ? 'Rejecting...' : 'Reject Offer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Counter Modal */}
      {showCounterModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCounterModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Counter Offer</h3>
            <p className={styles.modalDescription}>Enter your counter offer amount.</p>
            <div className={styles.inputGroup}>
              <label>Amount (USD)</label>
              <input
                type="number"
                className={styles.input}
                placeholder="0.00"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
            <div className={styles.inputGroup}>
              <label>Message (Optional)</label>
              <textarea
                className={styles.textarea}
                placeholder="Add a message to the buyer..."
                value={counterMessage}
                onChange={(e) => setCounterMessage(e.target.value)}
                rows={2}
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelButton} onClick={() => setShowCounterModal(false)}>
                Cancel
              </button>
              <button
                className={styles.confirmCounterButton}
                onClick={submitCounter}
                disabled={!counterAmount || actionLoading}
              >
                {actionLoading ? 'Sending...' : 'Send Counter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfferList;
