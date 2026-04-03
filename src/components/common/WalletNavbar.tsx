'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from '../../styles/WalletNavbar.module.css';
import { useRouter } from 'next/router';
import { usePrivy, useLogout, getAccessToken } from '@privy-io/react-auth';
import { useCreateWallet, useWallets } from '@privy-io/react-auth/solana';
import { SiSolana } from 'react-icons/si';
import {
  FaWallet,
  FaCopy,
  FaArrowUpRightFromSquare,
  FaUser,
  FaCreditCard,
  FaStore,
  FaShieldHalved,
  FaWandMagicSparkles,
  FaRotate,
  FaBoxesStacked,
  FaChartLine,
  FaClipboardList,
  FaCircleCheck,
  FaBoxOpen,
  FaEnvelope,
  FaRightFromBracket,
  FaLink,
  FaBolt,
  FaArrowRightArrowLeft,
  FaGavel,
  FaFileCirclePlus,
} from 'react-icons/fa6';
import { Connection, PublicKey } from '@solana/web3.js';
import { usePriceDisplay } from '../marketplace/PriceDisplay';
import toast from 'react-hot-toast';
import { getProgram } from '../../utils/programUtils';

import { getClusterConfig } from '@/lib/solana/clusterConfig';

type UserRole = 'user' | 'vendor' | 'admin';

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  avatarUrl?: string;
  verified?: boolean;
}

interface LinkedWalletInfo {
  address: string;
  type: 'embedded' | 'external' | 'backpack';
  walletClient?: string;
  isPrimary: boolean;
}

interface UserProfile {
  id: string;
  privyId?: string;
  email?: string;
  role: string;
  primaryWallet?: string;
  linkedWallets: LinkedWalletInfo[];
  profile?: {
    name?: string;
    username?: string;
    avatar?: string;
  };
}

export default function WalletNavbar() {
  const { endpoint, explorerUrl: makeExplorerUrl } = getClusterConfig();
  const router = useRouter();

  // Privy hooks (email login + embedded wallet)
  const {
    ready,
    authenticated,
    user,
    login: privyLogin,
    connectWallet: privyConnectWallet,
  } = usePrivy();
  // useWallets returns embedded + linked Solana wallets from Privy
  const { wallets: privySolanaWallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { logout: privyLogout } = useLogout();

  const { displayInUSD, toggleDisplay, formatPrice } = usePriceDisplay();

  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showAllWallets, setShowAllWallets] = useState(false);
  const [hasSynced, setHasSynced] = useState(false);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingMintRequests, setPendingMintRequests] = useState(0);

  const widgetRef = useRef<HTMLDivElement>(null);

  const [isRefreshingWallet, setIsRefreshingWallet] = useState(false);

  // Determine the active wallet from Privy
  // Try multiple sources for Privy wallet address:
  // 1. useWallets hook (embedded + linked wallets)
  // 2. user.linkedAccounts (fallback) - check for embedded_solana_wallet type
  const privyActiveWallet = privySolanaWallets?.[0];
  const privyWalletAddress = privyActiveWallet?.address;

  // Fallback: check user.linkedAccounts for Solana wallet (embedded or linked)
  // Priority: embedded_solana_wallet > wallet with chainType solana
  const linkedEmbeddedWallet = user?.linkedAccounts?.find(
    (account: any) => account.type === 'embedded_solana_wallet'
  ) as { address?: string } | undefined;

  const linkedExternalWallet = user?.linkedAccounts?.find(
    (account: any) => account.type === 'wallet' && account.chainType === 'solana'
  ) as { address?: string } | undefined;

  const linkedSolanaWallet = linkedEmbeddedWallet || linkedExternalWallet;

  const effectivePrivyAddress = privyWalletAddress || linkedSolanaWallet?.address;

  // Validate the wallet address before creating PublicKey
  const isValidSolanaAddress = (address: string | undefined): boolean => {
    if (!address) return false;
    try {
      new PublicKey(address);
      return address.length >= 32 && address.length <= 44;
    } catch {
      return false;
    }
  };

  const privyPublicKey =
    effectivePrivyAddress && isValidSolanaAddress(effectivePrivyAddress)
      ? new PublicKey(effectivePrivyAddress)
      : null;

  // Debug logging (remove in production)
  useEffect(() => {
    if (authenticated) {
      console.log('[WalletNavbar] Privy Debug:', {
        authenticated,
        ready,
        walletsReady,
        userId: user?.id,
        email: user?.email?.address,
        privySolanaWallets: privySolanaWallets?.map((w: any) => ({
          address: w.address,
          type: w.walletClientType,
        })),
        linkedEmbeddedWallet: linkedEmbeddedWallet?.address,
        linkedExternalWallet: linkedExternalWallet?.address,
        allLinkedAccounts: user?.linkedAccounts?.map((a: any) => ({
          type: a.type,
          chainType: a.chainType,
          address: a.address,
        })),
        effectivePrivyAddress,
        isValidAddress: isValidSolanaAddress(effectivePrivyAddress),
      });
    }
  }, [
    authenticated,
    ready,
    walletsReady,
    privySolanaWallets,
    user,
    linkedEmbeddedWallet,
    linkedExternalWallet,
    effectivePrivyAddress,
  ]);

  // Force refresh wallet state by clearing cache and re-fetching
  const handleRefreshWalletState = useCallback(async () => {
    if (!authenticated) return;

    setIsRefreshingWallet(true);
    toast.loading('Refreshing wallet...', { id: 'refresh-wallet' });

    try {
      // Get fresh access token to ensure we have latest user data
      const token = await getAccessToken();
      console.log('[WalletNavbar] Got fresh token, length:', token?.length);

      // Small delay to allow Privy to sync
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Force a page reload to re-initialize Privy state
      window.location.reload();
    } catch (err) {
      console.error('[WalletNavbar] Refresh wallet error:', err);
      toast.error('Failed to refresh wallet state', { id: 'refresh-wallet' });
      setIsRefreshingWallet(false);
    }
  }, [authenticated]);

  // Sync Privy user with MongoDB on authentication
  const syncUserWithMongoDB = useCallback(async () => {
    if (!authenticated || !user || hasSynced) return;

    try {
      const response = await fetch('/api/users/sync-privy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privyUser: {
            id: user.id,
            createdAt: user.createdAt,
            email: user.email,
            linkedAccounts: user.linkedAccounts,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[WalletNavbar] User synced with MongoDB:', data.user);
        setUserProfile(data.user);
        setHasSynced(true);

        // Update role from MongoDB if set
        if (data.user.role && data.user.role !== 'user') {
          setRole(data.user.role as UserRole);
        }
      }
    } catch (err) {
      console.error('[WalletNavbar] Sync error:', err);
    }
  }, [authenticated, user, hasSynced]);

  // Sync on authentication
  useEffect(() => {
    if (authenticated && user && !hasSynced) {
      syncUserWithMongoDB();
    }
  }, [authenticated, user, hasSynced, syncUserWithMongoDB]);

  // Get all linked wallets from Privy (for display)
  const getAllLinkedWallets = useCallback((): LinkedWalletInfo[] => {
    const wallets: LinkedWalletInfo[] = [];
    const seenAddresses = new Set<string>();

    // Add wallets from useWallets hook
    privySolanaWallets?.forEach((w: any) => {
      if (w.address && !seenAddresses.has(w.address)) {
        seenAddresses.add(w.address);
        wallets.push({
          address: w.address,
          type: w.walletClientType === 'privy' ? 'embedded' : 'external',
          walletClient: w.walletClientType,
          isPrimary: wallets.length === 0,
        });
      }
    });

    // Add wallets from linkedAccounts (fallback)
    user?.linkedAccounts?.forEach((account: any) => {
      if (
        account.type === 'embedded_solana_wallet' &&
        account.address &&
        !seenAddresses.has(account.address)
      ) {
        seenAddresses.add(account.address);
        wallets.push({
          address: account.address,
          type: 'embedded',
          walletClient: 'privy_embedded',
          isPrimary: wallets.length === 0,
        });
      }
      if (
        account.type === 'wallet' &&
        account.chainType === 'solana' &&
        account.address &&
        !seenAddresses.has(account.address)
      ) {
        seenAddresses.add(account.address);
        wallets.push({
          address: account.address,
          type: 'external',
          walletClient: account.walletClientType || 'unknown',
          isPrimary: wallets.length === 0,
        });
      }
    });

    // Add MongoDB linked wallets if available
    userProfile?.linkedWallets?.forEach((w) => {
      if (w.address && !seenAddresses.has(w.address)) {
        seenAddresses.add(w.address);
        wallets.push(w);
      }
    });

    return wallets;
  }, [privySolanaWallets, user, userProfile]);

  const allLinkedWallets = getAllLinkedWallets();

  // Privy-only wallet
  const activePublicKey = privyPublicKey;

  const isConnected = authenticated && !!privyPublicKey;
  const hasWallet = !!activePublicKey;
  const hasPrivyWalletButNotLoaded = authenticated && walletsReady && !privyPublicKey;

  // Check on-chain roles (admin/vendor)
  const checkRoles = useCallback(async () => {
    if (!activePublicKey || !ready) return;

    try {
      const program = getProgram({ publicKey: activePublicKey } as any);

      // Check admin status
      const [adminPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('admin_list')],
        program.programId
      );
      const adminAccount = await (program.account as any)['adminList']
        ?.fetch(adminPda)
        .catch(() => null);

      if (adminAccount) {
        const admins = adminAccount.admins.map((a: PublicKey) => a.toBase58());
        if (admins.includes(activePublicKey.toBase58())) {
          setRole('admin');
          return;
        }
      }

      // Check vendor status
      const [vendorPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vendor_list')],
        program.programId
      );
      const vendorAccount = await (program.account as any)['vendorList']
        ?.fetch(vendorPda)
        .catch(() => null);

      if (vendorAccount) {
        const vendors = vendorAccount.vendors.map((v: PublicKey) => v.toBase58());
        if (vendors.includes(activePublicKey.toBase58())) {
          setRole('vendor');
          return;
        }
      }

      setRole('user');
    } catch (err) {
      console.log('[WalletNavbar] Role check failed:', err);
      setRole('user');
    }
  }, [activePublicKey, ready]);

  // Fetch vendor profile if wallet has one
  const fetchVendorProfile = useCallback(async () => {
    if (!activePublicKey) {
      setVendorProfile(null);
      return;
    }

    try {
      const res = await fetch(`/api/vendor/profile?wallet=${activePublicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.vendor) {
          setVendorProfile(data.vendor);
        } else {
          setVendorProfile(null);
        }
      } else {
        setVendorProfile(null);
      }
    } catch (err) {
      console.log('[WalletNavbar] Vendor profile fetch failed:', err);
      setVendorProfile(null);
    }
  }, [activePublicKey]);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!activePublicKey) {
      setBalance(0);
      return;
    }
    const connection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 10000,
    });
    try {
      const bal = await Promise.race([
        connection.getBalance(activePublicKey),
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      setBalance(bal / 1e9);
    } catch {
      // Silently fallback — RPC may be temporarily unavailable
      setBalance(0);
    }
  }, [activePublicKey]);

  // Fetch smart context data when panel opens
  const fetchSmartContext = useCallback(async () => {
    if (!activePublicKey) return;
    const wallet = activePublicKey.toBase58();

    try {
      const [ordersRes, mintRes] = await Promise.allSettled([
        fetch(`/api/escrow/orders?wallet=${wallet}&status=funded,shipped`),
        role === 'vendor' || role === 'admin'
          ? fetch(`/api/vendor/mint-request?wallet=${wallet}&status=pending`)
          : Promise.resolve(null),
      ]);

      if (ordersRes.status === 'fulfilled' && ordersRes.value?.ok) {
        const data = await ordersRes.value.json();
        setPendingOrders(Array.isArray(data) ? data.length : data.orders?.length || 0);
      }

      if (mintRes.status === 'fulfilled' && mintRes.value?.ok) {
        const data = await mintRes.value.json();
        setPendingMintRequests(Array.isArray(data) ? data.length : data.requests?.length || 0);
      }
    } catch {
      // Non-critical — fail silently
    }
  }, [activePublicKey, role]);

  useEffect(() => {
    fetchBalance();
    if (hasWallet) {
      checkRoles();
      fetchVendorProfile();
    }
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [hasWallet, fetchBalance, checkRoles, fetchVendorProfile]);

  // Fetch context when panel opens
  useEffect(() => {
    if (isOpen && hasWallet) {
      fetchSmartContext();
    }
  }, [isOpen, hasWallet, fetchSmartContext]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleCopy = () => {
    if (activePublicKey) {
      navigator.clipboard.writeText(activePublicKey.toBase58());
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleExplorer = () => {
    if (activePublicKey) {
      window.open(makeExplorerUrl(activePublicKey.toBase58()), '_blank', 'noopener,noreferrer');
    }
  };

  const handleFund = () => {
    window.open('https://buy.moonpay.com/?defaultCurrencyCode=sol', '_blank');
  };

  // Login via Privy (email or social)
  const handleLogin = () => {
    privyLogin();
    setIsOpen(false);
  };

  // Create embedded wallet for Privy users without one
  const handleCreateEmbedded = async () => {
    try {
      const result = await createWallet();
      console.log('[WalletNavbar] Wallet created:', result);
      toast.success('Embedded wallet created!');
      // Give Privy a moment to update state, then refresh
      setTimeout(() => window.location.reload(), 500);
    } catch (err: any) {
      console.log('[WalletNavbar] Create wallet error:', err);
      if (err.message?.includes('already has') || err.message?.includes('already exists')) {
        toast.success('Wallet found — loading...');
        // Wallet exists, just need to reload to pick it up
        setTimeout(() => window.location.reload(), 500);
      } else {
        toast.error('Wallet creation failed: ' + (err.message || 'Unknown error'));
      }
    }
  };

  // Link additional wallet via Privy
  const handleLinkWallet = () => {
    privyConnectWallet();
    setIsOpen(false);
  };

  // Disconnect / Logout (Privy only)
  const handleDisconnect = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      if (authenticated) {
        await privyLogout();
      }

      toast.success('Signed out');
      setRole('user');
    } catch (err) {
      console.error('[WalletNavbar] Disconnect error:', err);
      toast.success('Signed out locally');
    } finally {
      setIsOpen(false);
      setIsLoggingOut(false);
    }
  };

  // Navigation helpers
  const navigateTo = (path: string) => {
    setIsOpen(false);
    router.push(path);
  };

  return (
    <div ref={widgetRef} className={`${styles.luxWalletOrb} ${isOpen ? styles.open : ''}`}>
      {/* Trigger Button */}
      <div className={styles.trigger} onClick={toggleOpen}>
        {vendorProfile?.avatarUrl ? (
          <img
            src={vendorProfile.avatarUrl}
            alt={vendorProfile.username}
            className={styles.triggerAvatar}
          />
        ) : (
          <FaWallet className={styles.walletIcon} />
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {hasWallet && activePublicKey ? (
            vendorProfile ? (
              <span className={styles.shortAddress}>@{vendorProfile.username}</span>
            ) : (
              <span className={styles.shortAddress}>
                {activePublicKey.toBase58().slice(0, 4)}...{activePublicKey.toBase58().slice(-4)}
              </span>
            )
          ) : (
            <span>Connect</span>
          )}
        </div>
      </div>

      {/* Dropdown Panel */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>LuxHub Wallet</h3>
          {hasWallet && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchBalance();
              }}
              className={styles.refresh}
              title="Refresh balance"
            >
              <FaRotate />
            </button>
          )}
        </div>

        {isConnected && hasWallet ? (
          <>
            {/* Identity + Balance — compact header */}
            <div className={styles.section}>
              <div className={styles.vendorProfileSection}>
                <div className={styles.vendorProfileHeader}>
                  {vendorProfile?.avatarUrl ? (
                    <img src={vendorProfile.avatarUrl} alt="" className={styles.vendorAvatar} />
                  ) : (
                    <img
                      src="/images/purpleLGG.png"
                      alt="LuxHub"
                      className={styles.vendorAvatar}
                      style={{ padding: '4px' }}
                    />
                  )}
                  <div className={styles.vendorInfo}>
                    <span className={styles.vendorName}>
                      {vendorProfile?.name ||
                        `${activePublicKey!.toBase58().slice(0, 4)}...${activePublicKey!.toBase58().slice(-4)}`}
                      {vendorProfile?.verified && (
                        <FaCircleCheck className={styles.verifiedBadge} />
                      )}
                    </span>
                    <span className={styles.vendorUsername}>
                      {vendorProfile ? `@${vendorProfile.username}` : 'Privy Wallet'}
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
                  marginTop: '8px',
                }}
              >
                <span className={styles.balance}>
                  <SiSolana style={{ fontSize: '12px', opacity: 0.7 }} />{' '}
                  {balance !== null ? formatPrice(balance) : '—'}
                </span>
                <div className={styles.actionRow}>
                  <button onClick={handleCopy} className={styles.smallBtn} title="Copy address">
                    {copied ? <FaCircleCheck style={{ color: '#4ade80' }} /> : <FaCopy />}
                  </button>
                  <button onClick={handleExplorer} className={styles.smallBtn} title="Explorer">
                    <FaArrowUpRightFromSquare />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDisplay();
                    }}
                    className={styles.smallBtn}
                    title={`Show in ${displayInUSD ? 'SOL' : 'USD'}`}
                  >
                    <SiSolana />
                  </button>
                </div>
              </div>
            </div>

            {/* Smart Quick Actions */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>
                <FaBolt style={{ fontSize: '10px' }} /> Quick Actions
              </div>
              <div className={styles.quickGrid}>
                <button onClick={() => navigateTo('/marketplace')} className={styles.quickAction}>
                  <FaBoxesStacked />
                  <span>Browse</span>
                </button>
                <button onClick={() => navigateTo('/pools')} className={styles.quickAction}>
                  <FaChartLine />
                  <span>Pools</span>
                </button>
                <button
                  onClick={() => navigateTo(`/user/${activePublicKey!.toBase58()}`)}
                  className={styles.quickAction}
                >
                  <FaUser />
                  <span>Profile</span>
                </button>
                <button onClick={() => navigateTo('/orders')} className={styles.quickAction}>
                  <FaClipboardList />
                  <span>Orders</span>
                  {pendingOrders > 0 && <span className={styles.badge}>{pendingOrders}</span>}
                </button>
              </div>
            </div>

            {/* Contextual Suggestions */}
            {(pendingOrders > 0 || (balance !== null && balance < 0.01)) && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Suggestions</div>
                <div className={styles.suggestions}>
                  {balance !== null && balance < 0.01 && (
                    <button onClick={handleFund} className={styles.suggestion}>
                      <FaCreditCard className={styles.suggestIcon} />
                      <div>
                        <span className={styles.suggestTitle}>Fund your wallet</span>
                        <span className={styles.suggestDesc}>Add SOL to start buying</span>
                      </div>
                    </button>
                  )}
                  {pendingOrders > 0 && (
                    <button onClick={() => navigateTo('/orders')} className={styles.suggestion}>
                      <FaArrowRightArrowLeft className={styles.suggestIcon} />
                      <div>
                        <span className={styles.suggestTitle}>{pendingOrders} active order{pendingOrders > 1 ? 's' : ''}</span>
                        <span className={styles.suggestDesc}>Track shipment or confirm delivery</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Vendor Tools */}
            {(role === 'vendor' || role === 'admin') && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>
                  <FaStore style={{ fontSize: '10px' }} /> Vendor Tools
                </div>
                <div className={styles.quickGrid}>
                  <button
                    onClick={() => navigateTo('/vendor/vendorDashboard')}
                    className={styles.quickAction}
                  >
                    <FaStore />
                    <span>Dashboard</span>
                  </button>
                  <button
                    onClick={() => navigateTo('/vendor/bulk-upload')}
                    className={styles.quickAction}
                  >
                    <FaFileCirclePlus />
                    <span>Upload</span>
                    {pendingMintRequests > 0 && <span className={styles.badge}>{pendingMintRequests}</span>}
                  </button>
                </div>
              </div>
            )}

            {/* Admin Tools */}
            {role === 'admin' && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>
                  <FaShieldHalved style={{ fontSize: '10px' }} /> Admin
                </div>
                <div className={styles.quickGrid}>
                  <button onClick={() => navigateTo('/adminDashboard')} className={styles.quickAction}>
                    <FaShieldHalved />
                    <span>Panel</span>
                  </button>
                  <button onClick={() => navigateTo('/createNFT')} className={styles.quickAction}>
                    <FaWandMagicSparkles />
                    <span>Mint</span>
                  </button>
                  <button onClick={() => navigateTo('/adminDashboard?tab=vendors')} className={styles.quickAction}>
                    <FaGavel />
                    <span>Vendors</span>
                  </button>
                </div>
              </div>
            )}

            {/* Disconnect */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDisconnect();
              }}
              className={styles.disconnectBtn}
              disabled={isLoggingOut}
            >
              <FaRightFromBracket />
              {isLoggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </>
        ) : authenticated ? (
          /* Authenticated but no wallet yet - show wallet creation options */
          <div className={styles.connectPrompt}>
            {user?.email && (
              <div className={styles.emailBadge}>
                <FaEnvelope /> {user.email.address}
              </div>
            )}

            {/* Show if we found a wallet in linkedAccounts but it's not loading */}
            {linkedSolanaWallet?.address && !privyPublicKey && (
              <div className={styles.walletCacheWarning}>
                <p>Wallet found but not loaded. Try refreshing.</p>
                <button
                  onClick={handleRefreshWalletState}
                  className={styles.refreshWalletBtn}
                  disabled={isRefreshingWallet}
                >
                  <FaRotate className={isRefreshingWallet ? styles.spinning : ''} />
                  {isRefreshingWallet ? 'Refreshing...' : 'Refresh Wallet State'}
                </button>
              </div>
            )}

            <p>Create or connect a wallet to continue</p>

            {/* Create embedded wallet */}
            <button onClick={handleCreateEmbedded} className={styles.connectBtn}>
              <FaWallet /> Create Wallet
            </button>

            {/* Or link external wallet via Privy */}
            <button onClick={handleLinkWallet} className={styles.connectBtnSecondary}>
              <FaLink /> Link External Wallet
            </button>

            {/* Refresh button if wallet state seems stale */}
            {walletsReady && !linkedSolanaWallet?.address && (
              <button
                onClick={handleRefreshWalletState}
                className={styles.refreshWalletBtn}
                disabled={isRefreshingWallet}
                style={{ marginTop: 8 }}
              >
                <FaRotate className={isRefreshingWallet ? styles.spinning : ''} />
                {isRefreshingWallet ? 'Refreshing...' : 'Refresh Wallet State'}
              </button>
            )}

            {/* Sign out option */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDisconnect();
              }}
              className={styles.disconnectBtn}
              style={{ marginTop: 12 }}
            >
              <FaRightFromBracket /> Sign Out
            </button>
          </div>
        ) : (
          /* Not Connected */
          <div className={styles.connectPrompt}>
            <p>Sign in to unlock the full LuxHub experience</p>

            <button onClick={handleLogin} className={styles.connectBtn}>
              <FaWallet /> Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
