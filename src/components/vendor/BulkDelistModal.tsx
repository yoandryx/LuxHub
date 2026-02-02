// src/components/vendor/BulkDelistModal.tsx
// Modal for vendors to request delisting of multiple NFTs at once
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/DelistRequestModal.module.css';
import { HiOutlineX, HiOutlineExclamation } from 'react-icons/hi';
import toast from 'react-hot-toast';

interface Asset {
  _id: string;
  model: string;
  mintAddress?: string;
  nftMint?: string;
  priceUSD?: number;
  image?: string;
}

interface BulkDelistModalProps {
  assets: Asset[];
  onClose: () => void;
  onSuccess?: () => void;
}

const REASONS = [
  {
    value: 'sold_externally',
    label: 'Sold Outside LuxHub',
    description: 'Items were sold in-store or on another platform',
  },
  {
    value: 'returned',
    label: 'Returned by Buyer',
    description: 'Items were returned and no longer for sale',
  },
  { value: 'damaged', label: 'Damaged', description: 'Items were damaged and cannot be sold' },
  { value: 'lost', label: 'Lost', description: 'Items were lost or misplaced' },
  { value: 'stolen', label: 'Stolen', description: 'Items were stolen' },
  { value: 'other', label: 'Other', description: 'Other reason (please specify)' },
];

const BulkDelistModal: React.FC<BulkDelistModalProps> = ({ assets, onClose, onSuccess }) => {
  const wallet = useWallet();
  const [reason, setReason] = useState<string>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [requestedAction, setRequestedAction] = useState<'delist' | 'burn'>('delist');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: assets.length, failed: 0 });

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
    setProgress({ current: 0, total: assets.length, failed: 0 });

    let failed = 0;
    const walletAddress = wallet.publicKey.toBase58();

    // Submit delist requests for each asset
    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      setProgress((prev) => ({ ...prev, current: i + 1 }));

      try {
        const res = await fetch('/api/vendor/delist-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: walletAddress,
            assetId: asset._id,
            mintAddress: asset.mintAddress || asset.nftMint,
            reason,
            reasonDetails: reasonDetails.trim(),
            requestedAction,
          }),
        });

        const data = await res.json();

        if (!data.success) {
          console.error(`Failed to submit delist request for ${asset.model}:`, data.error);
          failed++;
        }
      } catch (err) {
        console.error(`Error submitting delist request for ${asset.model}:`, err);
        failed++;
      }
    }

    setProgress((prev) => ({ ...prev, failed }));

    if (failed === 0) {
      toast.success(`All ${assets.length} delist requests submitted successfully!`);
      onSuccess?.();
      onClose();
    } else if (failed < assets.length) {
      toast.success(`${assets.length - failed} requests submitted, ${failed} failed`);
      onSuccess?.();
      onClose();
    } else {
      toast.error('All requests failed. Please try again.');
    }

    setSubmitting(false);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <button className={styles.closeBtn} onClick={onClose}>
          <HiOutlineX />
        </button>

        <div className={styles.header}>
          <HiOutlineExclamation className={styles.warningIcon} />
          <h2>Bulk Delist Request</h2>
          <p>Remove {assets.length} items from the marketplace</p>
        </div>

        {/* Selected Assets Preview */}
        <div
          style={{
            maxHeight: '150px',
            overflowY: 'auto',
            marginBottom: '20px',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '8px',
            }}
          >
            {assets.map((asset) => (
              <div
                key={asset._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px',
                  background: 'rgba(200, 161, 255, 0.05)',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                }}
              >
                {asset.image && (
                  <img
                    src={asset.image}
                    alt={asset.model}
                    style={{
                      width: '32px',
                      height: '32px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                    }}
                  />
                )}
                <span
                  style={{
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {asset.model}
                </span>
              </div>
            ))}
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
              placeholder="Please provide more details about why these items need to be delisted..."
              rows={3}
              required
            />
          </div>

          <div className={styles.field}>
            <label>Requested Action for All Items</label>
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

          {/* Progress indicator when submitting */}
          {submitting && (
            <div
              style={{
                padding: '12px',
                background: 'rgba(200, 161, 255, 0.1)',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <div style={{ marginBottom: '8px', color: '#fff', fontSize: '0.875rem' }}>
                Processing {progress.current} of {progress.total}...
              </div>
              <div
                style={{
                  height: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(progress.current / progress.total) * 100}%`,
                    background: '#c8a1ff',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting
                ? `Submitting (${progress.current}/${progress.total})...`
                : `Submit ${assets.length} Requests`}
            </button>
          </div>
        </form>

        <p className={styles.note}>
          All {assets.length} items will be submitted with the same reason. Each request will be
          reviewed individually by a LuxHub admin.
        </p>
      </div>
    </div>
  );
};

export default BulkDelistModal;
