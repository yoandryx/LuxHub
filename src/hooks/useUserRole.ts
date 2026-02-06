// src/hooks/useUserRole.ts - Unified role detection with SWR caching
import { useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { VendorProfile } from '@/lib/models/VendorProfile';

// Role hierarchy: admin > vendor > user > browser
export type UserRole = 'browser' | 'user' | 'vendor' | 'admin';

export interface UserRoleState {
  role: UserRole;
  isAdmin: boolean;
  isVendor: boolean;
  isConnected: boolean;
  walletAddress: string | null;
  displayAddress: string | null;
  vendorProfile: VendorProfile | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

// SWR fetcher with error handling
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error('Failed to fetch');
  }
  return res.json();
};

export function useUserRole(): UserRoleState {
  // Wallet adapter hooks
  const wallet = useWallet();

  // Privy hooks for authentication
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const privyWalletAddress = privyWallets?.[0]?.address;

  // Get active public key (wallet adapter or Privy)
  const activePublicKey = useMemo(() => {
    if (wallet.publicKey) return wallet.publicKey;
    if (privyWalletAddress) {
      try {
        return new PublicKey(privyWalletAddress);
      } catch {
        return null;
      }
    }
    return null;
  }, [wallet.publicKey, privyWalletAddress]);

  // Check if connected via any method
  const isConnected = wallet.connected || (authenticated && !!privyWalletAddress);

  // Get wallet address string
  const walletAddress = activePublicKey?.toBase58() || null;

  // Display address (truncated)
  const displayAddress = useMemo(() => {
    if (!walletAddress) return null;
    return `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  }, [walletAddress]);

  // SWR: Fetch vault config for admin check
  const {
    data: vaultData,
    error: vaultError,
    mutate: mutateVault,
  } = useSWR(walletAddress ? '/api/vault/config' : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 second cache
    errorRetryCount: 2,
  });

  // SWR: Fetch vendor profile
  const {
    data: vendorData,
    error: vendorError,
    mutate: mutateVendor,
  } = useSWR(walletAddress ? `/api/vendor/profile?wallet=${walletAddress}` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 second cache
    errorRetryCount: 2,
  });

  // Compute admin status
  const isAdmin = useMemo(() => {
    if (!walletAddress || !vaultData) return false;

    // Check against VaultConfig authorizedAdmins
    const authorizedAdmins = vaultData.config?.authorizedAdmins || [];
    const isAuthorized = authorizedAdmins.some(
      (admin: { walletAddress: string }) => admin.walletAddress === walletAddress
    );

    // Also check SUPER_ADMIN_WALLETS env var
    const superAdmins = (process.env.NEXT_PUBLIC_SUPER_ADMIN_WALLETS || '')
      .split(',')
      .map((w) => w.trim())
      .filter(Boolean);

    return isAuthorized || superAdmins.includes(walletAddress);
  }, [walletAddress, vaultData]);

  // Compute vendor status
  const isVendor = useMemo(() => {
    if (!vendorData) return false;
    return !!vendorData.wallet;
  }, [vendorData]);

  // Vendor profile data
  const vendorProfile = useMemo(() => {
    if (!vendorData || !vendorData.wallet) return null;
    return vendorData as VendorProfile;
  }, [vendorData]);

  // Compute role based on hierarchy: admin > vendor > user > browser
  const role: UserRole = useMemo(() => {
    if (!isConnected) return 'browser';
    if (isAdmin) return 'admin';
    if (isVendor) return 'vendor';
    return 'user';
  }, [isConnected, isAdmin, isVendor]);

  // Loading state
  const isLoading = useMemo(() => {
    if (!walletAddress) return false;
    // Loading if we're fetching and don't have data yet
    const vaultLoading = !vaultData && !vaultError;
    const vendorLoading = !vendorData && !vendorError;
    return vaultLoading || vendorLoading;
  }, [walletAddress, vaultData, vaultError, vendorData, vendorError]);

  // Combined error
  const error = vaultError || vendorError || null;

  // Refresh function to re-fetch both endpoints
  const refresh = useCallback(async () => {
    await Promise.all([mutateVault(), mutateVendor()]);
  }, [mutateVault, mutateVendor]);

  return {
    role,
    isAdmin,
    isVendor,
    isConnected,
    walletAddress,
    displayAddress,
    vendorProfile,
    isLoading,
    error,
    refresh,
  };
}

export default useUserRole;
