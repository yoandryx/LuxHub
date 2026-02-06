// src/hooks/useNotifications.ts - SWR-based notification polling
import { useCallback } from 'react';
import useSWR from 'swr';

export interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: {
    actionUrl?: string;
  };
}

export interface UseNotificationsReturn {
  unreadCount: number;
  notifications: Notification[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
}

// SWR fetcher with error handling
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return { count: 0 };
    throw new Error('Failed to fetch notifications');
  }
  return res.json();
};

export function useNotifications(walletAddress: string | null): UseNotificationsReturn {
  // SWR: Fetch unread count with 30s polling interval
  const {
    data: countData,
    error: countError,
    mutate: mutateCount,
  } = useSWR(
    walletAddress ? `/api/notifications/unread-count?wallet=${walletAddress}` : null,
    fetcher,
    {
      refreshInterval: 30000, // Poll every 30 seconds
      dedupingInterval: 10000, // Dedupe requests within 10 seconds
      revalidateOnFocus: true,
      errorRetryCount: 2,
    }
  );

  // SWR: Fetch notification list (on-demand, no auto-refresh)
  const {
    data: listData,
    error: listError,
    mutate: mutateList,
  } = useSWR(
    walletAddress ? `/api/notifications/list?wallet=${walletAddress}&limit=5` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      revalidateOnMount: false, // Don't fetch on mount - we'll fetch manually when dropdown opens
    }
  );

  // Refresh unread count
  const refresh = useCallback(async () => {
    await mutateCount();
  }, [mutateCount]);

  // Fetch notifications list (call when dropdown opens)
  const fetchNotifications = useCallback(async () => {
    await mutateList();
  }, [mutateList]);

  return {
    unreadCount: countData?.count || 0,
    notifications: listData?.notifications || [],
    isLoading: !countData && !countError,
    error: countError || listError || null,
    refresh,
    fetchNotifications,
  };
}

export default useNotifications;
