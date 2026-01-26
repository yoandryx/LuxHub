// src/hooks/usePools.ts
// SWR hooks for pool data fetching with caching and revalidation
import useSWR, { SWRConfiguration } from 'swr';
import useSWRImmutable from 'swr/immutable';

// Generic fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('Failed to fetch');
    const data = await res.json().catch(() => ({}));
    (error as any).info = data;
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};

// ============================================
// Platform Stats Hook
// ============================================
export interface PlatformStats {
  tvl: number;
  tvlFormatted: string;
  totalPools: number;
  activePools: number;
  openPools: number;
  filledPools: number;
  totalVolume: number;
  totalVolumeFormatted: string;
  totalTrades: number;
  avgROI: number;
  avgROIFormatted: string;
  totalInvestors: number;
  totalDistributed: number;
  totalDistributedFormatted: string;
  tokenizedPools: number;
  graduatedPools: number;
  lastUpdated: string;
}

export function usePlatformStats(config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<PlatformStats>('/api/stats/platform', fetcher, {
    refreshInterval: 30000, // Refresh every 30 seconds
    revalidateOnFocus: true,
    dedupingInterval: 10000, // Dedupe requests within 10 seconds
    ...config,
  });

  return {
    stats: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// Pool List Hook
// ============================================
export interface Pool {
  _id: string;
  poolNumber?: string;
  asset?: {
    _id?: string;
    model?: string;
    brand?: string;
    priceUSD?: number;
    description?: string;
    serial?: string;
    imageIpfsUrls?: string[];
    images?: string[];
  };
  vendor?: {
    businessName?: string;
  };
  vendorWallet?: string;
  status: string;
  totalShares: number;
  sharesSold: number;
  sharePriceUSD: number;
  targetAmountUSD: number;
  minBuyInUSD: number;
  maxInvestors: number;
  projectedROI: number;
  participants?: Array<{
    wallet: string;
    shares: number;
    ownershipPercent: number;
    investedUSD: number;
  }>;
  custodyStatus?: string;
  resaleListingPriceUSD?: number;
  createdAt?: string;
  // Bags integration
  bagsTokenMint?: string;
  tokenStatus?: string;
  liquidityModel?: string;
  ammEnabled?: boolean;
  ammLiquidityPercent?: number;
  totalTrades?: number;
  totalVolumeUSD?: number;
  lastPriceUSD?: number;
}

interface PoolListResponse {
  pools: Pool[];
  total: number;
}

export function usePools(config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<PoolListResponse>('/api/pool/list', fetcher, {
    refreshInterval: 60000, // Refresh every minute
    revalidateOnFocus: true,
    dedupingInterval: 5000,
    ...config,
  });

  return {
    pools: data?.pools || [],
    total: data?.total || 0,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// Single Pool Hook
// ============================================
interface PoolDetailResponse {
  pool: Pool;
}

export function usePool(poolId: string | null, config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<PoolDetailResponse>(
    poolId ? `/api/pool/${poolId}` : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      ...config,
    }
  );

  return {
    pool: data?.pool,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// Pool Status Hook (lightweight)
// ============================================
interface PoolStatusResponse {
  pool: {
    status: string;
    sharesSold: number;
    totalShares: number;
    participants: Pool['participants'];
  };
}

export function usePoolStatus(poolId: string | null, config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<PoolStatusResponse>(
    poolId ? `/api/pool/status?poolId=${poolId}` : null,
    fetcher,
    {
      refreshInterval: 15000, // More frequent for active pools
      revalidateOnFocus: true,
      dedupingInterval: 3000,
      ...config,
    }
  );

  return {
    poolStatus: data?.pool,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// Trade Quote Hook
// ============================================
interface TradeQuote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  effectivePrice: number;
  priceImpact: string;
  slippageBps: string;
}

interface TradeQuoteResponse {
  success: boolean;
  quote: TradeQuote;
}

export function useTradeQuote(
  poolId: string | null,
  amount: string,
  tradeType: 'buy' | 'sell',
  outputToken: 'USDC' | 'SOL' = 'USDC',
  config?: SWRConfiguration
) {
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const outputMint = outputToken === 'USDC' ? USDC_MINT : SOL_MINT;

  const params = new URLSearchParams({
    poolId: poolId || '',
    amount,
    slippageBps: '100',
  });

  // For sell: input is pool token, output is USDC/SOL
  // For buy: input is USDC/SOL, output is pool token
  if (tradeType === 'sell') {
    params.set('outputMint', outputMint);
  } else {
    params.set('inputMint', outputMint);
  }

  const shouldFetch = poolId && amount && parseFloat(amount) > 0;

  const { data, error, isLoading, mutate } = useSWR<TradeQuoteResponse>(
    shouldFetch ? `/api/bags/trade-quote?${params.toString()}` : null,
    fetcher,
    {
      refreshInterval: 10000, // Quotes refresh every 10 seconds
      revalidateOnFocus: false,
      dedupingInterval: 2000,
      ...config,
    }
  );

  return {
    quote: data?.quote,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// Partner Stats Hook (Admin)
// ============================================
interface PartnerStats {
  totalEarnings: number;
  totalTransactions: number;
  pendingClaims: number;
  lastClaimed: string | null;
}

interface PartnerStatsResponse {
  success: boolean;
  stats: PartnerStats;
}

export function usePartnerStats(config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<PartnerStatsResponse>(
    '/api/bags/partner-stats',
    fetcher,
    {
      refreshInterval: 60000,
      revalidateOnFocus: true,
      dedupingInterval: 30000,
      ...config,
    }
  );

  return {
    stats: data?.stats,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

// ============================================
// User Portfolio Hook
// ============================================
interface UserPosition {
  poolId: string;
  poolNumber: string;
  assetModel: string;
  shares: number;
  ownershipPercent: number;
  investedUSD: number;
  currentValueUSD: number;
  pnl: number;
  pnlPercent: number;
  status: string;
}

interface UserPortfolioResponse {
  positions: UserPosition[];
  totalInvested: number;
  totalCurrentValue: number;
  totalPnL: number;
  totalPnLPercent: number;
}

export function useUserPortfolio(walletAddress: string | null, config?: SWRConfiguration) {
  const { data, error, isLoading, mutate } = useSWR<UserPortfolioResponse>(
    walletAddress ? `/api/user/portfolio?wallet=${walletAddress}` : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      dedupingInterval: 10000,
      ...config,
    }
  );

  return {
    portfolio: data,
    positions: data?.positions || [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
