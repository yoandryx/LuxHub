// src/components/vendor/ConvertToPoolModal.tsx
// Modal for vendors to convert an asset/escrow listing into a tokenized pool
import React, { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import styles from '../../styles/ConvertToPoolModal.module.css';
import { HiOutlineX } from 'react-icons/hi';
import { FiPieChart, FiLoader, FiShield } from 'react-icons/fi';
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
    brand?: string;
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
      // Phase 11 (11-18): /api/pool/convert-from-escrow was deleted as a
      // phase 8 orphan (liquidityModel/AMM model). All pool creation now
      // routes through /api/pool/create. The `escrowPda` is still passed
      // so the pool can be linked back to its backing escrow.
      const endpoint = '/api/pool/create';
      const body: Record<string, unknown> = {
        assetId: asset._id,
        targetAmountUSD: targetAmount,
      };
      if (asset.escrowPda) {
        body.escrowPda = asset.escrowPda;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': wallet.publicKey.toBase58(),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Pool created! Participants can now contribute.');
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

        {/* Header — compact */}
        <div className={styles.header}>
          <div className={styles.headerIconWrap}>
            <FiPieChart className={styles.headerIcon} />
          </div>
          <div>
            <h2 className={styles.title}>Create Pool</h2>
            <p className={styles.subtitle}>Tokenize for community participation</p>
          </div>
        </div>

        {/* Asset Preview — inline */}
        <div className={styles.assetCard}>
          {asset.image && <img src={asset.image} alt={asset.title} className={styles.assetImage} />}
          <div className={styles.assetDetails}>
            {asset.brand && <span className={styles.assetBrand}>{asset.brand}</span>}
            <h3 className={styles.assetTitle}>{asset.title}</h3>
          </div>
          {asset.mintAddress && (
            <code className={styles.mintAddress}>
              {asset.mintAddress.slice(0, 4)}...{asset.mintAddress.slice(-4)}
            </code>
          )}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Target Input */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Pool Target (USD)</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputPrefix}>$</span>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                min={1}
                step="0.01"
                className={styles.input}
              />
            </div>
          </div>

          {/* Summary — compact 2-column */}
          <div className={styles.summaryPanel}>
            <div className={styles.summaryRow}>
              <div className={styles.summaryCell}>
                <span className={styles.summaryLabel}>You Receive</span>
                <span className={styles.summaryValueAccent}>
                  $
                  {summary.vendorPayment.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className={styles.summaryMeta}>97% of target</span>
              </div>
              <div className={styles.summaryCell}>
                <span className={styles.summaryLabel}>Platform Fee</span>
                <span className={styles.summaryValue}>
                  $
                  {summary.luxhubFee.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className={styles.summaryMeta}>3% total</span>
              </div>
            </div>
            <div className={styles.tokenRow}>
              <span className={styles.tokenTag}>1B tokens</span>
              <span className={styles.tokenDetail}>Bonding curve · $1.50 min buy-in</span>
            </div>
          </div>

          {/* Actions */}
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

        {/* Escrow notice — single line */}
        <div className={styles.escrowNotice}>
          <FiShield className={styles.escrowIcon} />
          <span>Protected by on-chain escrow. Participants can exit before pool fills.</span>
        </div>
      </div>
    </div>
  );
};

export default ConvertToPoolModal;
