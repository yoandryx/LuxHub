import React from 'react';
import styles from '../../styles/Fallback.module.css';

const Fallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) => {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrap}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c8a1ff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.message}>An unexpected error occurred. Please try again.</p>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <pre className={styles.devPre}>{error.message}</pre>
        )}

        <div className={styles.actions}>
          <button onClick={resetErrorBoundary} className={styles.retryBtn}>
            Try again
          </button>
          <a href="/" className={styles.homeLink}>
            Go home
          </a>
        </div>
      </div>
    </div>
  );
};

export { Fallback };
