// src/hooks/useUserRole.ts - Unified role detection with SWR caching
// Phase 12 (2026-05-21): Privy removed. Wallet state derives only from @solana/wallet-adapter-react.
import { useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { useWallet } from '@solana/wallet-adapter-react';
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
  // Wallet adapter is the sole source of wallet state
  const wallet = useWallet();
  const activePublicKey = wallet.publicKey ?? null;
  const isConnected = wallet.connected;
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

  // Loading state — SWR returns undefined while fetching, null for 404s
  const isLoading = useMemo(() => {
    if (!walletAddress) return false;
    const vaultLoading = vaultData === undefined && !vaultError;
    const vendorLoading = vendorData === undefined && !vendorError;
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
