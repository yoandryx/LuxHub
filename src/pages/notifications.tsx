// src/pages/notifications.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { PublicKey } from '@solana/web3.js';
import { FaBell, FaCheck, FaFilter } from 'react-icons/fa';
import styles from '../styles/Notifications.module.css';

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  metadata?: {
    actionUrl?: string;
    escrowPda?: string;
    trackingNumber?: string;
    amountUSD?: number;
  };
}

// Notification type labels and colors
const typeConfig: Record<string, { label: string; color: string }> = {
  order_funded: { label: 'New Order', color: '#22c55e' },
  order_shipped: { label: 'Shipped', color: '#3b82f6' },
  order_delivered: { label: 'Delivered', color: '#22c55e' },
  payment_released: { label: 'Payment', color: '#22c55e' },
  shipment_submitted: { label: 'Pending Review', color: '#f59e0b' },
  shipment_verified: { label: 'Verified', color: '#22c55e' },
  shipment_rejected: { label: 'Rejected', color: '#ef4444' },
  offer_received: { label: 'New Offer', color: '#c8a1ff' },
  offer_accepted: { label: 'Accepted', color: '#22c55e' },
  offer_rejected: { label: 'Rejected', color: '#ef4444' },
  offer_countered: { label: 'Counter Offer', color: '#f59e0b' },
  vendor_approved: { label: 'Approved', color: '#22c55e' },
  vendor_rejected: { label: 'Rejected', color: '#ef4444' },
  sale_request_approved: { label: 'Approved', color: '#22c55e' },
  sale_request_rejected: { label: 'Rejected', color: '#ef4444' },
  pool_investment: { label: 'Investment', color: '#c8a1ff' },
  pool_distribution: { label: 'Distribution', color: '#22c55e' },
};

export default function NotificationsPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const privyWalletAddress = privyWallets?.[0]?.address;

  const activePublicKey =
    wallet.publicKey || (privyWalletAddress ? new PublicKey(privyWalletAddress) : null);
  const isConnected = wallet.connected || (authenticated && !!privyWalletAddress);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!activePublicKey) {
        setLoading(false);
        return;
      }

      try {
        const walletAddress = activePublicKey.toBase58();
        const params = new URLSearchParams({
          wallet: walletAddress,
          limit: '50',
          unreadOnly: filter === 'unread' ? 'true' : 'false',
        });

        if (typeFilter !== 'all') {
          params.append('type', typeFilter);
        }

        const res = await fetch(`/api/notifications/list?${params}`);

        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [activePublicKey, filter, typeFilter]);

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId }),
      });

      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    if (!activePublicKey) return;

    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: activePublicKey.toBase58(), markAll: true }),
      });

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      handleMarkAsRead(notification._id);
    }

    if (notification.metadata?.actionUrl) {
      router.push(notification.metadata.actionUrl);
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
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Get unique notification types from current notifications
  const availableTypes = Array.from(new Set(notifications.map((n) => n.type)));

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <FaBell className={styles.emptyIcon} />
          <h2>Connect Your Wallet</h2>
          <p>Please connect your wallet to view your notifications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>
              <FaBell className={styles.headerIcon} />
              Notifications
            </h1>
            {unreadCount > 0 && <span className={styles.unreadBadge}>{unreadCount} unread</span>}
          </div>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={handleMarkAllAsRead}>
                <FaCheck />
                Mark All Read
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <div className={styles.filterTabs}>
            <button
              className={filter === 'all' ? styles.tabActive : styles.tab}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={filter === 'unread' ? styles.tabActive : styles.tab}
              onClick={() => setFilter('unread')}
            >
              Unread
            </button>
          </div>

          <div className={styles.typeFilter}>
            <FaFilter className={styles.filterIcon} />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={styles.typeSelect}
            >
              <option value="all">All Types</option>
              <optgroup label="Orders">
                <option value="order_funded">New Orders</option>
                <option value="order_shipped">Shipped</option>
                <option value="order_delivered">Delivered</option>
                <option value="payment_released">Payments</option>
              </optgroup>
              <optgroup label="Shipments">
                <option value="shipment_submitted">Pending Review</option>
                <option value="shipment_verified">Verified</option>
                <option value="shipment_rejected">Rejected</option>
              </optgroup>
              <optgroup label="Offers">
                <option value="offer_received">Received</option>
                <option value="offer_accepted">Accepted</option>
                <option value="offer_rejected">Rejected</option>
                <option value="offer_countered">Countered</option>
              </optgroup>
              <optgroup label="Vendor">
                <option value="vendor_approved">Approved</option>
                <option value="vendor_rejected">Rejected</option>
              </optgroup>
            </select>
          </div>
        </div>

        {/* Notifications List */}
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <FaBell className={styles.emptyIcon} />
            <h3>No Notifications</h3>
            <p>
              {filter === 'unread'
                ? "You're all caught up! No unread notifications."
                : "You don't have any notifications yet."}
            </p>
          </div>
        ) : (
          <div className={styles.notificationList}>
            {notifications.map((notification) => {
              const config = typeConfig[notification.type] || {
                label: notification.type,
                color: '#c8a1ff',
              };

              return (
                <div
                  key={notification._id}
                  className={`${styles.notificationCard} ${notification.read ? styles.read : styles.unread}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <span
                        className={styles.typeBadge}
                        style={{ backgroundColor: `${config.color}20`, color: config.color }}
                      >
                        {config.label}
                      </span>
                      <span className={styles.timestamp}>
                        {formatTimeAgo(notification.createdAt)}
                      </span>
                    </div>
                    <h3 className={styles.cardTitle}>{notification.title}</h3>
                    <p className={styles.cardMessage}>{notification.message}</p>
                    {notification.metadata?.trackingNumber && (
                      <div className={styles.cardMeta}>
                        Tracking: {notification.metadata.trackingNumber}
                      </div>
                    )}
                    {notification.metadata?.amountUSD && (
                      <div className={styles.cardMeta}>
                        Amount: ${notification.metadata.amountUSD.toFixed(2)} USD
                      </div>
                    )}
                  </div>
                  {!notification.read && <div className={styles.unreadIndicator} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
