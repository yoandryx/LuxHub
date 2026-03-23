// src/pages/orders.tsx
// Buyer's order tracking + offers management — modern luxury dashboard
import React, { useState, useEffect, useCallback } from 'react';
import { useEffectiveWallet } from '../hooks/useEffectiveWallet';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
import { useBuyerOffers } from '../hooks/useSWR';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUtils';
import styles from '../styles/MyOrders.module.css';
import {
  FiPackage,
  FiTruck,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiExternalLink,
  FiLoader,
  FiAlertCircle,
  FiX,
  FiStar,
  FiMessageSquare,
  FiShoppingBag,
  FiArrowLeft,
  FiInfo,
  FiCheck,
  FiTag,
  FiDollarSign,
  FiRefreshCw,
  FiChevronDown,
  FiChevronRight,
} from 'react-icons/fi';

// ==================== INTERFACES ====================
interface ShippingAddress {
  fullName?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  email?: string;
  deliveryInstructions?: string;
}

interface DeliveryConfirmation {
  confirmedBy?: string;
  confirmationType?: string;
  confirmedAt?: string;
  rating?: number;
  reviewText?: string;
}

interface Order {
  _id: string;
  assetTitle: string;
  assetBrand?: string;
  assetDescription?: string;
  assetImage?: string;
  amount: number;
  status: string;
  shipmentStatus?: string;
  vendorName: string;
  vendorVerified?: boolean;
  vendorWallet: string;
  shippingAddress: ShippingAddress | null;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDeliveryDate?: string;
  actualDeliveryDate?: string;
  shippedAt?: string;
  deliveryConfirmation?: DeliveryConfirmation;
  deliveryNotes?: string;
  escrowPda: string;
  nftMint?: string;
  createdAt: string;
  fundedAt?: string;
}

interface OrderStats {
  total: number;
  awaitingPayment: number;
  awaitingShipment: number;
  inTransit: number;
  delivered: number;
  completed: number;
}

interface CounterOffer {
  amount: number;
  amountUSD: number;
  from: string;
  fromType: 'buyer' | 'vendor';
  message?: string;
  at: string;
}

interface BuyerOffer {
  _id: string;
  escrowPda: string;
  assetModel?: string;
  assetImage?: string;
  assetListPrice?: number;
  escrowListingPrice?: number;
  offerPriceUSD: number;
  offerAmount: number;
  status: string;
  message?: string;
  vendorName?: string;
  counterOffers: CounterOffer[];
  latestCounterOffer?: CounterOffer | null;
  createdAt: string;
  respondedAt?: string;
  expiresAt?: string;
}

type TopTab = 'orders' | 'offers';
type FilterTab = 'all' | 'payment' | 'awaiting' | 'shipped' | 'delivered' | 'completed';
type OfferFilter = 'all' | 'pending' | 'countered' | 'accepted' | 'rejected';

const CARRIER_NAMES: Record<string, string> = {
  fedex: 'FedEx',
  ups: 'UPS',
  dhl: 'DHL',
  usps: 'USPS',
  ontrac: 'OnTrac',
  lasership: 'LaserShip',
  purolator: 'Purolator',
  canada_post: 'Canada Post',
  royal_mail: 'Royal Mail',
  australia_post: 'Australia Post',
  japan_post: 'Japan Post',
};

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Ordered', icon: FiCheck },
  { key: 'shipped', label: 'Shipped', icon: FiTruck },
  { key: 'delivered', label: 'Delivered', icon: FiPackage },
  { key: 'released', label: 'Complete', icon: FiCheckCircle },
];

// ==================== COMPONENT ====================
const MyOrdersPage: React.FC = () => {
  const wallet = useEffectiveWallet();
  const walletAddress = wallet.publicKey?.toBase58();

  // Top-level tab
  const [topTab, setTopTab] = useState<TopTab>('orders');

  // Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    awaitingPayment: 0,
    awaitingShipment: 0,
    inTransit: 0,
    delivered: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Offers state (via SWR)
  const {
    offers,
    stats: offerStats,
    isLoading: isLoadingOffers,
    mutate: mutateOffers,
  } = useBuyerOffers(walletAddress);
  const [offerFilter, setOfferFilter] = useState<OfferFilter>('all');

  // Confirm delivery modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Counter-offer modal state
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<BuyerOffer | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [isResponding, setIsResponding] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!wallet.publicKey) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/buyer/orders?wallet=${wallet.publicKey.toBase58()}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.orders || []);
        setStats(
          data.stats || {
            total: 0,
            awaitingPayment: 0,
            awaitingShipment: 0,
            inTransit: 0,
            delivered: 0,
            completed: 0,
          }
        );
      } else {
        setError(data.error || 'Failed to fetch orders');
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  }, [wallet.publicKey]);

  useEffect(() => {
    if (wallet.connected) {
      fetchOrders();
    } else {
      setIsLoading(false);
    }
  }, [wallet.connected, fetchOrders]);

  // Filter orders
  const filteredOrders = orders.filter((order) => {
    switch (activeFilter) {
      case 'payment':
        return order.status === 'offer_accepted';
      case 'awaiting':
        return order.status === 'funded';
      case 'shipped':
        return order.status === 'shipped';
      case 'delivered':
        return order.status === 'delivered';
      case 'completed':
        return order.status === 'released';
      default:
        return true;
    }
  });

  // Filter offers
  const filteredOffers = (offers as BuyerOffer[]).filter((offer) => {
    switch (offerFilter) {
      case 'pending':
        return offer.status === 'pending';
      case 'countered':
        return offer.status === 'countered';
      case 'accepted':
        return offer.status === 'accepted';
      case 'rejected':
        return ['rejected', 'auto_rejected'].includes(offer.status);
      default:
        return true;
    }
  });

  // ==================== ORDER HANDLERS ====================
  const openConfirmModal = (order: Order) => {
    setSelectedOrder(order);
    setRating(5);
    setReviewText('');
    setDeliveryNotes('');
    setConfirmSuccess(false);
    setShowConfirmModal(true);
  };

  const handleConfirmDelivery = async () => {
    if (!selectedOrder || !wallet.publicKey) return;
    setIsConfirming(true);
    setError(null);
    try {
      const res = await fetch('/api/escrow/confirm-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId: selectedOrder._id,
          wallet: wallet.publicKey.toBase58(),
          confirmationType: 'buyer',
          rating,
          reviewText: reviewText.trim() || undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConfirmSuccess(true);
        setTimeout(() => {
          setShowConfirmModal(false);
          fetchOrders();
        }, 2500);
      } else {
        setError(data.error || 'Failed to confirm delivery');
      }
    } catch (err) {
      console.error('Error confirming delivery:', err);
      setError('Failed to confirm delivery');
    } finally {
      setIsConfirming(false);
    }
  };

  // ==================== OFFER HANDLERS ====================
  const handleOfferAction = async (
    offerId: string,
    action: string,
    extra?: Record<string, any>
  ) => {
    if (!walletAddress) return;
    setIsResponding(true);
    setError(null);
    try {
      const res = await fetch('/api/offers/buyer-respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId,
          buyerWallet: walletAddress,
          action,
          ...extra,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        mutateOffers();
        setShowCounterModal(false);
        setSelectedOffer(null);
      } else {
        setError(data.error || `Failed to ${action}`);
      }
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setIsResponding(false);
    }
  };

  const openCounterModal = (offer: BuyerOffer) => {
    setSelectedOffer(offer);
    setCounterAmount('');
    setCounterMessage('');
    setShowCounterModal(true);
  };

  const handleCounterSubmit = () => {
    if (!selectedOffer || !counterAmount) return;
    handleOfferAction(selectedOffer._id, 'counter', {
      counterAmountUSD: parseFloat(counterAmount),
      counterMessage: counterMessage.trim() || undefined,
    });
  };

  // ==================== HELPERS ====================
  const getTimelineProgress = (status: string): number => {
    switch (status) {
      case 'offer_accepted':
        return 0;
      case 'funded':
        return 1;
      case 'shipped':
        return 2;
      case 'delivered':
        return 3;
      case 'released':
        return 4;
      default:
        return 0;
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'offer_accepted':
        return {
          label: 'Pay Now',
          icon: FiDollarSign,
          className: styles.statusPayment,
          color: '#ef5350',
        };
      case 'funded':
        return {
          label: 'Awaiting Shipment',
          icon: FiClock,
          className: styles.statusAwaiting,
          color: '#fbbf24',
        };
      case 'shipped':
        return {
          label: 'In Transit',
          icon: FiTruck,
          className: styles.statusShipped,
          color: '#60a5fa',
        };
      case 'delivered':
        return {
          label: 'Delivered',
          icon: FiPackage,
          className: styles.statusDelivered,
          color: '#4ade80',
        };
      case 'released':
        return {
          label: 'Completed',
          icon: FiCheckCircle,
          className: styles.statusCompleted,
          color: '#c8a1ff',
        };
      default:
        return { label: status, icon: FiPackage, className: '', color: '#a1a1a1' };
    }
  };

  const getOfferStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pending', className: styles.offerStatusPending };
      case 'countered':
        return { label: 'Counter-Offer', className: styles.offerStatusCountered };
      case 'accepted':
        return { label: 'Accepted', className: styles.offerStatusAccepted };
      case 'rejected':
        return { label: 'Rejected', className: styles.offerStatusRejected };
      case 'auto_rejected':
        return { label: 'Auto-Rejected', className: styles.offerStatusRejected };
      case 'withdrawn':
        return { label: 'Withdrawn', className: styles.offerStatusWithdrawn };
      case 'expired':
        return { label: 'Expired', className: styles.offerStatusRejected };
      default:
        return { label: status, className: '' };
    }
  };

  const getTrackingUrl = (carrier: string, number: string): string | null => {
    const urls: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${number}`,
      ups: `https://www.ups.com/track?tracknum=${number}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${number}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`,
    };
    return urls[carrier] || null;
  };

  const formatAddress = (addr: ShippingAddress | null) => {
    if (!addr) return null;
    return [
      addr.street1,
      addr.street2,
      [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean);
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const actionCount =
    stats.awaitingPayment +
    stats.delivered +
    (offerStats?.pending || 0) +
    (offerStats?.countered || 0);

  // ==================== RENDER: NOT CONNECTED ====================
  if (!wallet.connected) {
    return (
      <>
        <Head>
          <title>Orders | LuxHub</title>
        </Head>
        <div className={styles.container}>
          <div className={styles.connectPrompt}>
            <div className={styles.connectGlow} />
            <FiShoppingBag className={styles.connectIcon} />
            <h1>Your Orders</h1>
            <p>Connect your wallet to track purchases, manage offers, and confirm deliveries.</p>
          </div>
        </div>
      </>
    );
  }

  // ==================== RENDER: MAIN ====================
  return (
    <>
      <Head>
        <title>Orders | LuxHub</title>
        <meta name="description" content="Track your LuxHub orders and manage offers" />
      </Head>

      <div className={styles.container}>
        <div className={styles.ambientBg} />

        {/* Page Header — Compact */}
        <header className={styles.pageHeader}>
          <div className={styles.headerRow}>
            <Link href="/marketplace" className={styles.backLink}>
              <FiArrowLeft />
            </Link>
            <h1 className={styles.pageTitle}>Orders</h1>
            {actionCount > 0 && (
              <span className={styles.actionBadge}>
                {actionCount} action{actionCount > 1 ? 's' : ''} needed
              </span>
            )}
          </div>

          {/* Quick Stats Bar */}
          <div className={styles.statsBar}>
            {[
              { label: 'Total', value: stats.total, filter: 'all' as FilterTab },
              ...(stats.awaitingPayment > 0
                ? [
                    {
                      label: 'To Pay',
                      value: stats.awaitingPayment,
                      filter: 'payment' as FilterTab,
                      urgent: true,
                    },
                  ]
                : []),
              {
                label: 'Awaiting Ship',
                value: stats.awaitingShipment,
                filter: 'awaiting' as FilterTab,
              },
              { label: 'In Transit', value: stats.inTransit, filter: 'shipped' as FilterTab },
              { label: 'Delivered', value: stats.delivered, filter: 'delivered' as FilterTab },
              { label: 'Completed', value: stats.completed, filter: 'completed' as FilterTab },
            ].map((stat) => (
              <button
                key={stat.label}
                className={`${styles.statPill} ${activeFilter === stat.filter && topTab === 'orders' ? styles.statPillActive : ''} ${'urgent' in stat && stat.urgent ? styles.statPillUrgent : ''}`}
                onClick={() => {
                  setTopTab('orders');
                  setActiveFilter(stat.filter);
                }}
              >
                <span className={styles.statNum}>{stat.value}</span>
                <span className={styles.statLbl}>{stat.label}</span>
              </button>
            ))}
          </div>
        </header>

        {/* Tab Switcher */}
        <div className={styles.tabSection}>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${topTab === 'orders' ? styles.tabActive : ''}`}
              onClick={() => setTopTab('orders')}
            >
              <FiShoppingBag /> Orders
              {stats.total > 0 && <span className={styles.tabCount}>{stats.total}</span>}
            </button>
            <button
              className={`${styles.tab} ${topTab === 'offers' ? styles.tabActive : ''}`}
              onClick={() => setTopTab('offers')}
            >
              <FiTag /> Offers
              {offerStats && (offerStats.pending > 0 || offerStats.countered > 0) && (
                <span className={styles.tabBadge}>
                  {(offerStats.pending || 0) + (offerStats.countered || 0)}
                </span>
              )}
            </button>
          </div>

          {/* Sub-filter for offers */}
          {topTab === 'offers' && (
            <div className={styles.subFilters}>
              {(['all', 'pending', 'countered', 'accepted', 'rejected'] as OfferFilter[]).map(
                (f) => {
                  const count =
                    f === 'all'
                      ? offerStats?.total || 0
                      : f === 'rejected'
                        ? (offerStats?.rejected || 0) + (offerStats?.auto_rejected || 0)
                        : (offerStats as any)?.[f] || 0;
                  return (
                    <button
                      key={f}
                      className={`${styles.subFilter} ${offerFilter === f ? styles.subFilterActive : ''}`}
                      onClick={() => setOfferFilter(f)}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {count > 0 && <span className={styles.subFilterCount}>{count}</span>}
                    </button>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* Error Banner */}
        {error && (
          <div className={styles.errorBanner}>
            <FiAlertCircle />
            <span>{error}</span>
            <button onClick={() => setError(null)}>
              <FiX />
            </button>
          </div>
        )}

        {/* ===== ORDERS TAB ===== */}
        {topTab === 'orders' && (
          <div className={styles.content}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <FiLoader className={styles.spinner} />
                <p>Loading your orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className={styles.emptyState}>
                <FiShoppingBag className={styles.emptyIcon} />
                <h2>{activeFilter === 'all' ? 'No Orders Yet' : `No ${activeFilter} orders`}</h2>
                <p>
                  {activeFilter === 'all'
                    ? 'Your purchases will appear here once you buy items from the marketplace.'
                    : 'Orders matching this filter will appear here.'}
                </p>
                {activeFilter === 'all' && (
                  <Link href="/marketplace" className={styles.browseLink}>
                    Browse Marketplace <FiChevronRight />
                  </Link>
                )}
              </div>
            ) : (
              <div className={styles.ordersList}>
                {filteredOrders.map((order) => {
                  const statusInfo = getStatusInfo(order.status);
                  const StatusIcon = statusInfo.icon;
                  const progress = getTimelineProgress(order.status);
                  const isExpanded = expandedOrder === order._id;

                  return (
                    <motion.div
                      key={order._id}
                      className={`${styles.orderCard} ${isExpanded ? styles.orderCardExpanded : ''}`}
                      layout
                    >
                      {/* Compact Order Row */}
                      <div
                        className={styles.orderRow}
                        onClick={() => setExpandedOrder(isExpanded ? null : order._id)}
                      >
                        <div className={styles.orderThumb}>
                          {order.assetImage ? (
                            <img src={order.assetImage} alt={order.assetTitle} />
                          ) : (
                            <FiPackage />
                          )}
                        </div>

                        <div className={styles.orderInfo}>
                          <div className={styles.orderTopLine}>
                            <h3>{order.assetTitle}</h3>
                            <span className={styles.orderAmount}>
                              ${order.amount.toLocaleString()}
                            </span>
                          </div>
                          <div className={styles.orderBottomLine}>
                            <span className={styles.orderMeta}>
                              {order.assetBrand && (
                                <span className={styles.brand}>{order.assetBrand}</span>
                              )}
                              <span className={styles.dot} />
                              <span>{order.vendorName}</span>
                              {order.vendorVerified && (
                                <FiCheckCircle className={styles.verifiedTick} />
                              )}
                              <span className={styles.dot} />
                              <span>{formatTimeAgo(order.fundedAt || order.createdAt)}</span>
                            </span>
                          </div>
                        </div>

                        <div className={`${styles.statusChip} ${statusInfo.className}`}>
                          <StatusIcon />
                          <span>{statusInfo.label}</span>
                        </div>

                        <FiChevronDown
                          className={`${styles.expandArrow} ${isExpanded ? styles.expandArrowOpen : ''}`}
                        />
                      </div>

                      {/* Mini Timeline */}
                      <div className={styles.miniTimeline}>
                        {TIMELINE_STEPS.map((step, i) => {
                          const isCompleted = i < progress;
                          const isCurrent = i === progress - 1;
                          return (
                            <React.Fragment key={step.key}>
                              {i > 0 && (
                                <div
                                  className={`${styles.tConnector} ${isCompleted ? styles.tConnectorDone : ''}`}
                                />
                              )}
                              <div
                                className={`${styles.tDot} ${isCompleted ? styles.tDotDone : ''} ${isCurrent ? styles.tDotCurrent : ''}`}
                                title={step.label}
                              />
                            </React.Fragment>
                          );
                        })}
                      </div>

                      {/* Expanded Detail Panel */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            className={styles.expandedPanel}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          >
                            <div className={styles.detailGrid}>
                              {/* Full Timeline */}
                              <div className={styles.timelinePanel}>
                                <div className={styles.panelLabel}>Order Progress</div>
                                <div className={styles.verticalTimeline}>
                                  {TIMELINE_STEPS.map((step, i) => {
                                    const isCompleted = i < progress;
                                    const StepIcon = step.icon;
                                    return (
                                      <div
                                        key={step.key}
                                        className={`${styles.vtStep} ${isCompleted ? styles.vtStepDone : ''}`}
                                      >
                                        <div className={styles.vtIcon}>
                                          {isCompleted ? <FiCheck /> : <StepIcon />}
                                        </div>
                                        <span>{step.label}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Details Column */}
                              <div className={styles.detailColumn}>
                                {/* Tracking */}
                                {order.trackingNumber && (
                                  <div className={styles.detailCard}>
                                    <div className={styles.detailCardHeader}>
                                      <FiTruck /> Tracking
                                    </div>
                                    <div className={styles.trackingRow}>
                                      <div>
                                        <span className={styles.carrier}>
                                          {CARRIER_NAMES[order.trackingCarrier || ''] ||
                                            order.trackingCarrier?.toUpperCase()}
                                        </span>
                                        <span className={styles.trackNum}>
                                          {order.trackingNumber}
                                        </span>
                                        {order.shippedAt && (
                                          <span className={styles.trackDate}>
                                            Shipped {new Date(order.shippedAt).toLocaleDateString()}
                                          </span>
                                        )}
                                      </div>
                                      {(order.trackingUrl ||
                                        getTrackingUrl(
                                          order.trackingCarrier || '',
                                          order.trackingNumber
                                        )) && (
                                        <a
                                          href={
                                            order.trackingUrl ||
                                            getTrackingUrl(
                                              order.trackingCarrier || '',
                                              order.trackingNumber
                                            ) ||
                                            '#'
                                          }
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={styles.trackBtn}
                                        >
                                          Track <FiExternalLink />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Shipping Address */}
                                {order.shippingAddress && (
                                  <div className={styles.detailCard}>
                                    <div className={styles.detailCardHeader}>
                                      <FiMapPin /> Shipping To
                                    </div>
                                    <p className={styles.addressName}>
                                      {order.shippingAddress.fullName}
                                    </p>
                                    {formatAddress(order.shippingAddress)?.map((line, idx) => (
                                      <p key={idx} className={styles.addressLine}>
                                        {line}
                                      </p>
                                    ))}
                                  </div>
                                )}

                                {/* Delivery Confirmation */}
                                {order.deliveryConfirmation && (
                                  <div
                                    className={`${styles.detailCard} ${styles.detailCardSuccess}`}
                                  >
                                    <div className={styles.detailCardHeader}>
                                      <FiCheckCircle /> Delivery Confirmed
                                    </div>
                                    <p className={styles.confirmDate}>
                                      {new Date(
                                        order.deliveryConfirmation.confirmedAt || ''
                                      ).toLocaleDateString()}
                                    </p>
                                    {order.deliveryConfirmation.rating && (
                                      <div className={styles.ratingDisplay}>
                                        {[1, 2, 3, 4, 5].map((star) => (
                                          <FiStar
                                            key={star}
                                            className={
                                              star <= (order.deliveryConfirmation?.rating || 0)
                                                ? styles.starFilled
                                                : styles.starEmpty
                                            }
                                          />
                                        ))}
                                      </div>
                                    )}
                                    {order.deliveryConfirmation.reviewText && (
                                      <p className={styles.reviewText}>
                                        &ldquo;{order.deliveryConfirmation.reviewText}&rdquo;
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className={styles.orderActions}>
                              {(order.status === 'shipped' ||
                                (order.status === 'delivered' && !order.deliveryConfirmation)) && (
                                <button
                                  className={styles.primaryAction}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openConfirmModal(order);
                                  }}
                                >
                                  <FiCheckCircle /> Confirm Delivery
                                </button>
                              )}
                              {order.status === 'funded' && (
                                <div className={styles.awaitingMsg}>
                                  <FiClock /> Waiting for vendor to ship your item
                                </div>
                              )}
                              {order.nftMint && (
                                <Link
                                  href={`/marketplace?nft=${order.nftMint}`}
                                  className={styles.secondaryAction}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  View Listing <FiExternalLink />
                                </Link>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== MY OFFERS TAB ===== */}
        {topTab === 'offers' && (
          <div className={styles.content}>
            {isLoadingOffers ? (
              <div className={styles.loadingState}>
                <FiLoader className={styles.spinner} />
                <p>Loading your offers...</p>
              </div>
            ) : filteredOffers.length === 0 ? (
              <div className={styles.emptyState}>
                <FiTag className={styles.emptyIcon} />
                <h2>{offerFilter === 'all' ? 'No Offers Yet' : `No ${offerFilter} offers`}</h2>
                <p>Offers you make on marketplace listings will appear here.</p>
                {offerFilter === 'all' && (
                  <Link href="/marketplace" className={styles.browseLink}>
                    Browse Marketplace <FiChevronRight />
                  </Link>
                )}
              </div>
            ) : (
              <div className={styles.ordersList}>
                {filteredOffers.map((offer) => {
                  const statusInfo = getOfferStatusInfo(offer.status);
                  const listPrice = offer.escrowListingPrice || offer.assetListPrice || 0;
                  const lastCounter = offer.latestCounterOffer;

                  return (
                    <div key={offer._id} className={styles.offerCard}>
                      {/* Offer Row */}
                      <div className={styles.offerRow}>
                        <div className={styles.orderThumb}>
                          {offer.assetImage ? (
                            <img
                              src={resolveImageUrl(offer.assetImage) || PLACEHOLDER_IMAGE}
                              alt={offer.assetModel || 'Asset'}
                            />
                          ) : (
                            <FiTag />
                          )}
                        </div>

                        <div className={styles.orderInfo}>
                          <div className={styles.orderTopLine}>
                            <h3>{offer.assetModel || 'Luxury Watch'}</h3>
                            <div className={styles.priceStack}>
                              <span className={styles.offerPrice}>
                                ${offer.offerPriceUSD.toLocaleString()}
                              </span>
                              {listPrice > 0 && (
                                <span className={styles.listPrice}>
                                  List: ${listPrice.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={styles.orderBottomLine}>
                            <span className={styles.orderMeta}>
                              {offer.vendorName && <span>{offer.vendorName}</span>}
                              <span className={styles.dot} />
                              <span>{formatTimeAgo(offer.createdAt)}</span>
                            </span>
                          </div>
                        </div>

                        <div className={`${styles.statusChip} ${statusInfo.className}`}>
                          <span>{statusInfo.label}</span>
                        </div>
                      </div>

                      {/* Counter-offer history */}
                      {offer.counterOffers.length > 0 && (
                        <div className={styles.counterSection}>
                          <div className={styles.counterLabel}>
                            <FiRefreshCw /> Negotiation
                          </div>
                          <div className={styles.counterChain}>
                            <div className={styles.counterStep}>
                              <span className={styles.counterWho}>You</span>
                              <span className={styles.counterAmt}>
                                ${offer.offerPriceUSD.toLocaleString()}
                              </span>
                            </div>
                            {offer.counterOffers.map((co, idx) => (
                              <React.Fragment key={idx}>
                                <FiChevronRight className={styles.counterArrow} />
                                <div className={styles.counterStep}>
                                  <span className={styles.counterWho}>
                                    {co.fromType === 'vendor' ? 'Vendor' : 'You'}
                                  </span>
                                  <span className={styles.counterAmt}>
                                    ${co.amountUSD.toLocaleString()}
                                  </span>
                                  {co.message && (
                                    <span className={styles.counterNote}>{co.message}</span>
                                  )}
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Offer Actions */}
                      <div className={styles.offerActions}>
                        {offer.status === 'countered' && lastCounter?.fromType === 'vendor' && (
                          <>
                            <button
                              className={styles.primaryAction}
                              onClick={() => handleOfferAction(offer._id, 'accept_counter')}
                              disabled={isResponding}
                            >
                              <FiCheck /> Accept ${lastCounter.amountUSD.toLocaleString()}
                            </button>
                            <button
                              className={styles.secondaryAction}
                              onClick={() => openCounterModal(offer)}
                              disabled={isResponding}
                            >
                              <FiRefreshCw /> Counter
                            </button>
                            <button
                              className={styles.dangerAction}
                              onClick={() => handleOfferAction(offer._id, 'reject_counter')}
                              disabled={isResponding}
                            >
                              <FiX /> Reject
                            </button>
                          </>
                        )}
                        {offer.status === 'pending' && (
                          <button
                            className={styles.dangerAction}
                            onClick={() => handleOfferAction(offer._id, 'withdraw')}
                            disabled={isResponding}
                          >
                            <FiX /> Withdraw Offer
                          </button>
                        )}
                        {offer.status === 'accepted' && offer.escrowPda && (
                          <Link
                            href={`/marketplace?pay=${offer.escrowPda}`}
                            className={styles.primaryAction}
                          >
                            <FiDollarSign /> Deposit Funds
                          </Link>
                        )}
                        {offer.status === 'countered' && lastCounter?.fromType === 'buyer' && (
                          <div className={styles.awaitingMsg}>
                            <FiClock /> Waiting for vendor to respond
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== CONFIRM DELIVERY MODAL ===== */}
        <AnimatePresence>
          {showConfirmModal && selectedOrder && (
            <motion.div
              className={styles.modalOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isConfirming && setShowConfirmModal(false)}
            >
              <motion.div
                className={styles.modalContent}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={styles.modalClose}
                  onClick={() => !isConfirming && setShowConfirmModal(false)}
                  disabled={isConfirming}
                >
                  <FiX />
                </button>
                {confirmSuccess ? (
                  <div className={styles.successState}>
                    <FiCheckCircle className={styles.successIcon} />
                    <h2>Delivery Confirmed!</h2>
                    <p>Thank you for confirming. The transaction will now be completed.</p>
                  </div>
                ) : (
                  <>
                    <div className={styles.modalHeader}>
                      <FiCheckCircle className={styles.modalIcon} />
                      <div>
                        <h2>Confirm Delivery</h2>
                        <p>Confirm that you&apos;ve received your item</p>
                      </div>
                    </div>
                    <div className={styles.orderSummary}>
                      <div className={styles.summaryImage}>
                        {selectedOrder.assetImage ? (
                          <img src={selectedOrder.assetImage} alt={selectedOrder.assetTitle} />
                        ) : (
                          <FiPackage />
                        )}
                      </div>
                      <div className={styles.summaryInfo}>
                        <h3>{selectedOrder.assetTitle}</h3>
                        <p>${selectedOrder.amount.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className={styles.modalForm}>
                      <div className={styles.formGroup}>
                        <label>Rate Your Experience</label>
                        <div className={styles.ratingInput}>
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setRating(star)}
                              className={`${styles.starButton} ${star <= rating ? styles.starActive : ''}`}
                            >
                              <FiStar />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.formGroup}>
                        <label>
                          <FiMessageSquare /> Review (optional)
                        </label>
                        <textarea
                          placeholder="Share your experience..."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          rows={3}
                          disabled={isConfirming}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label>
                          <FiInfo /> Delivery Notes (optional)
                        </label>
                        <textarea
                          placeholder="Any notes about the delivery or item condition..."
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          rows={2}
                          disabled={isConfirming}
                        />
                      </div>
                      <div className={styles.warningBox}>
                        <FiAlertCircle />
                        <span>
                          By confirming delivery, you acknowledge that you have received the item in
                          satisfactory condition. Funds will be released to the vendor.
                        </span>
                      </div>
                      {error && (
                        <div className={styles.formError}>
                          <FiAlertCircle />
                          <span>{error}</span>
                        </div>
                      )}
                      <div className={styles.modalActions}>
                        <button
                          className={styles.cancelButton}
                          onClick={() => setShowConfirmModal(false)}
                          disabled={isConfirming}
                        >
                          Cancel
                        </button>
                        <button
                          className={styles.confirmSubmitButton}
                          onClick={handleConfirmDelivery}
                          disabled={isConfirming}
                        >
                          {isConfirming ? (
                            <>
                              <FiLoader className={styles.spinner} /> Confirming...
                            </>
                          ) : (
                            <>
                              <FiCheckCircle /> Confirm Delivery
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== COUNTER-OFFER MODAL ===== */}
        <AnimatePresence>
          {showCounterModal && selectedOffer && (
            <motion.div
              className={styles.modalOverlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isResponding && setShowCounterModal(false)}
            >
              <motion.div
                className={styles.modalContent}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className={styles.modalClose}
                  onClick={() => !isResponding && setShowCounterModal(false)}
                  disabled={isResponding}
                >
                  <FiX />
                </button>
                <div className={styles.modalHeader}>
                  <FiRefreshCw className={styles.modalIcon} />
                  <div>
                    <h2>Counter-Offer</h2>
                    <p>Send a new price to the vendor</p>
                  </div>
                </div>
                <div className={styles.orderSummary}>
                  <div className={styles.summaryImage}>
                    {selectedOffer.assetImage ? (
                      <img
                        src={resolveImageUrl(selectedOffer.assetImage) || PLACEHOLDER_IMAGE}
                        alt={selectedOffer.assetModel || ''}
                      />
                    ) : (
                      <FiTag />
                    )}
                  </div>
                  <div className={styles.summaryInfo}>
                    <h3>{selectedOffer.assetModel || 'Luxury Watch'}</h3>
                    <p>
                      Vendor asked: $
                      {selectedOffer.latestCounterOffer?.amountUSD.toLocaleString() || '?'}
                    </p>
                  </div>
                </div>
                <div className={styles.modalForm}>
                  <div className={styles.formGroup}>
                    <label>Your Counter-Offer (USD)</label>
                    <div className={styles.counterInputWrap}>
                      <span className={styles.counterCurrency}>$</span>
                      <input
                        type="number"
                        className={styles.counterInput}
                        placeholder="0.00"
                        value={counterAmount}
                        onChange={(e) => setCounterAmount(e.target.value)}
                        min="0"
                        step="0.01"
                        disabled={isResponding}
                      />
                    </div>
                  </div>
                  <div className={styles.formGroup}>
                    <label>Message (optional)</label>
                    <textarea
                      placeholder="Add context for the vendor..."
                      value={counterMessage}
                      onChange={(e) => setCounterMessage(e.target.value)}
                      rows={2}
                      disabled={isResponding}
                    />
                  </div>
                  {error && (
                    <div className={styles.formError}>
                      <FiAlertCircle />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className={styles.modalActions}>
                    <button
                      className={styles.cancelButton}
                      onClick={() => setShowCounterModal(false)}
                      disabled={isResponding}
                    >
                      Cancel
                    </button>
                    <button
                      className={styles.confirmSubmitButton}
                      onClick={handleCounterSubmit}
                      disabled={isResponding || !counterAmount || parseFloat(counterAmount) <= 0}
                    >
                      {isResponding ? (
                        <>
                          <FiLoader className={styles.spinner} /> Sending...
                        </>
                      ) : (
                        <>
                          <FiRefreshCw /> Send Counter
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default MyOrdersPage;
