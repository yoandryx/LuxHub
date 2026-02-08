// src/components/vendor/ConvertToPoolModal.tsx
// Modal for vendors to convert an asset/escrow listing into a fractional ownership pool
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

type LiquidityModel = 'p2p' | 'amm' | 'hybrid';

const ConvertToPoolModal: React.FC<ConvertToPoolModalProps> = ({ asset, onClose, onSuccess }) => {
  const wallet = useWallet();
  const [totalShares, setTotalShares] = useState(100);
  const [minBuyInUSD, setMinBuyInUSD] = useState(50);
  const [maxInvestors, setMaxInvestors] = useState(100);
  const [liquidityModel, setLiquidityModel] = useState<LiquidityModel>('p2p');
  const [ammLiquidityPercent, setAmmLiquidityPercent] = useState(30);
  const [submitting, setSubmitting] = useState(false);

  const targetAmount = asset.priceUSD || 0;

  const summary = useMemo(() => {
    const sharePrice = totalShares > 0 ? targetAmount / totalShares : 0;
    const luxhubFee = targetAmount * 0.03;
    let vendorPercent = 97;
    let ammAmount = 0;

    if (liquidityModel === 'amm' || liquidityModel === 'hybrid') {
      vendorPercent = 100 - ammLiquidityPercent - 3;
      ammAmount = targetAmount * (ammLiquidityPercent / 100);
    }

    const vendorPayment = targetAmount * (vendorPercent / 100);

    return { sharePrice, luxhubFee, vendorPercent, vendorPayment, ammAmount };
  }, [targetAmount, totalShares, liquidityModel, ammLiquidityPercent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!wallet.publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (totalShares <= 0) {
      toast.error('Total shares must be positive');
      return;
    }

    if (minBuyInUSD <= 0) {
      toast.error('Minimum buy-in must be positive');
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
          totalShares,
          minBuyInUSD,
          maxInvestors,
          liquidityModel,
          ammLiquidityPercent: liquidityModel !== 'p2p' ? ammLiquidityPercent : 0,
        };
      } else {
        endpoint = '/api/pool/create';
        body = {
          assetId: asset._id,
          vendorWallet: wallet.publicKey.toBase58(),
          targetAmountUSD: targetAmount,
          totalShares,
          sharePriceUSD: summary.sharePrice,
          minBuyInUSD,
          maxInvestors,
          liquidityModel,
          ammLiquidityPercent: liquidityModel !== 'p2p' ? ammLiquidityPercent : 0,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        toast.success('Pool created! Investors can now buy shares.');
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
          <p>Create a fractional ownership pool for this asset</p>
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
          {/* Configuration Grid */}
          <div className={styles.configGrid}>
            <div className={styles.field}>
              <label>Total Shares</label>
              <input
                type="number"
                value={totalShares}
                onChange={(e) => setTotalShares(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
              />
            </div>
            <div className={styles.field}>
              <label>Min Buy-in (USD)</label>
              <input
                type="number"
                value={minBuyInUSD}
                onChange={(e) => setMinBuyInUSD(Math.max(1, parseFloat(e.target.value) || 1))}
                min={1}
                step="0.01"
              />
            </div>
            <div className={styles.field}>
              <label>Max Investors</label>
              <input
                type="number"
                value={maxInvestors}
                onChange={(e) => setMaxInvestors(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
              />
            </div>
          </div>

          {/* Liquidity Model */}
          <div className={styles.field}>
            <label>Liquidity Model</label>
            <div className={styles.liquidityToggle}>
              <button
                type="button"
                className={`${styles.liquidityBtn} ${liquidityModel === 'p2p' ? styles.selected : ''}`}
                onClick={() => setLiquidityModel('p2p')}
              >
                <strong>P2P</strong>
                <span>Peer-to-peer trading</span>
              </button>
              <button
                type="button"
                className={`${styles.liquidityBtn} ${liquidityModel === 'amm' ? styles.selected : ''}`}
                onClick={() => setLiquidityModel('amm')}
              >
                <strong>AMM</strong>
                <span>Auto market maker</span>
              </button>
              <button
                type="button"
                className={`${styles.liquidityBtn} ${liquidityModel === 'hybrid' ? styles.selected : ''}`}
                onClick={() => setLiquidityModel('hybrid')}
              >
                <strong>Hybrid</strong>
                <span>P2P + AMM liquidity</span>
              </button>
            </div>
          </div>

          {/* AMM Liquidity % - only for AMM/Hybrid */}
          {(liquidityModel === 'amm' || liquidityModel === 'hybrid') && (
            <div className={styles.field}>
              <label>AMM Liquidity: {ammLiquidityPercent}%</label>
              <input
                type="range"
                className={styles.rangeSlider}
                min={10}
                max={50}
                value={ammLiquidityPercent}
                onChange={(e) => setAmmLiquidityPercent(parseInt(e.target.value))}
              />
              <div className={styles.rangeLabels}>
                <span>10%</span>
                <span>50%</span>
              </div>
            </div>
          )}

          {/* Financial Summary */}
          <div className={styles.summaryPanel}>
            <h4>Financial Summary</h4>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Target Amount</span>
                <span className={styles.summaryValue}>${targetAmount.toLocaleString()}</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>Share Price</span>
                <span className={styles.summaryValue}>
                  $
                  {summary.sharePrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>
                  Vendor Payment ({summary.vendorPercent}%)
                </span>
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
              {summary.ammAmount > 0 && (
                <div className={styles.summaryItem}>
                  <span className={styles.summaryLabel}>
                    AMM Liquidity ({ammLiquidityPercent}%)
                  </span>
                  <span className={styles.summaryValue}>
                    $
                    {summary.ammAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
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
          Once created, investors can purchase shares. Funds are held in escrow until the pool fills
          and custody is verified.
        </p>
      </div>
    </div>
  );
};

export default ConvertToPoolModal;
