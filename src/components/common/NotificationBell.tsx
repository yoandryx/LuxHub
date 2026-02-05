// src/components/common/NotificationBell.tsx
import { useEffect, useState, useRef } from 'react';
import { FaBell } from 'react-icons/fa';
import { useRouter } from 'next/router';
import styles from '../../styles/NotificationBell.module.css';

interface Notification {
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

interface NotificationBellProps {
  walletAddress: string | null;
}

export default function NotificationBell({ walletAddress }: NotificationBellProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isClient, setIsClient] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch unread count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      if (!walletAddress) {
        setUnreadCount(0);
        return;
      }

      try {
        const res = await fetch(`/api/notifications/unread-count?wallet=${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch unread count:', error);
      }
    };

    fetchUnreadCount();

    // Poll every 30 seconds for updates
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  // Fetch notifications for dropdown
  const fetchNotifications = async () => {
    if (!walletAddress) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/notifications/list?wallet=${walletAddress}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Toggle dropdown
  const handleBellClick = () => {
    if (!showDropdown) {
      fetchNotifications();
    }
    setShowDropdown(!showDropdown);
  };

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
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notificationId: notification._id }),
        });

        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
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
  };

  // View all notifications
  const handleViewAll = () => {
    setShowDropdown(false);
    router.push('/notifications');
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    if (!walletAddress) return;

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, markAll: true }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

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
        {unreadCount > 0 && (
          <div className={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</div>
        )}
      </div>

      {showDropdown && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.dropdownContent}>
            {loading ? (
              <div className={styles.loadingState}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>No notifications yet</div>
            ) : (
              notifications.map((notification) => (
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
