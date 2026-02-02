// src/components/vendor/DelistRequestModal.tsx
// Modal for vendors to request delisting of an NFT
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/DelistRequestModal.module.css';
import { HiOutlineX, HiOutlineExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';

interface DelistRequestModalProps {
  asset: {
    _id: string;
    model: string;
    mintAddress?: string;
    nftMint?: string;
    priceUSD?: number;
    image?: string;
  };
  onClose: () => void;
  onSuccess?: () => void;
}

const REASONS = [
  {
    value: 'sold_externally',
    label: 'Sold Outside LuxHub',
    description: 'Item was sold in-store or on another platform',
  },
  {
    value: 'returned',
    label: 'Returned by Buyer',
    description: 'Item was returned and no longer for sale',
  },
  { value: 'damaged', label: 'Damaged', description: 'Item was damaged and cannot be sold' },
  { value: 'lost', label: 'Lost', description: 'Item was lost or misplaced' },
  { value: 'stolen', label: 'Stolen', description: 'Item was stolen' },
  { value: 'other', label: 'Other', description: 'Other reason (please specify)' },
];

const DelistRequestModal: React.FC<DelistRequestModalProps> = ({ asset, onClose, onSuccess }) => {
  const wallet = useWallet();
  const [reason, setReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [requestedAction, setRequestedAction] = useState<'delist' | 'burn'>('delist');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!reason) {
      toast.error('Please select a reason');
      return;
    }

    if (!reasonDetails.trim()) {
      toast.error('Please provide details');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/vendor/delist-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.publicKey.toBase58(),
          assetId: asset._id,
          mintAddress: asset.mintAddress || asset.nftMint,
          reason,
          reasonDetails: reasonDetails.trim(),
          requestedAction,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Delist request submitted! Admin will review shortly.');
        onSuccess?.();
        onClose();
      } else {
        toast.error(data.error || 'Failed to submit request');
      }
    } catch (err) {
      console.error('Failed to submit delist request:', err);
      toast.error('Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <HiOutlineX />
        </button>

        <div className={styles.header}>
          <HiOutlineExclamation className={styles.warningIcon} />
          <h2>Request Delisting</h2>
          <p>Remove this item from the marketplace</p>
        </div>

        <div className={styles.assetInfo}>
          {asset.image && <img src={asset.image} alt={asset.model} className={styles.assetImage} />}
          <div className={styles.assetDetails}>
            <h3>{asset.model}</h3>
            {asset.priceUSD && <p>${asset.priceUSD.toLocaleString()}</p>}
            <code className={styles.mintAddress}>
              {(asset.mintAddress || asset.nftMint)?.slice(0, 8)}...
            </code>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>Reason for Delisting *</label>
            <div className={styles.reasonGrid}>
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`${styles.reasonBtn} ${reason === r.value ? styles.selected : ''}`}
                  onClick={() => setReason(r.value)}
                >
                  <span className={styles.reasonLabel}>{r.label}</span>
                  <span className={styles.reasonDesc}>{r.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Additional Details *</label>
            <textarea
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              placeholder="Please provide more details about why this item needs to be delisted..."
              rows={3}
              required
            />
          </div>

          <div className={styles.field}>
            <label>Requested Action</label>
            <div className={styles.actionToggle}>
              <button
                type="button"
                className={`${styles.actionBtn} ${requestedAction === 'delist' ? styles.selected : ''}`}
                onClick={() => setRequestedAction('delist')}
              >
                <strong>Delist</strong>
                <span>Remove from marketplace (can be relisted later)</span>
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${requestedAction === 'burn' ? styles.selected : ''}`}
                onClick={() => setRequestedAction('burn')}
              >
                <strong>Burn</strong>
                <span>Permanently remove (cannot be undone)</span>
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>

        <p className={styles.note}>
          Your request will be reviewed by a LuxHub admin. You&apos;ll be notified once it&apos;s
          processed.
        </p>
      </div>
    </div>
  );
};

export default DelistRequestModal;
