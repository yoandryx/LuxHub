// src/components/pool/LifecycleStepper.tsx
// Horizontal lifecycle stepper showing 6 pool stages (D-12, UI-03)
import React from 'react';
import {
  FaRocket,
  FaChartLine,
  FaCheckCircle,
  FaExchangeAlt,
  FaMoneyBillWave,
  FaUsers,
} from 'react-icons/fa';
import styles from '../../styles/LifecycleStepper.module.css';

const LIFECYCLE_STAGES = [
  { key: 'launch', label: 'Launch', icon: FaRocket },
  { key: 'funding', label: 'Funding', icon: FaChartLine },
  { key: 'graduated', label: 'Graduated', icon: FaCheckCircle },
  { key: 'trading', label: 'Trading', icon: FaExchangeAlt },
  { key: 'resale', label: 'Resale', icon: FaMoneyBillWave },
  { key: 'distributed', label: 'Distributed', icon: FaUsers },
] as const;

type LifecycleStageKey = (typeof LIFECYCLE_STAGES)[number]['key'];

/**
 * Maps a pool's data to the current lifecycle stage key.
 */
export function getLifecycleStage(pool: {
  status?: string;
  graduated?: boolean;
  distributionStatus?: string;
  bondingCurveActive?: boolean;
}): LifecycleStageKey {
  const status = pool.status || '';
  const distStatus = pool.distributionStatus || '';

  // Distributed / closed
  if (['closed', 'distributed'].includes(status) || distStatus === 'executed') {
    return 'distributed';
  }

  // Resale / distributing
  if (['sold', 'distributing'].includes(status) || ['proposed', 'approved'].includes(distStatus)) {
    return 'resale';
  }

  // Trading (post-graduation, in custody or listed)
  if (['listed', 'active', 'custody'].includes(status)) {
    return 'trading';
  }

  // Graduated
  if (pool.graduated === true) {
    return 'graduated';
  }

  // Funding (bonding curve active)
  if (['open', 'filled', 'funded'].includes(status)) {
    return 'funding';
  }

  // Default: launch
  return 'launch';
}

interface LifecycleStepperProps {
  currentStage: LifecycleStageKey;
  graduated?: boolean;
}

export const LifecycleStepper: React.FC<LifecycleStepperProps> = ({ currentStage }) => {
  const currentIndex = LIFECYCLE_STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className={styles.container}>
      <div className={styles.stepper}>
        {LIFECYCLE_STAGES.map((stage, i) => {
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <React.Fragment key={stage.key}>
              {/* Connecting line before (skip first) */}
              {i > 0 && (
                <div
                  className={`${styles.line} ${isCompleted || isCurrent ? styles.lineCompleted : styles.lineFuture}`}
                />
              )}

              {/* Stage dot + label */}
              <div
                className={`${styles.stage} ${
                  isCompleted
                    ? styles.stageCompleted
                    : isCurrent
                      ? styles.stageCurrent
                      : styles.stageFuture
                }`}
              >
                <div className={styles.dot}>
                  {isCurrent && <div className={styles.glowRing} />}
                </div>
                <span
                  className={`${styles.label} ${isFuture ? styles.labelMuted : ''} ${isCurrent ? styles.labelActive : ''}`}
                >
                  {stage.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export { LIFECYCLE_STAGES };
export type { LifecycleStageKey };
export default LifecycleStepper;
