'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from '../../styles/WalletNavbar.module.css';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
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
  FaMoneyBillTrendUp,
  FaCircleCheck,
  FaBoxOpen,
  FaEnvelope,
  FaRightFromBracket,
  FaRegCircleCheck,
} from 'react-icons/fa6';
import { Connection, PublicKey } from '@solana/web3.js';
import { usePriceDisplay } from '../marketplace/PriceDisplay';
import toast from 'react-hot-toast';
import { getProgram } from '../../utils/programUtils';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? 'https://api.devnet.solana.com';
const explorerUrl = endpoint.includes('devnet')
  ? 'https://explorer.solana.com/address/'
  : 'https://solscan.io/account/';

type UserRole = 'user' | 'vendor' | 'admin';

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  avatarUrl?: string;
  verified?: boolean;
}

export default function WalletNavbar() {
  const router = useRouter();

  // Solana wallet adapter hooks (for Phantom, Solflare, etc.)
  const {
    connected: walletAdapterConnected,
    publicKey: walletAdapterPublicKey,
    disconnect: walletAdapterDisconnect,
  } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();

  // Privy hooks (for email login + embedded wallet)
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

  const widgetRef = useRef<HTMLDivElement>(null);

  const [isRefreshingWallet, setIsRefreshingWallet] = useState(false);

  // Determine the active wallet - prefer wallet adapter if connected, otherwise use Privy
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

  // Use wallet adapter if connected, otherwise fall back to Privy embedded wallet
  const activePublicKey =
    walletAdapterConnected && walletAdapterPublicKey ? walletAdapterPublicKey : privyPublicKey;

  const isConnected = walletAdapterConnected || (authenticated && !!privyPublicKey);
  const hasWallet = !!activePublicKey;
  const hasPrivyWalletButNotLoaded = authenticated && walletsReady && !privyPublicKey;

  // Determine wallet type for display
  const getWalletType = (): string => {
    if (walletAdapterConnected && walletAdapterPublicKey) return 'External';
    if (privyPublicKey) return 'Embedded';
    return '';
  };

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
    const connection = new Connection(endpoint, 'confirmed');
    try {
      const bal = await connection.getBalance(activePublicKey);
      setBalance(bal / 1e9);
    } catch (err) {
      console.error('[WalletNavbar] Balance error:', err);
      setBalance(0);
    }
  }, [activePublicKey]);

  useEffect(() => {
    fetchBalance();
    if (hasWallet) {
      checkRoles();
      fetchVendorProfile();
    }
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [hasWallet, fetchBalance, checkRoles, fetchVendorProfile]);

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
      window.open(
        `${explorerUrl}${activePublicKey.toBase58()}?cluster=devnet`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleFund = () => {
    window.open('https://buy.moonpay.com/?defaultCurrencyCode=sol', '_blank');
  };

  // Login with Email (Privy)
  const handleEmailLogin = () => {
    privyLogin();
    setIsOpen(false);
  };

  // Connect External Wallet (Solana wallet adapter)
  const handleConnectWallet = () => {
    openWalletModal(true);
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

  // Disconnect / Logout
  const handleDisconnect = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      // Disconnect wallet adapter if connected
      if (walletAdapterConnected) {
        await walletAdapterDisconnect();
      }

      // Logout from Privy if authenticated
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
            {/* Account Info Section */}
            <div className={styles.section}>
              {vendorProfile ? (
                <div className={styles.vendorProfileSection}>
                  <div className={styles.vendorProfileHeader}>
                    {vendorProfile.avatarUrl ? (
                      <img
                        src={vendorProfile.avatarUrl}
                        alt={vendorProfile.username}
                        className={styles.vendorAvatar}
                      />
                    ) : (
                      <div className={styles.vendorAvatarPlaceholder}>
                        <FaUser />
                      </div>
                    )}
                    <div className={styles.vendorInfo}>
                      <span className={styles.vendorName}>
                        {vendorProfile.name}
                        {vendorProfile.verified && (
                          <FaCircleCheck className={styles.verifiedBadge} />
                        )}
                      </span>
                      <span className={styles.vendorUsername}>@{vendorProfile.username}</span>
                    </div>
                  </div>
                </div>
              ) : user?.email ? (
                <div className={styles.infoRow}>
                  <FaEnvelope className={styles.infoIcon} />
                  <span className={styles.emailText}>{user.email.address}</span>
                </div>
              ) : null}
              <div className={styles.infoRow}>
                <span className={styles.label}>Wallet ({getWalletType()})</span>
                <span className={styles.address} onClick={handleCopy}>
                  {activePublicKey!.toBase58().slice(0, 6)}...
                  {activePublicKey!.toBase58().slice(-4)}
                  <FaCopy className={styles.copyIcon} />
                  {copied && <span className={styles.copied}>Copied</span>}
                </span>
              </div>
            </div>

            {/* Balance Section */}
            <div className={styles.section}>
              <div className={styles.infoRow}>
                <span className={styles.label}>Balance</span>
                <span className={styles.balance}>
                  <SiSolana /> {balance !== null ? formatPrice(balance) : '—'}
                </span>
              </div>
              {balance === 0 && (
                <div className={styles.zeroBalanceHint}>
                  Add funds to start collecting luxury items
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDisplay();
                }}
                className={styles.toggleBtn}
              >
                Show in {displayInUSD ? 'SOL' : 'USD'}
              </button>
            </div>

            {/* Wallet Tools */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Wallet Tools</div>
              <div className={styles.actionRow}>
                <button onClick={handleCopy} className={styles.smallBtn} title="Copy address">
                  <FaCopy />
                </button>
                <button
                  onClick={handleExplorer}
                  className={styles.smallBtn}
                  title="View on Explorer"
                >
                  <FaArrowUpRightFromSquare />
                </button>
                <button onClick={handleFund} className={styles.smallBtn} title="Fund with card">
                  <FaCreditCard />
                </button>
              </div>
            </div>

            {/* Role-Based Menu */}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                {role === 'admin' && (
                  <>
                    <FaShieldHalved className={styles.roleIcon} /> Admin
                  </>
                )}
                {role === 'vendor' && (
                  <>
                    <FaStore className={styles.roleIcon} /> Vendor
                  </>
                )}
                {role === 'user' && (
                  <>
                    <FaUser className={styles.roleIcon} /> My Account
                  </>
                )}
              </div>

              <div className={styles.menuList}>
                {/* Regular User Menu */}
                {role === 'user' && (
                  <>
                    <button
                      onClick={() => navigateTo('/watchMarket?owned=true')}
                      className={styles.menuItem}
                    >
                      <FaBoxesStacked /> My Collection
                    </button>
                    <button onClick={() => navigateTo('/pools')} className={styles.menuItem}>
                      <FaChartLine /> My Investments
                    </button>
                    <button onClick={() => navigateTo('/orders')} className={styles.menuItem}>
                      <FaClipboardList /> Active Orders
                    </button>
                    <button onClick={() => navigateTo('/profile')} className={styles.menuItem}>
                      <FaUser /> Profile
                    </button>
                  </>
                )}

                {/* Vendor Menu */}
                {role === 'vendor' && (
                  <>
                    <button
                      onClick={() => navigateTo('/sellerDashboard')}
                      className={styles.menuItem}
                    >
                      <FaStore /> Vendor Dashboard
                    </button>
                    <button
                      onClick={() => navigateTo('/sellerDashboard?tab=inventory')}
                      className={styles.menuItem}
                    >
                      <FaBoxOpen /> Add New Item
                    </button>
                    <button
                      onClick={() => navigateTo('/sellerDashboard?tab=orders')}
                      className={styles.menuItem}
                    >
                      <FaClipboardList /> Active Orders
                    </button>
                    <button
                      onClick={() => navigateTo('/sellerDashboard?tab=payouts')}
                      className={styles.menuItem}
                    >
                      <FaMoneyBillTrendUp /> Earnings
                    </button>
                  </>
                )}

                {/* Admin Menu */}
                {role === 'admin' && (
                  <>
                    <button
                      onClick={() => navigateTo('/adminDashboard')}
                      className={styles.menuItem}
                    >
                      <FaShieldHalved /> Admin Panel
                    </button>
                    <button onClick={() => navigateTo('/createNFT')} className={styles.menuItem}>
                      <FaWandMagicSparkles /> Mint NFT
                    </button>
                    <button
                      onClick={() => navigateTo('/adminDashboard?tab=requests')}
                      className={styles.menuItem}
                    >
                      <FaCircleCheck /> Pending Approvals
                    </button>
                    <button
                      onClick={() => navigateTo('/adminDashboard?tab=escrow')}
                      className={styles.menuItem}
                    >
                      <FaBoxesStacked /> Escrow Management
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Link Additional Wallet (for Privy users) */}
            {authenticated && privySolanaWallets.length < 2 && (
              <button onClick={handleLinkWallet} className={styles.actionBtn}>
                Add External Wallet
              </button>
            )}

            {/* Disconnect Button */}
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
              <FaWallet /> Create Embedded Wallet
            </button>

            {/* Or connect external wallet */}
            <button onClick={handleConnectWallet} className={styles.connectBtnSecondary}>
              <FaWallet /> Connect External Wallet
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
          /* Not Connected - Show dual login options */
          <div className={styles.connectPrompt}>
            <p>Connect to unlock the full LuxHub experience</p>

            {/* Email Login via Privy */}
            <button onClick={handleEmailLogin} className={styles.connectBtn}>
              <FaEnvelope /> Login with Email
            </button>

            {/* External Wallet via Solana Wallet Adapter */}
            <button onClick={handleConnectWallet} className={styles.connectBtnSecondary}>
              <FaWallet /> Connect Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
