// src/components/pool/PositionSummary.tsx
// YOUR POSITION card showing token balance, ownership %, P&L (D-14)
import React from 'react';
import { FaArrowRight } from 'react-icons/fa';
import styles from '../../styles/PoolDetailV2.module.css';

interface PositionSummaryProps {
  tokenBalance: number;
  ownershipPercent: number;
  costBasis: number;
  currentValue: number;
  poolStatus: string;
}

export const PositionSummary: React.FC<PositionSummaryProps> = ({
  tokenBalance,
  ownershipPercent,
  costBasis,
  currentValue,
  poolStatus,
}) => {
  // Show CTA if no tokens and pool is open/funded
  if (tokenBalance <= 0) {
    if (poolStatus === 'open' || poolStatus === 'funded') {
      return (
        <div className={styles.positionCard}>
          <h3 className={styles.positionTitle}>Your Position</h3>
          <div className={styles.positionCta}>
            <span>Join this pool</span>
            <FaArrowRight size={12} />
          </div>
        </div>
      );
    }
    return null;
  }

  const pnlUsd = currentValue - costBasis;
  const pnlPercent = costBasis > 0 ? ((currentValue - costBasis) / costBasis) * 100 : 0;
  const isPositive = pnlUsd >= 0;

  return (
    <div className={styles.positionCard}>
      <h3 className={styles.positionTitle}>Your Position</h3>
      <div className={styles.positionGrid}>
        <div className={styles.positionField}>
          <span className={styles.positionLabel}>Token Balance</span>
          <span className={styles.positionValueMono}>
            {tokenBalance.toLocaleString()}
          </span>
        </div>
        <div className={styles.positionField}>
          <span className={styles.positionLabel}>Ownership</span>
          <span className={styles.positionValue}>
            {ownershipPercent.toFixed(2)}%
          </span>
        </div>
        <div className={styles.positionField}>
          <span className={styles.positionLabel}>Cost Basis</span>
          <span className={styles.positionValue}>
            ${costBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.positionField}>
          <span className={styles.positionLabel}>Current Value</span>
          <span className={styles.positionValue}>
            ${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.positionField}>
          <span className={styles.positionLabel}>P&L</span>
          <span
            className={isPositive ? styles.pnlPositive : styles.pnlNegative}
          >
            {isPositive ? '+' : ''}${pnlUsd.toFixed(2)} ({isPositive ? '+' : ''}
            {pnlPercent.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
};

export default PositionSummary;
