// src/components/common/MobileDrawer.tsx - Mobile navigation drawer
import React, { useEffect, useCallback, memo } from 'react';
import Link from 'next/link';
import {
  FaTimes,
  FaWallet,
  FaSignOutAlt,
  FaStore,
  FaSwimmingPool,
  FaUsers,
  FaInfoCircle,
} from 'react-icons/fa';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import RoleNavItems from './RoleNavItems';
import styles from '@/styles/MobileDrawer.module.css';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: number | null;
}

// Role badge component
const RoleBadge = memo(function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'browser') return null;

  const labels: Record<UserRole, string> = {
    admin: 'Admin',
    vendor: 'Vendor',
    user: 'User',
    browser: '',
  };

  return <span className={`${styles.roleBadge} ${styles[role]}`}>{labels[role]}</span>;
});

function MobileDrawer({ isOpen, onClose, balance }: MobileDrawerProps) {
  // Hooks
  const { login, logout } = usePrivy();
  const { disconnect } = useWallet();
  const { role, isConnected, walletAddress, displayAddress, vendorProfile, isLoading } =
    useUserRole();

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      await logout();
      onClose();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [disconnect, logout, onClose]);

  // Handle connect
  const handleConnect = useCallback(() => {
    login();
    onClose();
  }, [login, onClose]);

  // Handle link click
  const handleLinkClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const displayName = vendorProfile?.username || vendorProfile?.name || displayAddress;

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.overlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={`${styles.drawer} ${isOpen ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.headerTitle}>Menu</span>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close menu">
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isConnected ? (
            <>
              {/* Profile Section */}
              <div className={styles.profileSection}>
                <div className={styles.avatar}>
                  {vendorProfile?.avatarUrl ? (
                    <img src={vendorProfile.avatarUrl} alt="Profile" />
                  ) : (
                    <FaWallet className={styles.avatarFallback} />
                  )}
                </div>
                <div className={styles.profileInfo}>
                  <span className={styles.username}>{displayName}</span>
                  <span className={styles.walletAddress}>{displayAddress}</span>
                  <RoleBadge role={role} />
                </div>
              </div>

              {/* Balance Section */}
              {balance !== null && balance !== undefined && (
                <div className={styles.balanceSection}>
                  <span className={styles.balance}>{balance.toFixed(4)}</span>
                  <span className={styles.balanceLabel}>SOL</span>
                </div>
              )}

              {/* Primary Navigation Links */}
              <div className={styles.primaryLinks}>
                <div className={styles.sectionHeader}>Marketplace</div>
                <Link href="/marketplace" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaStore className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Marketplace</span>
                </Link>
                <Link href="/pools" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaSwimmingPool className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Investment Pools</span>
                </Link>
                <Link href="/vendors" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaUsers className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Vendors</span>
                </Link>
                <Link href="/learnMore" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaInfoCircle className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Learn More</span>
                </Link>
              </div>

              {/* Role-Based Navigation */}
              {isLoading ? (
                <div className={styles.loading}>
                  <div className={styles.spinner} />
                </div>
              ) : (
                <div className={styles.navSection}>
                  <div className={styles.sectionHeader}>Account</div>
                  <RoleNavItems
                    role={role}
                    walletAddress={walletAddress}
                    onItemClick={handleLinkClick}
                  />
                </div>
              )}
            </>
          ) : (
            /* Connect CTA */
            <div className={styles.connectCta}>
              <FaWallet className={styles.connectIcon} />
              <p className={styles.connectText}>
                Connect your wallet to access the full LuxHub experience - browse, buy, and manage
                luxury assets.
              </p>
              <button className={styles.connectButton} onClick={handleConnect}>
                <FaWallet />
                <span>Connect Wallet</span>
              </button>

              {/* Primary Links for non-connected users */}
              <div className={styles.primaryLinks} style={{ marginTop: 24, width: '100%' }}>
                <Link href="/marketplace" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaStore className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Marketplace</span>
                </Link>
                <Link href="/pools" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaSwimmingPool className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Pools</span>
                </Link>
                <Link href="/vendors" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaUsers className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Vendors</span>
                </Link>
                <Link href="/learnMore" className={styles.primaryLink} onClick={handleLinkClick}>
                  <FaInfoCircle className={styles.primaryLinkIcon} />
                  <span className={styles.primaryLinkLabel}>Learn More</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Disconnect Button */}
        {isConnected && (
          <div className={styles.footer}>
            <button className={styles.disconnectButton} onClick={handleDisconnect}>
              <FaSignOutAlt />
              <span>Disconnect Wallet</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export default memo(MobileDrawer);
