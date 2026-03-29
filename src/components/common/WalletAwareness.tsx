import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useEffectiveWallet } from '../../hooks/useEffectiveWallet';
import { FiTag, FiPackage, FiGrid, FiTrendingUp, FiCheck } from 'react-icons/fi';
import styles from '../../styles/WalletAwareness.module.css';

const DISMISS_KEY = 'wallet-awareness-dismissed';

const WalletAwareness: React.FC = () => {
  const { connected, publicKey } = useEffectiveWallet();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === 'true') {
        setDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  // Client-side only, no SSR to avoid hydration mismatch
  if (!mounted || !connected || dismissed) {
    return null;
  }

  const walletAddress = publicKey?.toBase58() || '';

  const capabilities = [
    {
      icon: FiTag,
      title: 'Make Offers',
      desc: 'Bid on luxury watches',
      href: '/marketplace',
    },
    {
      icon: FiPackage,
      title: 'Track Orders',
      desc: 'Monitor your purchases',
      href: '/orders',
    },
    {
      icon: FiGrid,
      title: 'Your Portfolio',
      desc: 'View your NFT holdings',
      href: `/user/${walletAddress}`,
    },
    {
      icon: FiTrendingUp,
      title: 'Join Pools',
      desc: 'Co-own premium assets',
      href: '/pools',
    },
  ];

  return (
    <div className={styles.container}>
      <motion.div
        className={styles.banner}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <FiCheck className={styles.checkIcon} />
            You&apos;re connected
          </div>
          <p className={styles.headerSub}>Here&apos;s what you can do now</p>
        </div>

        <div className={styles.cards}>
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <Link key={cap.title} href={cap.href} className={styles.card}>
                <div className={styles.cardIcon}>
                  <Icon />
                </div>
                <div className={styles.cardTitle}>{cap.title}</div>
                <div className={styles.cardDesc}>{cap.desc}</div>
              </Link>
            );
          })}
        </div>

        <button className={styles.dismiss} onClick={handleDismiss} type="button">
          Got it, don&apos;t show again
        </button>
      </motion.div>
    </div>
  );
};

export default WalletAwareness;
