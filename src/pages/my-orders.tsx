// src/pages/my-orders.tsx
// Buyer's order tracking page with delivery confirmation
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
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
  FiUser,
  FiPhone,
  FiMail,
  FiInfo,
  FiCheck,
} from 'react-icons/fi';

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
  awaitingShipment: number;
  inTransit: number;
  delivered: number;
  completed: number;
}

type FilterTab = 'all' | 'awaiting' | 'shipped' | 'delivered' | 'completed';

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

const MyOrdersPage: React.FC = () => {
  const wallet = useWallet();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    awaitingShipment: 0,
    inTransit: 0,
    delivered: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Confirm delivery modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

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
          data.stats || { total: 0, awaitingShipment: 0, inTransit: 0, delivered: 0, completed: 0 }
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

  // Open confirm delivery modal
  const openConfirmModal = (order: Order) => {
    setSelectedOrder(order);
    setRating(5);
    setReviewText('');
    setDeliveryNotes('');
    setConfirmSuccess(false);
    setShowConfirmModal(true);
  };

  // Handle confirm delivery
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
          rating: rating,
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

  // Get status display info
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'funded':
        return { label: 'Awaiting Shipment', icon: FiClock, className: styles.statusAwaiting };
      case 'shipped':
        return { label: 'In Transit', icon: FiTruck, className: styles.statusShipped };
      case 'delivered':
        return { label: 'Delivered', icon: FiPackage, className: styles.statusDelivered };
      case 'released':
        return { label: 'Completed', icon: FiCheckCircle, className: styles.statusCompleted };
      default:
        return { label: status, icon: FiPackage, className: '' };
    }
  };

  // Get tracking URL
  const getTrackingUrl = (carrier: string, number: string): string | null => {
    const urls: Record<string, string> = {
      fedex: `https://www.fedex.com/fedextrack/?trknbr=${number}`,
      ups: `https://www.ups.com/track?tracknum=${number}`,
      dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${number}`,
      usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`,
    };
    return urls[carrier] || null;
  };

  // Format address
  const formatAddress = (addr: ShippingAddress | null) => {
    if (!addr) return null;
    return [
      addr.street1,
      addr.street2,
      [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean);
  };

  // Not connected state
  if (!wallet.connected) {
    return (
      <>
        <Head>
          <title>My Orders | LuxHub</title>
        </Head>
        <div className={styles.container}>
          <div className={styles.connectPrompt}>
            <FiShoppingBag className={styles.connectIcon} />
            <h1>My Orders</h1>
            <p>Connect your wallet to view your purchases and track deliveries.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>My Orders | LuxHub</title>
        <meta name="description" content="Track your LuxHub orders and confirm deliveries" />
      </Head>

      <div className={styles.container}>
        {/* Page Header */}
        <header className={styles.pageHeader}>
          <Link href="/marketplace" className={styles.backLink}>
            <FiArrowLeft /> Back to Marketplace
          </Link>
          <div className={styles.headerContent}>
            <div className={styles.headerTitle}>
              <FiShoppingBag className={styles.headerIcon} />
              <div>
                <h1>My Orders</h1>
                <p>Track your purchases and confirm deliveries</p>
              </div>
            </div>
            <div className={styles.statsCards}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{stats.total}</span>
                <span className={styles.statLabel}>Total Orders</span>
              </div>
              <div className={styles.statCard}>
                <FiTruck className={styles.statIcon} />
                <span className={styles.statValue}>{stats.inTransit}</span>
                <span className={styles.statLabel}>In Transit</span>
              </div>
              <div className={styles.statCard}>
                <FiPackage className={styles.statIcon} />
                <span className={styles.statValue}>{stats.delivered}</span>
                <span className={styles.statLabel}>To Confirm</span>
              </div>
            </div>
          </div>
        </header>

        {/* Filter Tabs */}
        <div className={styles.filterSection}>
          <div className={styles.filterTabs}>
            <button
              className={`${styles.filterTab} ${activeFilter === 'all' ? styles.active : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All Orders
              <span className={styles.filterCount}>{stats.total}</span>
            </button>
            <button
              className={`${styles.filterTab} ${activeFilter === 'awaiting' ? styles.active : ''}`}
              onClick={() => setActiveFilter('awaiting')}
            >
              Awaiting Shipment
              {stats.awaitingShipment > 0 && (
                <span className={styles.filterBadge}>{stats.awaitingShipment}</span>
              )}
            </button>
            <button
              className={`${styles.filterTab} ${activeFilter === 'shipped' ? styles.active : ''}`}
              onClick={() => setActiveFilter('shipped')}
            >
              In Transit
              {stats.inTransit > 0 && <span className={styles.filterBadge}>{stats.inTransit}</span>}
            </button>
            <button
              className={`${styles.filterTab} ${activeFilter === 'delivered' ? styles.active : ''}`}
              onClick={() => setActiveFilter('delivered')}
            >
              Delivered
              {stats.delivered > 0 && <span className={styles.filterBadge}>{stats.delivered}</span>}
            </button>
            <button
              className={`${styles.filterTab} ${activeFilter === 'completed' ? styles.active : ''}`}
              onClick={() => setActiveFilter('completed')}
            >
              Completed
            </button>
          </div>
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

        {/* Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <FiLoader className={styles.spinner} />
              <p>Loading your orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className={styles.emptyState}>
              <FiShoppingBag className={styles.emptyIcon} />
              <h2>
                {activeFilter === 'all'
                  ? 'No Orders Yet'
                  : activeFilter === 'awaiting'
                    ? 'No Orders Awaiting Shipment'
                    : activeFilter === 'shipped'
                      ? 'No Orders In Transit'
                      : activeFilter === 'delivered'
                        ? 'No Orders to Confirm'
                        : 'No Completed Orders'}
              </h2>
              <p>
                {activeFilter === 'all'
                  ? 'Your purchases will appear here once you buy items from the marketplace.'
                  : 'Orders matching this filter will appear here.'}
              </p>
              {activeFilter === 'all' && (
                <Link href="/marketplace" className={styles.browseLink}>
                  Browse Marketplace
                </Link>
              )}
            </div>
          ) : (
            <div className={styles.ordersList}>
              {filteredOrders.map((order) => {
                const statusInfo = getStatusInfo(order.status);
                const StatusIcon = statusInfo.icon;

                return (
                  <div key={order._id} className={styles.orderCard}>
                    {/* Order Header */}
                    <div className={styles.orderHeader}>
                      <div className={styles.orderImage}>
                        {order.assetImage ? (
                          <img src={order.assetImage} alt={order.assetTitle} />
                        ) : (
                          <div className={styles.noImage}>
                            <FiPackage />
                          </div>
                        )}
                      </div>
                      <div className={styles.orderDetails}>
                        <h3 className={styles.orderTitle}>{order.assetTitle}</h3>
                        {order.assetBrand && (
                          <span className={styles.orderBrand}>{order.assetBrand}</span>
                        )}
                        <div className={styles.orderMeta}>
                          <span className={styles.orderPrice}>
                            ${order.amount.toLocaleString()}
                          </span>
                          <span className={styles.orderVendor}>
                            from {order.vendorName}
                            {order.vendorVerified && (
                              <FiCheckCircle className={styles.verifiedBadge} />
                            )}
                          </span>
                        </div>
                        <span className={styles.orderDate}>
                          Purchased{' '}
                          {new Date(order.fundedAt || order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className={`${styles.orderStatus} ${statusInfo.className}`}>
                        <StatusIcon />
                        <span>{statusInfo.label}</span>
                      </div>
                    </div>

                    {/* Order Timeline */}
                    <div className={styles.timeline}>
                      <div className={`${styles.timelineStep} ${styles.completed}`}>
                        <div className={styles.timelineIcon}>
                          <FiCheck />
                        </div>
                        <span>Order Placed</span>
                      </div>
                      <div className={styles.timelineConnector} />
                      <div
                        className={`${styles.timelineStep} ${
                          ['shipped', 'delivered', 'released'].includes(order.status)
                            ? styles.completed
                            : ''
                        }`}
                      >
                        <div className={styles.timelineIcon}>
                          {['shipped', 'delivered', 'released'].includes(order.status) ? (
                            <FiCheck />
                          ) : (
                            <FiTruck />
                          )}
                        </div>
                        <span>Shipped</span>
                      </div>
                      <div className={styles.timelineConnector} />
                      <div
                        className={`${styles.timelineStep} ${
                          ['delivered', 'released'].includes(order.status) ? styles.completed : ''
                        }`}
                      >
                        <div className={styles.timelineIcon}>
                          {['delivered', 'released'].includes(order.status) ? (
                            <FiCheck />
                          ) : (
                            <FiPackage />
                          )}
                        </div>
                        <span>Delivered</span>
                      </div>
                      <div className={styles.timelineConnector} />
                      <div
                        className={`${styles.timelineStep} ${order.status === 'released' ? styles.completed : ''}`}
                      >
                        <div className={styles.timelineIcon}>
                          {order.status === 'released' ? <FiCheck /> : <FiCheckCircle />}
                        </div>
                        <span>Completed</span>
                      </div>
                    </div>

                    {/* Tracking Section */}
                    {order.trackingNumber && (
                      <div className={styles.trackingSection}>
                        <h4>
                          <FiTruck /> Tracking Information
                        </h4>
                        <div className={styles.trackingCard}>
                          <div className={styles.trackingInfo}>
                            <span className={styles.trackingCarrier}>
                              {CARRIER_NAMES[order.trackingCarrier || ''] ||
                                order.trackingCarrier?.toUpperCase()}
                            </span>
                            <span className={styles.trackingNumber}>{order.trackingNumber}</span>
                            {order.shippedAt && (
                              <span className={styles.shippedDate}>
                                Shipped {new Date(order.shippedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {(order.trackingUrl ||
                            getTrackingUrl(order.trackingCarrier || '', order.trackingNumber)) && (
                            <a
                              href={
                                order.trackingUrl ||
                                getTrackingUrl(order.trackingCarrier || '', order.trackingNumber) ||
                                '#'
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.trackLink}
                            >
                              Track Package <FiExternalLink />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Shipping Address */}
                    {order.shippingAddress && (
                      <div className={styles.addressSection}>
                        <h4>
                          <FiMapPin /> Shipping To
                        </h4>
                        <div className={styles.addressCard}>
                          <p className={styles.addressName}>{order.shippingAddress.fullName}</p>
                          {formatAddress(order.shippingAddress)?.map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Delivery Confirmation Info */}
                    {order.deliveryConfirmation && (
                      <div className={styles.confirmationSection}>
                        <h4>
                          <FiCheckCircle /> Delivery Confirmed
                        </h4>
                        <div className={styles.confirmationCard}>
                          <p>
                            Confirmed on{' '}
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
                              "{order.deliveryConfirmation.reviewText}"
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className={styles.orderActions}>
                      {order.status === 'shipped' && (
                        <button
                          className={styles.confirmButton}
                          onClick={() => openConfirmModal(order)}
                        >
                          <FiCheckCircle /> Confirm Delivery
                        </button>
                      )}
                      {order.status === 'delivered' && !order.deliveryConfirmation && (
                        <button
                          className={styles.confirmButton}
                          onClick={() => openConfirmModal(order)}
                        >
                          <FiCheckCircle /> Confirm Delivery
                        </button>
                      )}
                      {order.status === 'funded' && (
                        <div className={styles.awaitingMessage}>
                          <FiInfo /> Waiting for vendor to ship your item
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirm Delivery Modal */}
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
                        <p>Confirm that you've received your item</p>
                      </div>
                    </div>

                    {/* Order Summary */}
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
                      {/* Rating */}
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

                      {/* Review */}
                      <div className={styles.formGroup}>
                        <label>
                          <FiMessageSquare /> Review (optional)
                        </label>
                        <textarea
                          placeholder="Share your experience with this purchase..."
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          rows={3}
                          disabled={isConfirming}
                        />
                      </div>

                      {/* Delivery Notes */}
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

                      {/* Warning */}
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
      </div>
    </>
  );
};

export default MyOrdersPage;
