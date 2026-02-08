// src/components/common/UserMenuDropdown.tsx - Refined user profile dropdown
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  FaWallet,
  FaCopy,
  FaCheck,
  FaSignOutAlt,
  FaChevronDown,
  FaExternalLinkAlt,
  FaCreditCard,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import RoleNavItems from './RoleNavItems';
import styles from '@/styles/UserMenuDropdown.module.css';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? 'https://api.devnet.solana.com';
const explorerUrl = endpoint.includes('devnet')
  ? 'https://explorer.solana.com/address/'
  : 'https://solscan.io/account/';

interface UserMenuDropdownProps {
  className?: string;
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

// Avatar component
const Avatar = memo(function Avatar({
  src,
  large = false,
}: {
  src?: string | null;
  large?: boolean;
}) {
  return (
    <div className={`${styles.avatar} ${large ? styles.avatarLarge : ''}`}>
      {src ? <img src={src} alt="Profile" /> : <FaWallet className={styles.avatarFallback} />}
    </div>
  );
});

function UserMenuDropdown({ className = '' }: UserMenuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { logout } = usePrivy();
  const { disconnect } = useWallet();
  const { connection } = useConnection();
  const { role, isConnected, walletAddress, displayAddress, vendorProfile, isLoading } =
    useUserRole();

  // Client-side rendering check
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch balance when dropdown opens
  useEffect(() => {
    const fetchBalance = async () => {
      if (!walletAddress || !isOpen) return;

      try {
        const publicKey = await import('@solana/web3.js').then(
          ({ PublicKey }) => new PublicKey(walletAddress)
        );
        const bal = await connection.getBalance(publicKey);
        setBalance(bal / LAMPORTS_PER_SOL);
      } catch (err) {
        console.error('Failed to fetch balance:', err);
        setBalance(null);
      }
    };

    fetchBalance();
  }, [walletAddress, isOpen, connection]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Copy address to clipboard
  const handleCopyAddress = useCallback(async () => {
    if (!walletAddress) return;

    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  }, [walletAddress]);

  // Open explorer
  const handleExplorer = useCallback(() => {
    if (!walletAddress) return;
    window.open(`${explorerUrl}${walletAddress}?cluster=devnet`, '_blank', 'noopener,noreferrer');
  }, [walletAddress]);

  // Open fund page
  const handleFund = useCallback(() => {
    window.open('https://buy.moonpay.com/?defaultCurrencyCode=sol', '_blank');
  }, []);

  // Disconnect wallet
  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect();
      await logout();
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [disconnect, logout]);

  // Close dropdown on navigation
  const handleNavClick = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Handle connect (Privy login)
  const { login } = usePrivy();
  const handleConnect = useCallback(() => {
    login();
  }, [login]);

  if (!isClient) {
    return null;
  }

  const displayName = vendorProfile?.username
    ? `@${vendorProfile.username}`
    : vendorProfile?.name || displayAddress;

  return (
    <div ref={dropdownRef} className={`${styles.container} ${className}`}>
      {/* Trigger Button */}
      <button
        className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {isConnected ? (
          <>
            <Avatar src={vendorProfile?.avatarUrl} />
            <span className={styles.addressText}>{displayAddress}</span>
            <FaChevronDown className={`${styles.chevron} ${isOpen ? styles.open : ''}`} />
          </>
        ) : (
          <>
            <FaWallet className={styles.walletIcon} />
            <span>Connect</span>
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={styles.dropdown} role="menu">
          {isConnected ? (
            <>
              {/* Identity Header */}
              <div className={styles.identityHeader}>
                <div className={styles.identityRow}>
                  <Avatar src={vendorProfile?.avatarUrl} large />
                  <div className={styles.identityInfo}>
                    <span className={styles.username}>{displayName}</span>
                    <RoleBadge role={role} />
                  </div>
                </div>
              </div>

              {/* Wallet + Balance Section */}
              <div className={styles.walletPanel}>
                <div className={styles.balanceRow}>
                  <div className={styles.balanceDisplay}>
                    <SiSolana className={styles.solIcon} />
                    <span className={styles.balance}>
                      {balance !== null ? balance.toFixed(4) : '—'}
                    </span>
                    <span className={styles.balanceLabel}>SOL</span>
                  </div>
                </div>
                <div className={styles.walletAddressRow}>
                  <span className={styles.walletAddress}>{walletAddress}</span>
                </div>
                <div className={styles.walletTools}>
                  <button
                    className={`${styles.toolButton} ${copied ? styles.copied : ''}`}
                    onClick={handleCopyAddress}
                    title="Copy address"
                  >
                    {copied ? <FaCheck /> : <FaCopy />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    className={styles.toolButton}
                    onClick={handleExplorer}
                    title="View on Explorer"
                  >
                    <FaExternalLinkAlt />
                    <span>Explorer</span>
                  </button>
                  <button className={styles.toolButton} onClick={handleFund} title="Buy SOL">
                    <FaCreditCard />
                    <span>Fund</span>
                  </button>
                </div>
              </div>

              {/* Navigation Section */}
              {isLoading ? (
                <div className={styles.loading}>
                  <div className={styles.spinner} />
                </div>
              ) : (
                <RoleNavItems
                  role={role}
                  walletAddress={walletAddress}
                  onItemClick={handleNavClick}
                />
              )}

              {/* Disconnect Button */}
              <div className={styles.disconnectSection}>
                <button className={styles.disconnectButton} onClick={handleDisconnect}>
                  <FaSignOutAlt />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            /* Connect CTA */
            <div className={styles.connectCta}>
              <div className={styles.connectIcon}>
                <FaWallet />
              </div>
              <p className={styles.connectTitle}>Connect Wallet</p>
              <p className={styles.connectText}>Access orders, investments, and your collection.</p>
              <button className={styles.connectButton} onClick={handleConnect}>
                <FaWallet />
                <span>Connect Wallet</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(UserMenuDropdown);
