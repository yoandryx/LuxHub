// src/components/common/UserMenuDropdown.tsx - Compact user menu dropdown
import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import Link from 'next/link';
import {
  FaWallet,
  FaCopy,
  FaCheck,
  FaSignOutAlt,
  FaChevronDown,
  FaExternalLinkAlt,
  FaGem,
  FaChartLine,
  FaUsers,
  FaShoppingBag,
  FaUser,
  FaStore,
  FaPlus,
  FaUserShield,
  FaClock,
  FaCog,
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';
import { usePrivy } from '@privy-io/react-auth';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useUserRole, UserRole } from '@/hooks/useUserRole';
import styles from '@/styles/UserMenuDropdown.module.css';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? 'https://api.devnet.solana.com';
const explorerUrl = endpoint.includes('devnet')
  ? 'https://explorer.solana.com/address/'
  : 'https://solscan.io/account/';

interface UserMenuDropdownProps {
  className?: string;
}

// Role badge
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

function UserMenuDropdown({ className = '' }: UserMenuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isClient, setIsClient] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { logout } = usePrivy();
  const { disconnect } = useWallet();
  const { connection } = useConnection();
  const { role, isConnected, walletAddress, displayAddress, vendorProfile } = useUserRole();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch balance when dropdown opens
  useEffect(() => {
    if (!walletAddress || !isOpen) return;
    (async () => {
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const bal = await connection.getBalance(new PublicKey(walletAddress));
        setBalance(bal / LAMPORTS_PER_SOL);
      } catch {
        setBalance(null);
      }
    })();
  }, [walletAddress, isOpen, connection]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const handleDisconnect = useCallback(async () => {
    await disconnect().catch(() => {});
    await logout().catch(() => {});
    setIsOpen(false);
  }, [disconnect, logout]);

  const close = useCallback(() => setIsOpen(false), []);

  const { login, ready: privyReady } = usePrivy();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const handleConnect = useCallback(() => {
    if (process.env.NEXT_PUBLIC_PRIVY_APP_ID && privyReady) login();
    else setWalletModalVisible(true);
  }, [login, privyReady, setWalletModalVisible]);

  if (!isClient) return null;

  const displayName = vendorProfile?.username
    ? `@${vendorProfile.username}`
    : vendorProfile?.name || displayAddress;

  // Build nav items based on role
  const navItems: { href: string; label: string; icon: React.ReactNode; roles: UserRole[] }[] = [
    {
      href: '/marketplace',
      label: 'Marketplace',
      icon: <FaGem />,
      roles: ['user', 'vendor', 'admin'],
    },
    { href: '/pools', label: 'Pools', icon: <FaChartLine />, roles: ['user', 'vendor', 'admin'] },
    { href: '/vendors', label: 'Vendors', icon: <FaUsers />, roles: ['user', 'vendor', 'admin'] },
    {
      href: `/user/${walletAddress}`,
      label: 'My Profile',
      icon: <FaUser />,
      roles: ['user', 'vendor', 'admin'],
    },
    {
      href: '/my-orders',
      label: 'My Orders',
      icon: <FaShoppingBag />,
      roles: ['user', 'vendor', 'admin'],
    },
    { href: '/settings', label: 'Settings', icon: <FaCog />, roles: ['user', 'vendor', 'admin'] },
    {
      href: '/vendor/vendorDashboard',
      label: 'Vendor Dashboard',
      icon: <FaStore />,
      roles: ['vendor', 'admin'],
    },
    {
      href: '/vendor/vendorDashboard?tab=inventory',
      label: 'Add Listing',
      icon: <FaPlus />,
      roles: ['vendor', 'admin'],
    },
    { href: '/adminDashboard', label: 'Admin Panel', icon: <FaUserShield />, roles: ['admin'] },
    { href: '/createNFT', label: 'Mint NFT', icon: <FaClock />, roles: ['admin'] },
  ];

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <div ref={dropdownRef} className={`${styles.container} ${className}`}>
      {/* Trigger */}
      <button
        className={`${styles.trigger} ${isOpen ? styles.open : ''}`}
        onClick={() => setIsOpen((p) => !p)}
        aria-expanded={isOpen}
      >
        {isConnected ? (
          <>
            <div className={styles.avatar}>
              <img
                src={vendorProfile?.avatarUrl || '/images/purpleLGG.png'}
                alt=""
                style={!vendorProfile?.avatarUrl ? { padding: '3px' } : undefined}
              />
            </div>
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

      {/* Dropdown */}
      {isOpen && (
        <div className={styles.dropdown} role="menu">
          {isConnected ? (
            <>
              {/* Header: avatar + name + balance + wallet inline */}
              <div className={styles.identityHeader}>
                <div className={styles.identityRow}>
                  <div className={`${styles.avatar} ${styles.avatarLarge}`}>
                    <img
                      src={vendorProfile?.avatarUrl || '/images/purpleLGG.png'}
                      alt=""
                      style={!vendorProfile?.avatarUrl ? { padding: '4px' } : undefined}
                    />
                  </div>
                  <div className={styles.identityInfo}>
                    <span className={styles.username}>{displayName}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RoleBadge role={role} />
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'rgba(255,255,255,0.4)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {displayAddress}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Balance + wallet tools inline */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '12px',
                  }}
                >
                  <div className={styles.balanceDisplay}>
                    <SiSolana className={styles.solIcon} />
                    <span className={styles.balance}>
                      {balance !== null ? balance.toFixed(3) : '—'}
                    </span>
                    <span className={styles.balanceLabel}>SOL</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className={`${styles.toolButton} ${copied ? styles.copied : ''}`}
                      onClick={handleCopy}
                      title="Copy address"
                    >
                      {copied ? <FaCheck /> : <FaCopy />}
                    </button>
                    <button
                      className={styles.toolButton}
                      onClick={() =>
                        window.open(`${explorerUrl}${walletAddress}?cluster=devnet`, '_blank')
                      }
                      title="Explorer"
                    >
                      <FaExternalLinkAlt />
                    </button>
                  </div>
                </div>
              </div>

              {/* Navigation — compact list */}
              <nav className={styles.navSection}>
                {visibleItems.map((item) => (
                  <Link key={item.href} href={item.href} className={styles.navItem} onClick={close}>
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span className={styles.navLabel}>{item.label}</span>
                  </Link>
                ))}
              </nav>

              {/* Sign Out */}
              <div className={styles.disconnectSection}>
                <button className={styles.disconnectButton} onClick={handleDisconnect}>
                  <FaSignOutAlt />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <div className={styles.connectCta}>
              <div className={styles.connectIcon}>
                <img src="/images/purpleLGG.png" alt="LuxHub" style={{ width: 28, height: 28 }} />
              </div>
              <p className={styles.connectTitle}>Welcome to LuxHub</p>
              <p className={styles.connectText}>
                Connect your wallet to browse, buy, and invest in luxury assets.
              </p>
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
