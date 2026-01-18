// components/common/Fallback.tsx
import React from 'react';
import styles from '../../styles/Fallback.module.css'; // Adjust path if needed

const Fallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  return (
    <div className={styles.container}>
      <div className={styles.content}>

        {/* Luxury glowing orb animation – inspired by premium watch dial reflections */}
        <div className={styles.orbWrapper}>
          <div className={styles.orbOuterGlow}></div>
          <div className={styles.orbPulse}></div>
          <div className={styles.orb}>
            <div className={styles.orbInnerShadow}></div>
            <div className={styles.shine}></div>
            <div className={styles.shineSecondary}></div>
          </div>
        </div>

        <div className={styles.textContent}>
          <h1 className={styles.title}>Oops</h1>
          
          <p className={styles.message}>
            Something went wrong while loading this page.<br />
            Our team has been notified.
          </p>

          {process.env.NODE_ENV === 'development' && (
            <details className={styles.devDetails}>
              <summary className={styles.devSummary}>Error details (dev only)</summary>
              <pre className={styles.devPre}>{error.message}</pre>
            </details>
          )}

          <button
            onClick={resetErrorBoundary}
            className={styles.tryAgainButton}
          >
            Try Again
          </button>

          <p className={styles.homeLinkWrapper}>
            <a href="/" className={styles.homeLink}>
              Return to homepage
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export { Fallback };