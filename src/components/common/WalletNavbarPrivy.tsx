'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../../styles/WalletNavbar.module.css';
import { useRouter } from 'next/router';
import { usePrivy, useLogout } from '@privy-io/react-auth';
import { useStandardWallets } from '@privy-io/react-auth/solana'; // ← Correct Solana hook
import { useCreateWallet } from '@privy-io/react-auth/solana'; // Manual fallback
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
} from 'react-icons/fa6';
import { Connection, PublicKey } from '@solana/web3.js';
import { usePriceDisplay } from '../marketplace/PriceDisplay';
import toast from 'react-hot-toast';
import { getProgram } from '../../utils/programUtils';

const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? 'https://api.devnet.solana.com';
const explorerUrl = endpoint.includes('devnet')
  ? 'https://explorer.solana.com/address/'
  : 'https://solscan.io/account/';

export default function WalletNavbar() {
  const router = useRouter();
  const { ready, authenticated, user, login, connectWallet } = usePrivy();
  const _standard = useStandardWallets() as any; // cast to any to avoid strict typing from the library
  const solanaWallets = (_standard?.wallets ?? []) as any[]; // normalize to an array of any
  const { createWallet } = useCreateWallet();
  const { logout } = useLogout();

  const { displayInUSD, toggleDisplay, formatPrice } = usePriceDisplay();

  const [isOpen, setIsOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isVendor, setIsVendor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);

  const activeWallet = solanaWallets[0] as any;
  // Support wallets that expose either `address` (string) or `publicKey` (PublicKey-like or string)
  const publicKey = activeWallet?.address
    ? new PublicKey(activeWallet.address)
    : activeWallet?.publicKey
      ? new PublicKey(activeWallet.publicKey)
      : null;
  const hasWallet = !!publicKey;

  const walletType = 'Embedded';

  // Debug logs
  useEffect(() => {
    console.log('=== LUXHUB WALLET STATE ===');
    console.log('Privy ready:', ready);
    console.log('Authenticated:', authenticated);
    console.log('User email:', user?.email?.address || 'None');
    console.log('Has wallet:', hasWallet);
    console.log('Wallet address:', publicKey?.toBase58() || 'None');
    console.log('Solana wallets count:', solanaWallets.length);
    console.log(
      'Full solana wallets:',
      solanaWallets.map((w: any) => ({
        address:
          w?.address ??
          (w?.publicKey
            ? typeof w.publicKey === 'string'
              ? w.publicKey
              : (w.publicKey?.toBase58?.() ?? null)
            : null),
        type: w?.walletClientType ?? w?.type ?? null,
      }))
    );
    console.log('==============================');
  }, [ready, authenticated, user, hasWallet, publicKey, solanaWallets]);

  const checkRoles = async () => {
    if (!publicKey || !ready) return;

    try {
      const program = getProgram({ publicKey } as any);

      const [adminPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('admin_list')],
        program.programId
      );
      const adminAccount = await (program.account as any)['adminList']
        ?.fetch(adminPda)
        .catch(() => null);
      if (adminAccount) {
        const admins = adminAccount.admins.map((a: PublicKey) => a.toBase58());
        setIsAdmin(admins.includes(publicKey.toBase58()));
      }

      const [vendorPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vendor_list')],
        program.programId
      );
      const vendorAccount = await (program.account as any)['vendorList']
        ?.fetch(vendorPda)
        .catch(() => null);
      if (vendorAccount) {
        const vendors = vendorAccount.vendors.map((v: PublicKey) => v.toBase58());
        setIsVendor(vendors.includes(publicKey.toBase58()));
      }
    } catch (err) {
      console.log('[WalletNavbar] Role check failed:', err);
    }
  };

  const fetchBalance = async () => {
    if (!publicKey) {
      setBalance(0);
      return;
    }
    const connection = new Connection(endpoint, 'confirmed');
    try {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / 1e9);
    } catch (err) {
      console.error('[WalletNavbar] Balance error:', err);
      setBalance(0);
    }
  };

  useEffect(() => {
    fetchBalance();
    if (hasWallet) checkRoles();
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [hasWallet, publicKey, ready]);

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
    navigator.clipboard.writeText(publicKey!.toBase58());
    toast.success('Address copied!');
  };

  const handleExplorer = () => {
    window.open(`${explorerUrl}${publicKey!.toBase58()}`, '_blank', 'noopener,noreferrer');
  };

  const handleFund = () => {
    window.open('https://buy.moonpay.com/?defaultCurrencyCode=sol', '_blank');
  };

  const handleConnect = () => {
    if (authenticated && !hasWallet) {
      connectWallet();
    } else {
      login();
    }
    setIsOpen(false);
  };

  const handleCreateEmbedded = async () => {
    try {
      await createWallet();
      toast.success('Embedded wallet ready!');
    } catch (err: any) {
      if (err.message?.includes('already has')) {
        toast.success('Wallet already exists — refreshing...');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        toast.error('Creation failed');
      }
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out securely');
    } catch (err) {
      toast.success('Signed out locally');
    } finally {
      setIsOpen(false);
      setIsLoggingOut(false);
    }
  };

  return (
    <div ref={widgetRef} className={`${styles.walletWidget} ${isOpen ? styles.open : ''}`}>
      <div className={styles.trigger} onClick={toggleOpen}>
        <FaWallet className={styles.walletIcon} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {hasWallet ? (
            <span className={styles.shortAddress}>
              {publicKey!.toBase58().slice(0, 4)}...{publicKey!.toBase58().slice(-4)}
            </span>
          ) : (
            <span>Login / Connect</span>
          )}
        </div>
      </div>

      <div className={styles.dropdown}>
        {(user?.email || hasWallet) && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Signed in as</div>
            {user?.email && (
              <div className={styles.infoRow}>
                <FaUser />
                <span>{user.email.address}</span>
              </div>
            )}
            {hasWallet && (
              <div className={styles.infoRow}>
                <span className={styles.label}>Wallet ({walletType}):</span>
                <span>
                  {publicKey!.toBase58().slice(0, 8)}...{publicKey!.toBase58().slice(-6)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>Balance</div>
          <div className={styles.balanceRow}>
            <SiSolana className={styles.solIcon} />
            <span className={styles.balance}>
              {balance === null ? 'Loading...' : formatPrice(balance)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchBalance();
              }}
              className={styles.refreshBtn}
              title="Refresh"
            >
              <FaRotate />
            </button>
          </div>
          {balance === 0 && (
            <div className={styles.zeroBalanceHint}>
              Add funds to start collecting luxury watches
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

        {hasWallet && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Wallet Tools</div>
            <div className={styles.actionRow}>
              <button onClick={handleCopy} className={styles.smallBtn} title="Copy address">
                <FaCopy />
              </button>
              <button onClick={handleExplorer} className={styles.smallBtn} title="View on Explorer">
                <FaArrowUpRightFromSquare />
              </button>
            </div>
          </div>
        )}

        <div className={styles.section}>
          <div className={styles.sectionTitle}>LuxHub</div>
          <div className={styles.actions}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFund();
              }}
              className={styles.actionBtn}
            >
              <FaCreditCard /> Fund with Card
            </button>

            {!hasWallet && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleConnect();
                }}
                className={styles.actionBtn}
              >
                Login / Connect
              </button>
            )}

            {authenticated && !hasWallet && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCreateEmbedded();
                }}
                className={styles.actionBtn}
              >
                Create Embedded Wallet
              </button>
            )}

            {hasWallet && authenticated && solanaWallets.length < 2 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  connectWallet();
                  setIsOpen(false);
                }}
                className={styles.actionBtn}
              >
                Add External Wallet
              </button>
            )}

            {isVendor && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/sellerDashboard');
                }}
                className={styles.actionBtn}
              >
                <FaStore /> List a Watch
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/adminDashboard');
                  }}
                  className={styles.actionBtn}
                >
                  <FaShieldHalved /> Admin Panel
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/createNFT');
                  }}
                  className={styles.actionBtn}
                >
                  <FaWandMagicSparkles /> Mint NFT
                </button>
              </>
            )}

            {hasWallet && !isVendor && !isAdmin && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/sellerDashboard');
                }}
                className={styles.actionBtn}
              >
                My Profile
              </button>
            )}

            {authenticated && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLogout();
                }}
                className={styles.logoutBtn}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
