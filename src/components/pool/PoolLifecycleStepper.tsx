// src/components/pool/PoolLifecycleStepper.tsx
// Phase 11-16: 8-state lifecycle stepper based on Pool.tokenStatus canonical enum
// (phase 11). This supersedes the legacy 6-stage LifecycleStepper for pool detail
// pages. Terminal states (aborted) render differently.
//
// Canonical order:
//   pending -> minted -> funding -> graduated -> custody ->
//     resale_listed -> resold -> distributed
//
// Off-path terminal states:
//   aborted                — pool was cancelled (refund flow)
//   partial_distributed    — some holders have claimed, shown between resold and distributed
//   resale_unlisted        — admin delisted a resale; returns to custody
import React from 'react';
import {
  FaClock,
  FaCoins,
  FaChartLine,
  FaCheckCircle,
  FaWarehouse,
  FaStoreAlt,
  FaHandHoldingUsd,
  FaUsers,
  FaBan,
} from 'react-icons/fa';
import styles from '../../styles/PoolLifecycleStepper.module.css';

export type PoolTokenStatus =
  | 'pending'
  | 'minted'
  | 'funding'
  | 'graduated'
  | 'custody'
  | 'resale_listed'
  | 'resold'
  | 'distributed'
  | 'aborted'
  | 'resale_unlisted'
  | 'partial_distributed';

const CANONICAL_STAGES = [
  { key: 'pending', label: 'Pending', icon: FaClock },
  { key: 'minted', label: 'Minted', icon: FaCoins },
  { key: 'funding', label: 'Funding', icon: FaChartLine },
  { key: 'graduated', label: 'Graduated', icon: FaCheckCircle },
  { key: 'custody', label: 'Custody', icon: FaWarehouse },
  { key: 'resale_listed', label: 'Listed', icon: FaStoreAlt },
  { key: 'resold', label: 'Resold', icon: FaHandHoldingUsd },
  { key: 'distributed', label: 'Distributed', icon: FaUsers },
] as const;

/**
 * Map a canonical token status to its index on the 8-node stepper.
 * Off-path states get mapped to the closest canonical state for visual display.
 */
function canonicalIndex(tokenStatus: PoolTokenStatus): number {
  switch (tokenStatus) {
    // Off-path → map to nearest canonical
    case 'resale_unlisted':
      return CANONICAL_STAGES.findIndex((s) => s.key === 'custody');
    case 'partial_distributed':
      // visually between resold and distributed — treat as resold + active transitioning
      return CANONICAL_STAGES.findIndex((s) => s.key === 'resold');
    default:
      return CANONICAL_STAGES.findIndex((s) => s.key === tokenStatus);
  }
}

export interface PoolLifecycleStepperProps {
  currentState: PoolTokenStatus;
  className?: string;
}

export const PoolLifecycleStepper: React.FC<PoolLifecycleStepperProps> = ({
  currentState,
  className,
}) => {
  // Terminal off-canonical path: aborted
  if (currentState === 'aborted') {
    return (
      <div
        className={`${styles.container} ${styles.containerAborted} ${className || ''}`}
        data-testid="pool-lifecycle-stepper-aborted"
      >
        <div className={styles.abortedBox}>
          <FaBan size={14} className={styles.abortedIcon} />
          <div>
            <div className={styles.abortedLabel}>Pool Aborted</div>
            <div className={styles.abortedHelper}>
              Funding cancelled — holders eligible for refund distribution.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentIndex = canonicalIndex(currentState);
  const isPartial = currentState === 'partial_distributed';

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      data-testid="pool-lifecycle-stepper"
    >
      <div className={styles.stepper}>
        {CANONICAL_STAGES.map((stage, i) => {
          const isCompleted = i < currentIndex || (isPartial && stage.key === 'resold');
          const isCurrent = i === currentIndex && !isPartial;
          const isFuture = i > currentIndex;

          const stageClasses = [
            styles.stage,
            isCompleted
              ? styles.stageCompleted
              : isCurrent
                ? styles.stageCurrent
                : styles.stageFuture,
          ].join(' ');

          return (
            <React.Fragment key={stage.key}>
              {i > 0 && (
                <div
                  className={`${styles.line} ${
                    isCompleted || isCurrent ? styles.lineCompleted : styles.lineFuture
                  }`}
                />
              )}
              <div className={stageClasses} data-stage={stage.key}>
                <div className={styles.dot}>
                  {isCurrent && <div className={styles.glowRing} />}
                </div>
                <span
                  className={`${styles.label} ${
                    isFuture ? styles.labelMuted : ''
                  } ${isCurrent ? styles.labelActive : ''}`}
                >
                  {stage.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Extra footer banner for partial_distributed */}
      {isPartial && (
        <div className={styles.partialBanner}>
          Partial distribution in progress — some holders have claimed.
        </div>
      )}
    </div>
  );
};

export { CANONICAL_STAGES };
export default PoolLifecycleStepper;
