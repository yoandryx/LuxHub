// src/hooks/useSWR.ts - Custom SWR hooks for data fetching with caching
import useSWR, { SWRConfiguration } from 'swr';

// Default fetcher function
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    throw error;
  }
  return res.json();
};

// Default SWR config for the app
export const defaultSWRConfig: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  dedupingInterval: 5000, // Dedupe requests within 5 seconds
  errorRetryCount: 3,
  errorRetryInterval: 1000,
};

// Vendor list hook - returns any[] to avoid conflicts with VendorProfile model
// Includes stats (totalItems, itemsListed, inventoryValue) for tier badges
export function useVendors() {
  const { data, error, isLoading, mutate } = useSWR<{
    vendors: any[];
    verifiedVendors: any[];
  }>('/api/vendor/vendorList?includeStats=true', fetcher, {
    ...defaultSWRConfig,
    revalidateOnFocus: false, // Vendors don't change often
    dedupingInterval: 30000, // 30 second cache
  });

  return {
    vendors: data?.vendors || [],
    verifiedVendors: data?.verifiedVendors || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// Pools hook for investment pools - returns any[] to avoid type conflicts
export function usePools(status: string = 'open') {
  const { data, error, isLoading, mutate } = useSWR<{ pools: any[] }>(
    `/api/pool/list?status=${status}`,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 60000, // Refresh every minute
    }
  );

  return {
    pools: data?.pools || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// Single pool detail hook
export function usePool(poolId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    poolId ? `/api/pool/${poolId}` : null,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  return {
    pool: data?.pool || null,
    isLoading,
    isError: error,
    mutate,
  };
}

// Escrow listings hook
export function useEscrowListings(status: string = 'initiated', limit: number = 100) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/escrow/list?status=${status}&limit=${limit}`,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  return {
    listings: data?.listings || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// Vendor orders hook (for vendor dashboard)
export function useVendorOrders(wallet: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    wallet ? `/api/vendor/orders?wallet=${wallet}` : null,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 30000,
    }
  );

  return {
    orders: data?.orders || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// User profile hook
export function useUserProfile(wallet: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    wallet ? `/api/users/${wallet}` : null,
    fetcher,
    {
      ...defaultSWRConfig,
      dedupingInterval: 10000,
    }
  );

  return {
    user: data?.user || null,
    isLoading,
    isError: error,
    mutate,
  };
}

// Offers hook (for a specific escrow)
export function useOffers(escrowPda: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    escrowPda ? `/api/offers/list?escrowPda=${escrowPda}` : null,
    fetcher,
    {
      ...defaultSWRConfig,
      refreshInterval: 15000, // Refresh every 15 seconds
    }
  );

  return {
    offers: data?.offers || [],
    isLoading,
    isError: error,
    mutate,
  };
}

// SOL price hook for USD conversions
export function useSolPrice() {
  const { data, error, isLoading } = useSWR('/api/users/sol-price', fetcher, {
    ...defaultSWRConfig,
    refreshInterval: 60000, // Refresh every minute
    dedupingInterval: 30000,
  });

  return {
    price: data?.price || 0,
    isLoading,
    isError: error,
  };
}

// Generic hook for custom endpoints
export function useAPI<T>(endpoint: string | null, config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<T>(endpoint, fetcher, {
    ...defaultSWRConfig,
    ...config,
  });

  return {
    data,
    isLoading,
    isError: error,
    mutate,
  };
}

export default useSWR;
