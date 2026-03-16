// src/components/vendor/ConvertToPoolModal.tsx
// Modal for vendors to convert an asset/escrow listing into a tokenized pool
import React, { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/ConvertToPoolModal.module.css';
import { HiOutlineX } from 'react-icons/hi';
import { FiPieChart, FiLoader } from 'react-icons/fi';
import toast from 'react-hot-toast';

interface ConvertToPoolModalProps {
  asset: {
    _id?: string;
    title: string;
    mintAddress?: string;
    priceUSD?: number;
    priceSol?: number;
    image?: string;
    escrowPda?: string;
  };
  onClose: () => void;
  onSuccess?: () => void;
}

const ConvertToPoolModal: React.FC<ConvertToPoolModalProps> = ({ asset, onClose, onSuccess }) => {
  const wallet = useWallet();
  const [targetAmount, setTargetAmount] = useState(asset.priceUSD || 0);
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(() => {
    const luxhubFee = targetAmount * 0.03;
    const vendorPayment = targetAmount * 0.97;

    return { luxhubFee, vendorPayment };
  }, [targetAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (targetAmount <= 0) {
      toast.error('Target price must be positive');
      return;
    }

    setSubmitting(true);

    try {
      let endpoint: string;
      let body: Record<string, unknown>;

      if (asset.escrowPda) {
        endpoint = '/api/pool/convert-from-escrow';
        body = {
          escrowPda: asset.escrowPda,
          vendorWallet: wallet.publicKey.toBase58(),
          targetAmountUSD: targetAmount,
        };
      } else {
        endpoint = '/api/pool/create';
        body = {
          assetId: asset._id,
          targetAmountUSD: targetAmount,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Pool created! Participants can now join.');
        onSuccess?.();
        onClose();
      } else {
        toast.error(data.error || 'Failed to create pool');
      }
    } catch (err) {
      console.error('Failed to convert to pool:', err);
      toast.error('Failed to create pool');
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
          <FiPieChart className={styles.headerIcon} />
          <h2>Convert to Pool</h2>
          <p>Create a tokenized pool for this asset</p>
        </div>

        <div className={styles.assetInfo}>
          {asset.image && <img src={asset.image} alt={asset.title} className={styles.assetImage} />}
          <div className={styles.assetDetails}>
            <h3>{asset.title}</h3>
            {targetAmount > 0 && <p>${targetAmount.toLocaleString()}</p>}
            {asset.mintAddress && (
              <code className={styles.mintAddress}>{asset.mintAddress.slice(0, 8)}...</code>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Pool Target Value */}
          <div className={styles.field}>
            <label>Set Your Pool Target (USD)</label>
            <input
              type="number"
              value={targetAmount}
              onChange={(e) => setTargetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              min={1}
              step="0.01"
              placeholder="How much do you want to raise?"
            />
            <span className={styles.fieldHint}>
              This is how much you want to raise for your watch. You can price above market value —
              the premium is your opportunity for listing it.
            </span>
          </div>

          {/* Info Blurb */}
          <div className={styles.summaryPanel}>
            <h4>How it works</h4>
            <p className={styles.infoBlurb}>
              Your watch gets tokenized into 1 billion tokens. Anyone can buy in starting at $1.50.
              As traders buy tokens, the price rises along a bonding curve until your target is
              reached. You receive 97% when the pool fills — then ship the watch to LuxHub custody.
              The token keeps trading and generates ongoing fees for you and holders.
            </p>
          </div>

          {/* Financial Summary */}
          <div className={styles.summaryPanel}>
            <h4>Pool Summary</h4>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Pool Target</span>
                <span className={styles.summaryValue}>${targetAmount.toLocaleString()}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>You Receive (97%)</span>
                <span className={styles.summaryValueAccent}>
                  $
                  {summary.vendorPayment.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>LuxHub Fee (3%)</span>
                <span className={styles.summaryValue}>
                  $
                  {summary.luxhubFee.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? (
                <>
                  <FiLoader className={styles.spinner} />
                  Creating...
                </>
              ) : (
                <>
                  <FiPieChart />
                  Create Pool
                </>
              )}
            </button>
          </div>
        </form>

        <p className={styles.note}>
          Once created, participants can contribute to the pool. Funds are held in escrow until the
          pool fills and custody is verified.
        </p>
      </div>
    </div>
  );
};

export default ConvertToPoolModal;
