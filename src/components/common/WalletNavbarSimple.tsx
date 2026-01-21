'use client';

// Simple wallet navbar that only uses Solana wallet adapter (no Privy)
// Used when NEXT_PUBLIC_PRIVY_APP_ID is not configured

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from '../../styles/WalletNavbar.module.css';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
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
  FaRightFromBracket,
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

export default function WalletNavbarSimple() {
  const router = useRouter();

  // Solana wallet adapter hooks (for Phantom, Solflare, etc.)
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();

  const { displayInUSD, toggleDisplay, formatPrice } = usePriceDisplay();

  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copied, setCopied] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);

  // Check on-chain roles (admin/vendor)
  const checkRoles = useCallback(async () => {
    if (!publicKey) return;

    try {
      const program = getProgram({ publicKey } as any);

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
        if (admins.includes(publicKey.toBase58())) {
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
        if (vendors.includes(publicKey.toBase58())) {
          setRole('vendor');
          return;
        }
      }

      setRole('user');
    } catch (err) {
      console.log('[WalletNavbarSimple] Role check failed:', err);
      setRole('user');
    }
  }, [publicKey]);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!publicKey) {
      setBalance(0);
      return;
    }
    const connection = new Connection(endpoint, 'confirmed');
    try {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / 1e9);
    } catch (err) {
      console.error('[WalletNavbarSimple] Balance error:', err);
      setBalance(0);
    }
  }, [publicKey]);

  useEffect(() => {
    fetchBalance();
    if (connected && publicKey) {
      checkRoles();
    }
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [connected, publicKey, fetchBalance, checkRoles]);

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
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleExplorer = () => {
    if (publicKey) {
      window.open(
        `${explorerUrl}${publicKey.toBase58()}?cluster=devnet`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleFund = () => {
    window.open('https://buy.moonpay.com/?defaultCurrencyCode=sol', '_blank');
  };

  // Connect External Wallet (Solana wallet adapter)
  const handleConnectWallet = () => {
    openWalletModal(true);
    setIsOpen(false);
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);

    try {
      await disconnect();
      toast.success('Wallet disconnected');
      setRole('user');
    } catch (err) {
      console.error('[WalletNavbarSimple] Disconnect error:', err);
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
        <FaWallet className={styles.walletIcon} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {connected && publicKey ? (
            <span className={styles.shortAddress}>
              {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
            </span>
          ) : (
            <span>Connect</span>
          )}
        </div>
      </div>

      {/* Dropdown Panel */}
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>LuxHub Wallet</h3>
          {connected && (
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

        {connected && publicKey ? (
          <>
            {/* Account Info Section */}
            <div className={styles.section}>
              <div className={styles.infoRow}>
                <span className={styles.label}>Wallet</span>
                <span className={styles.address} onClick={handleCopy}>
                  {publicKey.toBase58().slice(0, 6)}...
                  {publicKey.toBase58().slice(-4)}
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
                  </>
                )}
              </div>
            </div>

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
              {isLoggingOut ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </>
        ) : (
          /* Not Connected - Show connect option */
          <div className={styles.connectPrompt}>
            <p>Connect your wallet to access LuxHub</p>

            {/* External Wallet via Solana Wallet Adapter */}
            <button onClick={handleConnectWallet} className={styles.connectBtn}>
              <FaWallet /> Connect Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
