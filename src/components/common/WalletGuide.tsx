// src/components/common/WalletGuide.tsx
// Component to guide new users through wallet setup

import React, { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import {
  getDetectedWallets,
  hasAnyWallet,
  getWalletOnboardingSteps,
  formatWalletAddress,
  WalletInfo,
  isMobile,
} from '../../utils/walletHelper';
import styles from '../../styles/WalletGuide.module.css';

interface WalletGuideProps {
  onConnected?: (publicKey: string) => void;
  compact?: boolean;
  showSteps?: boolean;
}

const WalletGuide: React.FC<WalletGuideProps> = ({
  onConnected,
  compact = false,
  showSteps = true,
}) => {
  const { connected, publicKey, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [hasWallet, setHasWallet] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    // Detect wallets on mount (client-side only)
    setWallets(getDetectedWallets());
    setHasWallet(hasAnyWallet());
  }, []);

  useEffect(() => {
    if (connected && publicKey && onConnected) {
      onConnected(publicKey.toBase58());
    }
  }, [connected, publicKey, onConnected]);

  const handleConnect = () => {
    setVisible(true);
  };

  const steps = getWalletOnboardingSteps();
  const detectedWallets = wallets.filter((w) => w.detected);
  const notInstalledWallets = wallets.filter((w) => !w.detected);

  // Compact version - just a connect button with status
  if (compact) {
    return (
      <div className={styles.compactContainer}>
        {connected ? (
          <div className={styles.connectedCompact}>
            <span className={styles.walletAddress}>
              {formatWalletAddress(publicKey?.toBase58() || '')}
            </span>
            <button onClick={() => disconnect()} className={styles.disconnectBtn}>
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={handleConnect} disabled={connecting} className={styles.connectBtn}>
            {connecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    );
  }

  // Connected state
  if (connected && publicKey) {
    return (
      <div className={styles.container}>
        <div className={styles.connectedCard}>
          <div className={styles.successIcon}>&#10003;</div>
          <h3>Wallet Connected</h3>
          <p className={styles.walletAddress}>{formatWalletAddress(publicKey.toBase58(), 6)}</p>
          <button onClick={() => disconnect()} className={styles.disconnectBtn}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // No wallet detected - show installation guide
  if (!hasWallet) {
    return (
      <div className={styles.container}>
        <div className={styles.guideCard}>
          <h2>Get Started with a Solana Wallet</h2>
          <p className={styles.subtitle}>
            To use LuxHub, you need a Solana wallet to securely store your assets and sign
            transactions.
          </p>

          <div className={styles.walletOptions}>
            <h3>Choose a Wallet</h3>
            <div className={styles.walletGrid}>
              {notInstalledWallets.map((wallet) => (
                <a
                  key={wallet.name}
                  href={isMobile() ? wallet.downloadUrl : wallet.chromeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.walletOption}
                >
                  <img src={wallet.icon} alt={wallet.name} className={styles.walletIcon} />
                  <span>{wallet.name}</span>
                  <span className={styles.installBadge}>Install</span>
                </a>
              ))}
            </div>
          </div>

          {showSteps && (
            <div className={styles.stepsSection}>
              <h3>Setup Steps</h3>
              <div className={styles.steps}>
                {steps.map((step, index) => (
                  <div
                    key={step.step}
                    className={`${styles.step} ${index === activeStep ? styles.activeStep : ''}`}
                    onClick={() => setActiveStep(index)}
                  >
                    <div className={styles.stepNumber}>{step.step}</div>
                    <div className={styles.stepContent}>
                      <h4>{step.title}</h4>
                      <p>{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.refreshNote}>
            <p>Already installed a wallet? </p>
            <button onClick={() => window.location.reload()} className={styles.refreshBtn}>
              Refresh Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Wallet detected but not connected
  return (
    <div className={styles.container}>
      <div className={styles.connectCard}>
        <h2>Connect Your Wallet</h2>
        <p className={styles.subtitle}>
          We detected {detectedWallets.length > 1 ? 'wallets' : 'a wallet'} installed in your
          browser.
        </p>

        <div className={styles.detectedWallets}>
          {detectedWallets.map((wallet) => (
            <div key={wallet.name} className={styles.detectedWallet}>
              <img src={wallet.icon} alt={wallet.name} className={styles.walletIcon} />
              <span>{wallet.name}</span>
              <span className={styles.detectedBadge}>Detected</span>
            </div>
          ))}
        </div>

        <button onClick={handleConnect} disabled={connecting} className={styles.connectBtnLarge}>
          {connecting ? (
            <>
              <span className={styles.spinner}></span>
              Connecting...
            </>
          ) : (
            'Connect Wallet'
          )}
        </button>

        <p className={styles.securityNote}>
          LuxHub will never ask for your private keys or recovery phrase.
        </p>
      </div>
    </div>
  );
};

export default WalletGuide;
