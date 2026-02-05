// src/components/marketplace/MakeOfferModal.tsx
// Modal for buyers to make offers on escrow listings
import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { resolveImageUrl, handleImageError, PLACEHOLDER_IMAGE } from '../../utils/imageUtils';
import styles from '../../styles/MakeOfferModal.module.css';

interface Escrow {
  escrowPda: string;
  listingPriceUSD: number;
  minimumOfferUSD?: number;
  asset?: {
    model?: string;
    imageUrl?: string;
  };
  vendor?: {
    businessName?: string;
  };
}

interface MakeOfferModalProps {
  escrow: Escrow;
  onClose: () => void;
  onSuccess?: () => void;
}

const MakeOfferModal: React.FC<MakeOfferModalProps> = ({ escrow, onClose, onSuccess }) => {
  const { publicKey, connected } = useWallet();
  const [offerAmount, setOfferAmount] = useState('');
  const [message, setMessage] = useState('');
  const [expiresInHours, setExpiresInHours] = useState('24');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const amount = parseFloat(offerAmount) || 0;
  const listPrice = escrow.listingPriceUSD;
  const difference = listPrice > 0 ? ((amount - listPrice) / listPrice) * 100 : 0;
  const isValid = amount > 0 && (!escrow.minimumOfferUSD || amount >= escrow.minimumOfferUSD);

  const handleSubmit = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet');
      return;
    }

    if (!isValid) {
      setError(`Offer must be at least $${escrow.minimumOfferUSD || 0}`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/offers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowPda: escrow.escrowPda,
          buyerWallet: publicKey.toBase58(),
          offerAmount: amount * 1_000_000_000, // Approximate lamports
          offerPriceUSD: amount,
          offerCurrency: 'SOL',
          message: message.trim() || undefined,
          expiresInHours: parseInt(expiresInHours) || 24,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create offer');
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>

        <div className={styles.header}>
          <h2 className={styles.title}>Make an Offer</h2>
          <p className={styles.subtitle}>Submit your offer for this listing</p>
        </div>

        {/* Asset Preview */}
        <div className={styles.assetPreview}>
          <img
            src={resolveImageUrl(escrow.asset?.imageUrl) || PLACEHOLDER_IMAGE}
            alt={escrow.asset?.model || 'Watch'}
            className={styles.assetImage}
            onError={handleImageError}
          />
          <div className={styles.assetInfo}>
            <h3 className={styles.assetModel}>{escrow.asset?.model || 'Luxury Watch'}</h3>
            {escrow.vendor?.businessName && (
              <span className={styles.vendorName}>by {escrow.vendor.businessName}</span>
            )}
            <div className={styles.listPrice}>
              <span className={styles.listPriceLabel}>List Price</span>
              <span className={styles.listPriceValue}>${listPrice.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {success ? (
          <div className={styles.successMessage}>
            <div className={styles.successIcon}>✓</div>
            <h3>Offer Submitted!</h3>
            <p>Your offer has been sent to the vendor.</p>
          </div>
        ) : (
          <>
            {/* Offer Amount Input */}
            <div className={styles.inputSection}>
              <label className={styles.inputLabel}>Your Offer (USD)</label>
              <div className={styles.amountInputWrapper}>
                <span className={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  className={styles.amountInput}
                  placeholder="0.00"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              {escrow.minimumOfferUSD && (
                <span className={styles.minimumNote}>
                  Minimum: ${escrow.minimumOfferUSD.toLocaleString()}
                </span>
              )}
              {amount > 0 && (
                <div
                  className={`${styles.diffIndicator} ${difference < 0 ? styles.below : styles.above}`}
                >
                  {difference < 0 ? '' : '+'}
                  {difference.toFixed(1)}% {difference < 0 ? 'below' : 'above'} list price
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className={styles.inputSection}>
              <label className={styles.inputLabel}>Message (Optional)</label>
              <textarea
                className={styles.messageInput}
                placeholder="Add a message to the vendor..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>

            {/* Expiration */}
            <div className={styles.inputSection}>
              <label className={styles.inputLabel}>Offer Expires In</label>
              <select
                className={styles.select}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(e.target.value)}
              >
                <option value="12">12 hours</option>
                <option value="24">24 hours</option>
                <option value="48">48 hours</option>
                <option value="72">72 hours</option>
                <option value="168">7 days</option>
              </select>
            </div>

            {/* Summary */}
            <div className={styles.summary}>
              <div className={styles.summaryRow}>
                <span>Your Offer</span>
                <span className={styles.summaryValue}>${amount.toLocaleString()}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>List Price</span>
                <span>${listPrice.toLocaleString()}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Difference</span>
                <span className={difference < 0 ? styles.negative : styles.positive}>
                  {difference < 0 ? '' : '+'}${Math.abs(amount - listPrice).toLocaleString()}
                </span>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            {!connected ? (
              <button className={styles.submitButton} disabled>
                Connect Wallet to Make Offer
              </button>
            ) : (
              <button
                className={styles.submitButton}
                onClick={handleSubmit}
                disabled={!isValid || loading}
              >
                {loading ? 'Submitting...' : `Submit Offer - $${amount.toLocaleString()}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MakeOfferModal;
