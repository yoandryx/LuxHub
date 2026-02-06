// src/components/common/NotificationBell.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { FaBell } from 'react-icons/fa';
import { useRouter } from 'next/router';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import styles from '../../styles/NotificationBell.module.css';

interface NotificationBellProps {
  walletAddress: string | null;
}

export default function NotificationBell({ walletAddress }: NotificationBellProps) {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [localNotifications, setLocalNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Use SWR-based hook for unread count (auto-polls every 30s)
  const {
    unreadCount,
    notifications: swrNotifications,
    refresh,
    fetchNotifications,
  } = useNotifications(walletAddress);

  // Local unread count for optimistic updates
  const [localUnreadCount, setLocalUnreadCount] = useState(unreadCount);

  // Sync local state with SWR data
  useEffect(() => {
    setLocalUnreadCount(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    if (swrNotifications.length > 0) {
      setLocalNotifications(swrNotifications);
    }
  }, [swrNotifications]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch notifications when dropdown opens
  const handleFetchNotifications = useCallback(async () => {
    if (!walletAddress) return;

    setLoading(true);
    try {
      await fetchNotifications();
    } finally {
      setLoading(false);
    }
  }, [walletAddress, fetchNotifications]);

  // Toggle dropdown
  const handleBellClick = useCallback(() => {
    if (!showDropdown) {
      handleFetchNotifications();
    }
    setShowDropdown(!showDropdown);
  }, [showDropdown, handleFetchNotifications]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark notification as read and navigate
  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      if (!notification.read) {
        try {
          await fetch('/api/notifications/mark-read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notificationId: notification._id }),
          });

          // Update local state optimistically
          setLocalNotifications((prev) =>
            prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
          );
          setLocalUnreadCount((prev) => Math.max(0, prev - 1));

          // Refresh SWR cache in background
          refresh();
        } catch (error) {
          console.error('Failed to mark notification as read:', error);
        }
      }

      // Navigate to action URL or notifications page
      setShowDropdown(false);
      if (notification.metadata?.actionUrl) {
        router.push(notification.metadata.actionUrl);
      } else {
        router.push('/notifications');
      }
    },
    [router, refresh]
  );

  // View all notifications
  const handleViewAll = useCallback(() => {
    setShowDropdown(false);
    router.push('/notifications');
  }, [router]);

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    if (!walletAddress) return;

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, markAll: true }),
      });

      // Update local state optimistically
      setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setLocalUnreadCount(0);

      // Refresh SWR cache in background
      refresh();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [walletAddress, refresh]);

  // Format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!isClient || !walletAddress) {
    return null;
  }

  return (
    <div className={styles.bellContainer} ref={dropdownRef}>
      <div className={styles.bellButton} onClick={handleBellClick}>
        <FaBell className={styles.bellIcon} />
        {localUnreadCount > 0 && (
          <div className={styles.badge}>{localUnreadCount > 99 ? '99+' : localUnreadCount}</div>
        )}
      </div>

      {showDropdown && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifications</span>
            {localUnreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.dropdownContent}>
            {loading ? (
              <div className={styles.loadingState}>Loading...</div>
            ) : localNotifications.length === 0 ? (
              <div className={styles.emptyState}>No notifications yet</div>
            ) : (
              localNotifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`${styles.notificationItem} ${notification.read ? styles.read : styles.unread}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationTitle}>{notification.title}</div>
                    <div className={styles.notificationMessage}>
                      {notification.message.length > 80
                        ? `${notification.message.substring(0, 80)}...`
                        : notification.message}
                    </div>
                    <div className={styles.notificationTime}>
                      {formatTimeAgo(notification.createdAt)}
                    </div>
                  </div>
                  {!notification.read && <div className={styles.unreadDot} />}
                </div>
              ))
            )}
          </div>

          <div className={styles.dropdownFooter}>
            <button className={styles.viewAllBtn} onClick={handleViewAll}>
              View All Notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
