// src/components/vendor/OrderShipmentPanel.tsx
// Vendor panel to view orders, see buyer shipping addresses, and submit tracking info
import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../styles/OrderShipmentPanel.module.css';
import {
  FiTruck,
  FiPackage,
  FiMapPin,
  FiUser,
  FiPhone,
  FiMail,
  FiCheckCircle,
  FiClock,
  FiExternalLink,
  FiX,
  FiLoader,
  FiAlertCircle,
  FiCamera,
  FiInfo,
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

interface Order {
  _id: string;
  assetTitle: string;
  assetBrand?: string;
  assetImage?: string;
  amount: number;
  buyerWallet: string;
  buyerUsername?: string;
  status: string;
  rawStatus: string;
  buyerShippingAddress: ShippingAddress | null;
  shipmentStatus?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  shipmentProofUrls?: string[];
  vendorShipmentNotes?: string;
  estimatedDeliveryDate?: string;
  actualDeliveryDate?: string;
  shippedAt?: string;
  escrowPda: string;
  nftMint?: string;
  createdAt: string;
  fundedAt?: string;
}

interface OrderStats {
  total: number;
  awaitingShipment: number;
  shipped: number;
  delivered: number;
  completed: number;
}

const CARRIERS = [
  { value: 'fedex', label: 'FedEx' },
  { value: 'ups', label: 'UPS' },
  { value: 'dhl', label: 'DHL' },
  { value: 'usps', label: 'USPS' },
  { value: 'ontrac', label: 'OnTrac' },
  { value: 'lasership', label: 'LaserShip' },
  { value: 'purolator', label: 'Purolator' },
  { value: 'canada_post', label: 'Canada Post' },
  { value: 'royal_mail', label: 'Royal Mail' },
  { value: 'australia_post', label: 'Australia Post' },
  { value: 'japan_post', label: 'Japan Post' },
  { value: 'other', label: 'Other' },
];

type FilterTab = 'all' | 'awaiting' | 'shipped' | 'delivered' | 'completed';

const OrderShipmentPanel: React.FC = () => {
  const wallet = useWallet();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats>({
    total: 0,
    awaitingShipment: 0,
    shipped: 0,
    delivered: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('awaiting');

  // Shipment modal state
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingCarrier, setTrackingCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [proofFiles, setProofFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    if (!wallet.publicKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/vendor/orders?wallet=${wallet.publicKey.toBase58()}`);
      const data = await res.json();

      if (res.ok) {
        setOrders(data.orders || []);
        setStats(
          data.stats || { total: 0, awaitingShipment: 0, shipped: 0, delivered: 0, completed: 0 }
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
    fetchOrders();
  }, [fetchOrders]);

  // Filter orders based on active tab
  const filteredOrders = orders.filter((order) => {
    switch (activeFilter) {
      case 'awaiting':
        return order.rawStatus === 'funded';
      case 'shipped':
        return order.rawStatus === 'shipped';
      case 'delivered':
        return order.rawStatus === 'delivered';
      case 'completed':
        return order.rawStatus === 'released';
      default:
        return true;
    }
  });

  // Open shipment modal
  const openShipmentModal = (order: Order) => {
    setSelectedOrder(order);
    setTrackingCarrier(order.trackingCarrier || '');
    setTrackingNumber(order.trackingNumber || '');
    setShipmentNotes(order.vendorShipmentNotes || '');
    setProofFiles([]);
    setSubmitSuccess(false);
    setShowShipmentModal(true);
  };

  // Handle proof file selection
  const handleProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setProofFiles(Array.from(files).slice(0, 5));
    }
  };

  // Upload proof images to IPFS
  const uploadProofToIPFS = async (): Promise<string[]> => {
    const urls: string[] = [];

    for (const file of proofFiles) {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/pinata/uploadImage', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Failed to upload proof image');
      }

      const data = await res.json();
      const ipfsUrl = `${process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/'}${data.IpfsHash}`;
      urls.push(ipfsUrl);
    }

    return urls;
  };

  // Submit shipment info
  const handleSubmitShipment = async () => {
    if (!selectedOrder || !wallet.publicKey) return;

    if (!trackingCarrier || !trackingNumber) {
      setError('Please enter carrier and tracking number');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload proof images if provided
      let proofUrls: string[] = [];
      if (proofFiles.length > 0) {
        proofUrls = await uploadProofToIPFS();
      }

      // Submit shipment to API
      const res = await fetch('/api/vendor/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escrowId: selectedOrder._id,
          vendorWallet: wallet.publicKey.toBase58(),
          trackingCarrier,
          trackingNumber,
          notes: shipmentNotes || undefined,
          proofUrls: proofUrls.length > 0 ? proofUrls : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitSuccess(true);
        // Refresh orders
        setTimeout(() => {
          setShowShipmentModal(false);
          fetchOrders();
        }, 2000);
      } else {
        setError(data.error || 'Failed to submit shipment');
      }
    } catch (err) {
      console.error('Error submitting shipment:', err);
      setError('Failed to submit shipment info');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format address for display
  const formatAddress = (addr: ShippingAddress | null) => {
    if (!addr) return null;
    const parts = [
      addr.street1,
      addr.street2,
      [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
      addr.country,
    ].filter(Boolean);
    return parts;
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

  if (!wallet.connected) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <FiTruck className={styles.emptyIcon} />
          <h3>Connect Wallet</h3>
          <p>Connect your wallet to manage order shipments</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header with Stats */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <FiTruck className={styles.headerIcon} />
          <div>
            <h2>Order Shipments</h2>
            <p>Manage shipping for your sold items</p>
          </div>
        </div>
        <div className={styles.statsRow}>
          <div className={styles.statBadge}>
            <FiClock />
            <span>{stats.awaitingShipment} Awaiting</span>
          </div>
          <div className={styles.statBadge}>
            <FiPackage />
            <span>{stats.shipped} Shipped</span>
          </div>
          <div className={styles.statBadge}>
            <FiCheckCircle />
            <span>{stats.delivered} Delivered</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={styles.filterTabs}>
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
          Shipped
          {stats.shipped > 0 && <span className={styles.filterBadge}>{stats.shipped}</span>}
        </button>
        <button
          className={`${styles.filterTab} ${activeFilter === 'delivered' ? styles.active : ''}`}
          onClick={() => setActiveFilter('delivered')}
        >
          Delivered
        </button>
        <button
          className={`${styles.filterTab} ${activeFilter === 'all' ? styles.active : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All Orders
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className={styles.errorBanner}>
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <FiX />
          </button>
        </div>
      )}

      {/* Orders List */}
      {isLoading ? (
        <div className={styles.loadingState}>
          <FiLoader className={styles.spinner} />
          <p>Loading orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className={styles.emptyState}>
          <FiPackage className={styles.emptyIcon} />
          <h3>
            {activeFilter === 'awaiting'
              ? 'No Orders Awaiting Shipment'
              : activeFilter === 'shipped'
                ? 'No Shipped Orders'
                : activeFilter === 'delivered'
                  ? 'No Delivered Orders'
                  : 'No Orders Yet'}
          </h3>
          <p>
            {activeFilter === 'awaiting'
              ? 'When buyers purchase your items, orders will appear here for you to ship.'
              : 'Orders matching this filter will appear here.'}
          </p>
        </div>
      ) : (
        <div className={styles.ordersList}>
          {filteredOrders.map((order) => (
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
                <div className={styles.orderInfo}>
                  <h3>{order.assetTitle}</h3>
                  {order.assetBrand && (
                    <span className={styles.orderBrand}>{order.assetBrand}</span>
                  )}
                  <div className={styles.orderMeta}>
                    <span className={styles.orderPrice}>${order.amount.toLocaleString()}</span>
                    <span className={styles.orderDate}>
                      {order.fundedAt
                        ? new Date(order.fundedAt).toLocaleDateString()
                        : new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className={styles.orderStatus}>
                  <span
                    className={`${styles.statusBadge} ${
                      order.rawStatus === 'funded'
                        ? styles.statusAwaiting
                        : order.rawStatus === 'shipped'
                          ? styles.statusShipped
                          : order.rawStatus === 'delivered'
                            ? styles.statusDelivered
                            : styles.statusCompleted
                    }`}
                  >
                    {order.rawStatus === 'funded'
                      ? 'Awaiting Shipment'
                      : order.rawStatus === 'shipped'
                        ? 'Shipped'
                        : order.rawStatus === 'delivered'
                          ? 'Delivered'
                          : order.rawStatus === 'released'
                            ? 'Completed'
                            : order.status}
                  </span>
                </div>
              </div>

              {/* Buyer Shipping Address */}
              {order.buyerShippingAddress && (
                <div className={styles.shippingSection}>
                  <h4>
                    <FiMapPin /> Ship To
                  </h4>
                  <div className={styles.addressCard}>
                    <div className={styles.addressName}>
                      <FiUser />
                      <strong>{order.buyerShippingAddress.fullName}</strong>
                    </div>
                    <div className={styles.addressLines}>
                      {formatAddress(order.buyerShippingAddress)?.map((line, idx) => (
                        <p key={idx}>{line}</p>
                      ))}
                    </div>
                    {order.buyerShippingAddress.phone && (
                      <div className={styles.addressContact}>
                        <FiPhone />
                        <span>{order.buyerShippingAddress.phone}</span>
                      </div>
                    )}
                    {order.buyerShippingAddress.email && (
                      <div className={styles.addressContact}>
                        <FiMail />
                        <span>{order.buyerShippingAddress.email}</span>
                      </div>
                    )}
                    {order.buyerShippingAddress.deliveryInstructions && (
                      <div className={styles.deliveryInstructions}>
                        <FiInfo />
                        <span>{order.buyerShippingAddress.deliveryInstructions}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tracking Info (if shipped) */}
              {order.trackingNumber && (
                <div className={styles.trackingSection}>
                  <h4>
                    <FiTruck /> Tracking Info
                  </h4>
                  <div className={styles.trackingCard}>
                    <div className={styles.trackingDetails}>
                      <span className={styles.trackingCarrier}>
                        {CARRIERS.find((c) => c.value === order.trackingCarrier)?.label ||
                          order.trackingCarrier?.toUpperCase()}
                      </span>
                      <span className={styles.trackingNumber}>{order.trackingNumber}</span>
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
                        className={styles.trackingLink}
                      >
                        Track Package <FiExternalLink />
                      </a>
                    )}
                  </div>
                  {order.shippedAt && (
                    <p className={styles.shippedDate}>
                      Shipped on {new Date(order.shippedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className={styles.orderActions}>
                {order.rawStatus === 'funded' && (
                  <button className={styles.shipButton} onClick={() => openShipmentModal(order)}>
                    <FiTruck /> Add Tracking
                  </button>
                )}
                {order.rawStatus === 'shipped' && (
                  <button className={styles.updateButton} onClick={() => openShipmentModal(order)}>
                    <FiTruck /> Update Tracking
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shipment Modal */}
      <AnimatePresence>
        {showShipmentModal && selectedOrder && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !isSubmitting && setShowShipmentModal(false)}
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
                onClick={() => !isSubmitting && setShowShipmentModal(false)}
                disabled={isSubmitting}
              >
                <FiX />
              </button>

              {submitSuccess ? (
                <div className={styles.successState}>
                  <FiCheckCircle className={styles.successIcon} />
                  <h2>Shipment Submitted!</h2>
                  <p>The buyer will be notified with tracking information.</p>
                </div>
              ) : (
                <>
                  <div className={styles.modalHeader}>
                    <FiTruck className={styles.modalIcon} />
                    <div>
                      <h2>Add Shipment Details</h2>
                      <p>Enter tracking info for {selectedOrder.assetTitle}</p>
                    </div>
                  </div>

                  {/* Ship To Summary */}
                  {selectedOrder.buyerShippingAddress && (
                    <div className={styles.modalShipTo}>
                      <h4>Shipping To:</h4>
                      <p>
                        <strong>{selectedOrder.buyerShippingAddress.fullName}</strong>
                        <br />
                        {selectedOrder.buyerShippingAddress.city},{' '}
                        {selectedOrder.buyerShippingAddress.state}{' '}
                        {selectedOrder.buyerShippingAddress.postalCode}
                        <br />
                        {selectedOrder.buyerShippingAddress.country}
                      </p>
                    </div>
                  )}

                  <div className={styles.modalForm}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label>Carrier *</label>
                        <select
                          value={trackingCarrier}
                          onChange={(e) => setTrackingCarrier(e.target.value)}
                          disabled={isSubmitting}
                        >
                          <option value="">Select carrier...</option>
                          {CARRIERS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className={styles.formGroup}>
                        <label>Tracking Number *</label>
                        <input
                          type="text"
                          placeholder="Enter tracking number"
                          value={trackingNumber}
                          onChange={(e) => setTrackingNumber(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label>Shipment Notes (optional)</label>
                      <textarea
                        placeholder="Add any notes about the shipment..."
                        value={shipmentNotes}
                        onChange={(e) => setShipmentNotes(e.target.value)}
                        rows={2}
                        disabled={isSubmitting}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>
                        <FiCamera /> Proof of Shipment (optional, max 5)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleProofSelect}
                        className={styles.fileInput}
                        disabled={isSubmitting}
                      />
                      <span className={styles.fileHint}>
                        Upload photos of shipping label, receipt, or package
                      </span>
                      {proofFiles.length > 0 && (
                        <div className={styles.fileList}>
                          {proofFiles.map((file, idx) => (
                            <span key={idx} className={styles.fileName}>
                              {file.name}
                            </span>
                          ))}
                        </div>
                      )}
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
                        onClick={() => setShowShipmentModal(false)}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles.submitButton}
                        onClick={handleSubmitShipment}
                        disabled={isSubmitting || !trackingCarrier || !trackingNumber}
                      >
                        {isSubmitting ? (
                          <>
                            <FiLoader className={styles.spinner} /> Submitting...
                          </>
                        ) : (
                          <>
                            <FiCheckCircle /> Submit Shipment
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
  );
};

export default OrderShipmentPanel;
