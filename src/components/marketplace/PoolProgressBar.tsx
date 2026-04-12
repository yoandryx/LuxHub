// src/components/marketplace/PoolProgressBar.tsx
// Phase 11-16: Dual progress bars for pool detail page.
// Primary bar tracks LuxHub fee funding (authoritative, drives graduation).
// Secondary bar shows Bags DBC state (informational only — independent from
// LuxHub graduation logic per CONTEXT.md).
import React from 'react';
import styles from '../../styles/PoolProgressBar.module.css';

export interface PoolProgressBarProps {
  // Bar 1: LuxHub fee funding (primary, authoritative)
  accumulatedUsd: number;
  pendingUsd?: number; // optional — shows a "pending" overlay behind the primary bar
  targetUsd: number;

  // Bar 2: Bags DBC state (informational)
  bagsDbcState?: 'PRE_LAUNCH' | 'PRE_GRAD' | 'MIGRATING' | 'MIGRATED';
  bagsDbcProgress?: number; // 0-100

  // Optional visual feedback: briefly highlight the primary bar when fees arrive
  highlightPrimary?: boolean;

  className?: string;
}

export function PoolProgressBar(props: PoolProgressBarProps) {
  const {
    accumulatedUsd,
    pendingUsd,
    targetUsd,
    bagsDbcState,
    bagsDbcProgress,
    highlightPrimary,
    className,
  } = props;

  const safeTarget = targetUsd > 0 ? targetUsd : 0;
  const primaryPct =
    safeTarget > 0 ? Math.min(100, (accumulatedUsd / safeTarget) * 100) : 0;
  const pendingPct =
    safeTarget > 0 && pendingUsd
      ? Math.min(100, ((accumulatedUsd + pendingUsd) / safeTarget) * 100)
      : primaryPct;

  const dbcPct = Math.max(0, Math.min(100, bagsDbcProgress ?? 0));

  return (
    <div className={`${styles.container} ${className || ''}`}>
      {/* Primary: LuxHub fee funding */}
      <div className={styles.primaryGroup}>
        <div className={styles.label}>
          <span className={styles.labelText}>Funding Progress</span>
          <span className={styles.amount}>
            ${accumulatedUsd.toFixed(2)} / ${safeTarget.toFixed(2)} (
            {primaryPct.toFixed(1)}%)
          </span>
        </div>
        <div className={styles.barTrack} data-testid="primary-bar-track">
          {pendingUsd ? (
            <div
              className={styles.barPending}
              style={{ width: `${pendingPct}%` }}
              data-testid="pending-overlay"
            />
          ) : null}
          <div
            className={`${styles.barPrimary} ${highlightPrimary ? styles.barPrimaryPulse : ''}`}
            style={{ width: `${primaryPct}%` }}
            data-testid="primary-bar-fill"
          />
        </div>
        {pendingUsd ? (
          <div className={styles.helper}>
            +${pendingUsd.toFixed(2)} pending fee claim
          </div>
        ) : null}
      </div>

      {/* Secondary: Bags DBC informational */}
      {bagsDbcState && (
        <div className={styles.secondaryGroup} data-testid="secondary-group">
          <div className={styles.label}>
            <span className={styles.labelText}>Bags Bonding Curve</span>
            <span className={styles.secondaryState} data-state={bagsDbcState}>
              {bagsDbcState}
            </span>
          </div>
          <div className={`${styles.barTrack} ${styles.barTrackSecondary}`}>
            <div
              className={styles.barSecondary}
              style={{ width: `${dbcPct}%` }}
            />
          </div>
          <div className={styles.helper}>
            Independent from LuxHub graduation — informational only
          </div>
        </div>
      )}
    </div>
  );
}

export default PoolProgressBar;
