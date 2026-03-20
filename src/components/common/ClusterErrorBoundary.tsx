// src/components/common/ClusterErrorBoundary.tsx
// Chrome glass error boundary that catches [LuxHub] cluster config errors
// and renders a themed error page instead of a raw Next.js crash.

import React, { Component, ErrorInfo, ReactNode } from 'react';
import styles from '../../styles/ClusterError.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ClusterErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State | null {
    // Only catch [LuxHub] configuration errors
    if (error.message.startsWith('[LuxHub]')) {
      return { hasError: true, errorMessage: error.message };
    }
    // Re-throw non-LuxHub errors so they propagate to the outer ErrorBoundary
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (error.message.startsWith('[LuxHub]')) {
      console.error('[LuxHub] Cluster configuration error:', error.message);
      console.error('[LuxHub] Component stack:', errorInfo?.componentStack);
    } else {
      // Re-throw non-LuxHub errors
      throw error;
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <div className={styles.card}>
            <div className={styles.header}>
              {}
              <img src="/images/purpleLGG.png" alt="LuxHub" className={styles.logo} />
              <h1 className={styles.title}>LuxHub</h1>
              <p className={styles.subtitle}>Decentralized Luxury Marketplace</p>
            </div>

            <div className={styles.errorIcon}>
              <span role="img" aria-label="warning">
                &#9888;
              </span>
            </div>

            <h2 className={styles.heading}>Configuration Required</h2>

            <p className={styles.message}>{this.state.errorMessage.replace('[LuxHub] ', '')}</p>

            <div className={styles.instructions}>
              <p className={styles.instructionsTitle}>Required Environment Variables</p>
              <div className={styles.codeBlock}>
                <span className={styles.envVar}>NEXT_PUBLIC_SOLANA_NETWORK</span>=devnet{'\n'}
                <span className={styles.envVar}>NEXT_PUBLIC_SOLANA_ENDPOINT</span>
                =https://devnet.helius-rpc.com/?api-key=YOUR_KEY
              </div>
            </div>

            <div className={styles.instructions}>
              <p className={styles.instructionsTitle}>Setup Steps</p>
              <div className={styles.codeBlock}>
                1. Copy .env.example to .env.local{'\n'}
                2. Get a free RPC key from Helius{'\n'}
                3. Set NEXT_PUBLIC_SOLANA_NETWORK{'\n'}
                4. Set NEXT_PUBLIC_SOLANA_ENDPOINT{'\n'}
                5. Restart the dev server
              </div>
            </div>

            <div className={styles.footer}>
              <a
                href="https://www.helius.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Get a free Helius RPC key &rarr;
              </a>
              <p className={styles.footerText}>
                LuxHub requires a Solana RPC endpoint to connect to the blockchain.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ClusterErrorBoundary;
