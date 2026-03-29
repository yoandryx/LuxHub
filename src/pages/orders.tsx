// src/pages/orders.tsx
// Role-aware order tracking + offers management — buyer & vendor hub
import React, { useState, useEffect, useCallback } from 'react';
import { useEffectiveWallet } from '../hooks/useEffectiveWallet';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Link from 'next/link';
import { useBuyerOffers } from '../hooks/useSWR';
import { resolveImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUtils';
import toast from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';
import UrgencyBanner from '../components/common/UrgencyBanner';
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

interface VendorOffer {
  _id: string;
  assetTitle?: string;
  assetBrand?: string;
  assetImage?: string;
  offerPriceUSD: number;
  offerAmount?: number;
  listPriceUSD?: number;
  listPrice?: number;
  status: string;
  buyerWallet?: string;
  message?: string;
  counterOffers?: CounterOffer[];
  rejectionReason?: string;
  createdAt: string;
}

interface VendorOrder {
  _id: string;
  assetTitle?: string;
  assetBrand?: string;
  assetImage?: string;
  amount?: number;
  status: string;
  buyerWallet?: string;
  createdAt: string;
  fundedAt?: string;
  shippedAt?: string;
}

type Role = 'buyer' | 'vendor';
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

// ==================== OFFER TOAST ====================
type OfferToastType = 'accepted' | 'rejected' | 'countered';
const TOAST_CONFIG: Record<OfferToastType, { badge: string; color: string; icon: string }> = {
  accepted: { badge: 'ACCEPTED', color: '#4ade80', icon: '\u2713' },
  rejected: { badge: 'REJECTED', color: '#ff6b6b', icon: '\u2717' },
  countered: { badge: 'COUNTER SENT', color: '#c8a1ff', icon: '\u21c4' },
};

function showOfferToast(
  type: OfferToastType,
  opts: { title: string; amount?: number; wallet?: string }
) {
  const cfg = TOAST_CONFIG[type];
  const truncWallet = opts.wallet ? `${opts.wallet.slice(0, 6)}...${opts.wallet.slice(-4)}` : '';

  toast.custom(
    (t: Toast) => (
      <div
        onClick={() => toast.dismiss(t.id)}
        style={{
          maxWidth: 380,
          width: '100%',
          background: 'rgba(10, 10, 14, 0.94)',
          backdropFilter: 'blur(32px)',
          WebkitBackdropFilter: 'blur(32px)',
          border: `1px solid ${cfg.color}30`,
          borderRadius: 14,
          padding: 0,
          overflow: 'hidden',
          boxShadow: `0 12px 40px rgba(0,0,0,0.5), 0 0 20px ${cfg.color}10`,
          cursor: 'pointer',
          opacity: t.visible ? 1 : 0,
          transform: t.visible ? 'translateX(0)' : 'translateX(100px)',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: `${cfg.color}15`,
              border: `1px solid ${cfg.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              color: cfg.color,
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            {cfg.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: cfg.color,
                  background: `${cfg.color}15`,
                  padding: '2px 8px',
                  borderRadius: 10,
                }}
              >
                {cfg.badge}
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginBottom: 2,
              }}
            >
              {opts.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              {opts.amount !== undefined && (
                <span style={{ color: '#c8a1ff', fontWeight: 700 }}>
                  ${opts.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
              {truncWallet && (
                <span style={{ color: '#777', fontFamily: 'monospace', fontSize: 11 }}>{truncWallet}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    { duration: 5000, position: 'top-right' }
  );
}

// ==================== COMPONENT ====================
const MyOrdersPage: React.FC = () => {
  const wallet = useEffectiveWallet();
  const walletAddress = wallet.publicKey?.toBase58();

  // Role detection
  const [role, setRole] = useState<Role>('buyer');
  const [roleLoading, setRoleLoading] = useState(true);

  // Top-level tab (read from URL query on mount)
  const [topTab, setTopTab] = useState<TopTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'offers' || tab === 'orders') return tab;
    }
    return 'orders';
  });

  // Orders state (buyer)
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

  // Offers state (buyer — via SWR)
  const {
    offers,
    stats: offerStats,
    isLoading: isLoadingOffers,
    mutate: mutateOffers,
  } = useBuyerOffers(walletAddress);
  const [offerFilter, setOfferFilter] = useState<OfferFilter>('all');

  // Confirm delivery modal state (buyer)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [reviewText, setReviewText] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  // Counter-offer modal state (buyer)
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<BuyerOffer | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [isResponding, setIsResponding] = useState(false);

  // ==================== VENDOR STATE ====================
  const [vendorOffers, setVendorOffers] = useState<VendorOffer[]>([]);
  const [vendorOffersLoading, setVendorOffersLoading] = useState(false);
  const [vendorOfferFilter, setVendorOfferFilter] = useState<OfferFilter>('all');

  const [vendorOrders, setVendorOrders] = useState<VendorOrder[]>([]);
  const [vendorOrdersLoading, setVendorOrdersLoading] = useState(false);

  // Vendor offer action modals
  const [showVendorCounterModal, setShowVendorCounterModal] = useState(false);
  const [showVendorRejectModal, setShowVendorRejectModal] = useState(false);
  const [vendorSelectedOffer, setVendorSelectedOffer] = useState<VendorOffer | null>(null);
  const [vendorCounterAmount, setVendorCounterAmount] = useState('');
  const [vendorCounterMessage, setVendorCounterMessage] = useState('');
  const [vendorRejectReason, setVendorRejectReason] = useState('');
  const [vendorOfferActionLoading, setVendorOfferActionLoading] = useState(false);

  // ==================== ROLE DETECTION ====================
  useEffect(() => {
    if (!walletAddress) {
      setRoleLoading(false);
      return;
    }
    setRoleLoading(true);
    fetch(`/api/vendor/profile?wallet=${walletAddress}`)
      .then((res) => {
        if (res.ok) {
          setRole('vendor');
        } else {
          setRole('buyer');
        }
      })
      .catch(() => setRole('buyer'))
      .finally(() => setRoleLoading(false));
  }, [walletAddress]);

  // ==================== BUYER: FETCH ORDERS ====================
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
    if (wallet.connected && role === 'buyer') {
      fetchOrders();
    } else {
      setIsLoading(false);
    }
  }, [wallet.connected, role, fetchOrders]);

  // ==================== VENDOR: FETCH OFFERS ====================
  const fetchVendorOffers = useCallback(async () => {
    if (!walletAddress) return;
    setVendorOffersLoading(true);
    try {
      const res = await fetch(`/api/vendor/offers?wallet=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setVendorOffers(data.offers || []);
      }
    } catch (err) {
      console.error('Failed to fetch vendor offers:', err);
    } finally {
      setVendorOffersLoading(false);
    }
  }, [walletAddress]);

  // ==================== VENDOR: FETCH ORDERS ====================
  const fetchVendorOrders = useCallback(async () => {
    if (!walletAddress) return;
    setVendorOrdersLoading(true);
    try {
      const res = await fetch(`/api/vendor/orders?wallet=${walletAddress}`);
      if (res.ok) {
        const data = await res.json();
        setVendorOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Failed to fetch vendor orders:', err);
    } finally {
      setVendorOrdersLoading(false);
    }
  }, [walletAddress]);

  // Load vendor data when role is vendor
  useEffect(() => {
    if (role !== 'vendor' || !walletAddress) return;
    if (topTab === 'offers') fetchVendorOffers();
    if (topTab === 'orders') fetchVendorOrders();
  }, [role, walletAddress, topTab, fetchVendorOffers, fetchVendorOrders]);

  // ==================== BUYER: FILTER ORDERS ====================
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

  // ==================== BUYER: FILTER OFFERS ====================
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

  // ==================== VENDOR: FILTER OFFERS ====================
  const filteredVendorOffers = vendorOffers.filter((o) =>
    vendorOfferFilter === 'all' ? true : o.status === vendorOfferFilter
  );

  const vendorOfferCounts = {
    total: vendorOffers.length,
    pending: vendorOffers.filter((o) => o.status === 'pending').length,
    countered: vendorOffers.filter((o) => o.status === 'countered').length,
    accepted: vendorOffers.filter((o) => o.status === 'accepted').length,
    rejected: vendorOffers.filter((o) => o.status === 'rejected').length,
  };

  const vendorOrderCounts = {
    total: vendorOrders.length,
    funded: vendorOrders.filter((o) => o.status === 'funded' || o.status === 'in_escrow').length,
    shipped: vendorOrders.filter((o) => o.status === 'shipped').length,
    delivered: vendorOrders.filter((o) => o.status === 'delivered').length,
    released: vendorOrders.filter((o) => o.status === 'released').length,
  };

  // ==================== BUYER: ORDER HANDLERS ====================
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

  // ==================== BUYER: OFFER HANDLERS ====================
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
        // Show rich toast for the action
        const offer = (offers as BuyerOffer[]).find((o) => o._id === offerId);
        const toastType: OfferToastType | null =
          action === 'accept_counter' ? 'accepted' :
          action === 'reject_counter' ? 'rejected' :
          action === 'counter' ? 'countered' :
          null;
        if (toastType && offer) {
          showOfferToast(toastType, {
            title: offer.assetModel || 'Offer',
            amount: action === 'counter' ? parseFloat(extra?.counterAmountUSD || '0') :
                    offer.latestCounterOffer?.amountUSD || offer.offerPriceUSD,
            wallet: offer.vendorName || undefined,
          });
        } else if (action === 'withdraw') {
          toast.success('Offer withdrawn');
        }
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

  // ==================== VENDOR: OFFER HANDLERS ====================
  const handleVendorAcceptOffer = async (offer: VendorOffer) => {
    if (!walletAddress) return;
    setVendorOfferActionLoading(true);
    toast(
      `Accepting offer of $${offer.offerPriceUSD?.toLocaleString() || offer.offerAmount?.toLocaleString()}...`,
      { icon: '...' }
    );
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offer._id,
          vendorWallet: walletAddress,
          action: 'accept',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showOfferToast('accepted', {
          title: offer.assetTitle || 'Offer',
          amount: offer.offerPriceUSD || offer.offerAmount,
          wallet: offer.buyerWallet,
        });
        fetchVendorOffers();
      } else {
        toast.error(data.error || 'Failed to accept offer');
      }
    } catch (err) {
      console.error('Error accepting offer:', err);
      toast.error('Failed to accept offer');
    } finally {
      setVendorOfferActionLoading(false);
    }
  };

  const openVendorRejectModal = (offer: VendorOffer) => {
    setVendorSelectedOffer(offer);
    setVendorRejectReason('');
    setShowVendorRejectModal(true);
  };

  const handleVendorRejectOffer = async () => {
    if (!walletAddress || !vendorSelectedOffer) return;
    if (!vendorRejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    setVendorOfferActionLoading(true);
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: vendorSelectedOffer._id,
          vendorWallet: walletAddress,
          action: 'reject',
          rejectionReason: vendorRejectReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showOfferToast('rejected', {
          title: vendorSelectedOffer.assetTitle || 'Offer',
          amount: vendorSelectedOffer.offerPriceUSD || vendorSelectedOffer.offerAmount,
          wallet: vendorSelectedOffer.buyerWallet,
        });
        setShowVendorRejectModal(false);
        setVendorSelectedOffer(null);
        setVendorRejectReason('');
        fetchVendorOffers();
      } else {
        toast.error(data.error || 'Failed to reject offer');
      }
    } catch (err) {
      console.error('Error rejecting offer:', err);
      toast.error('Failed to reject offer');
    } finally {
      setVendorOfferActionLoading(false);
    }
  };

  const openVendorCounterModal = (offer: VendorOffer) => {
    setVendorSelectedOffer(offer);
    setVendorCounterAmount('');
    setVendorCounterMessage('');
    setShowVendorCounterModal(true);
  };

  const handleVendorCounterOffer = async () => {
    if (!walletAddress || !vendorSelectedOffer) return;
    const counterAmountNum = parseFloat(vendorCounterAmount);
    if (!counterAmountNum || counterAmountNum <= 0) {
      toast.error('Please enter a valid counter amount');
      return;
    }
    setVendorOfferActionLoading(true);
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: vendorSelectedOffer._id,
          vendorWallet: walletAddress,
          action: 'counter',
          counterAmountUSD: counterAmountNum,
          counterMessage: vendorCounterMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showOfferToast('countered', {
          title: vendorSelectedOffer.assetTitle || 'Offer',
          amount: parseFloat(vendorCounterAmount),
          wallet: vendorSelectedOffer.buyerWallet,
        });
        setShowVendorCounterModal(false);
        setVendorSelectedOffer(null);
        setVendorCounterAmount('');
        setVendorCounterMessage('');
        fetchVendorOffers();
      } else {
        toast.error(data.error || 'Failed to send counter offer');
      }
    } catch (err) {
      console.error('Error sending counter offer:', err);
      toast.error('Failed to send counter offer');
    } finally {
      setVendorOfferActionLoading(false);
    }
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
        return { label: 'Pending', className: styles.offerStatusPending, color: '#c8a1ff' };
      case 'countered':
        return { label: 'Counter-Offer', className: styles.offerStatusCountered, color: '#fbbf24' };
      case 'accepted':
        return { label: 'Accepted', className: styles.offerStatusAccepted, color: '#4ade80' };
      case 'rejected':
        return { label: 'Rejected', className: styles.offerStatusRejected, color: '#ff6b6b' };
      case 'auto_rejected':
        return { label: 'Auto-Rejected', className: styles.offerStatusRejected, color: '#ff6b6b' };
      case 'withdrawn':
        return { label: 'Withdrawn', className: styles.offerStatusWithdrawn, color: '#a1a1a1' };
      case 'expired':
        return { label: 'Expired', className: styles.offerStatusRejected, color: '#a1a1a1' };
      default:
        return { label: status, className: '', color: '#a1a1a1' };
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

  const getVendorOrderStatusInfo = (status: string) => {
    switch (status) {
      case 'funded':
        return { label: 'Funded', className: styles.statusAwaiting, color: '#fbbf24' };
      case 'shipped':
        return { label: 'Shipped', className: styles.statusShipped, color: '#60a5fa' };
      case 'delivered':
        return { label: 'Delivered', className: styles.statusDelivered, color: '#4ade80' };
      case 'released':
        return { label: 'Released', className: styles.statusCompleted, color: '#c8a1ff' };
      case 'in_escrow':
        return { label: 'In Escrow', className: styles.statusAwaiting, color: '#fbbf24' };
      default:
        return { label: status, className: '', color: '#a1a1a1' };
    }
  };

  const actionCount =
    role === 'buyer'
      ? stats.awaitingPayment +
        stats.delivered +
        (offerStats?.pending || 0) +
        (offerStats?.countered || 0)
      : vendorOfferCounts.pending + vendorOfferCounts.countered;

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

        {/* Page Header */}
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

          {/* Role Toggle */}
          {!roleLoading && (
            <div className={styles.roleToggle}>
              <button
                className={`${styles.roleButton} ${role === 'buyer' ? styles.roleButtonActive : ''}`}
                onClick={() => setRole('buyer')}
              >
                Buying
              </button>
              <button
                className={`${styles.roleButton} ${role === 'vendor' ? styles.roleButtonActive : ''}`}
                onClick={() => setRole('vendor')}
              >
                Selling
              </button>
            </div>
          )}

          {/* Quick Stats Bar (buyer) */}
          {role === 'buyer' && (
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
          )}

          {/* Quick Stats Bar (vendor) */}
          {role === 'vendor' && (
            <div className={styles.statsBar}>
              {[
                { label: 'Orders', value: vendorOrderCounts.total, tab: 'orders' as TopTab },
                ...(vendorOrderCounts.funded > 0
                  ? [{ label: 'To Ship', value: vendorOrderCounts.funded, tab: 'orders' as TopTab, urgent: true }]
                  : []),
                { label: 'Shipped', value: vendorOrderCounts.shipped, tab: 'orders' as TopTab },
                { label: 'Complete', value: vendorOrderCounts.released, tab: 'orders' as TopTab },
                { label: 'Offers', value: vendorOfferCounts.total, tab: 'offers' as TopTab },
                ...(vendorOfferCounts.pending > 0
                  ? [{ label: 'Pending', value: vendorOfferCounts.pending, tab: 'offers' as TopTab, urgent: true }]
                  : []),
              ].map((stat) => (
                <button
                  key={stat.label}
                  className={`${styles.statPill} ${topTab === stat.tab && stat.label === (stat.tab === 'orders' ? 'Orders' : 'Offers') ? styles.statPillActive : ''} ${'urgent' in stat && stat.urgent ? styles.statPillUrgent : ''}`}
                  onClick={() => setTopTab(stat.tab)}
                >
                  <span className={styles.statNum}>{stat.value}</span>
                  <span className={styles.statLbl}>{stat.label}</span>
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Tab Switcher */}
        <div className={styles.tabSection}>
          <div className={styles.tabBar}>
            <button
              className={`${styles.tab} ${topTab === 'orders' ? styles.tabActive : ''}`}
              onClick={() => setTopTab('orders')}
            >
              <FiShoppingBag /> Orders
              {role === 'buyer' && stats.total > 0 && (
                <span className={styles.tabCount}>{stats.total}</span>
              )}
              {role === 'vendor' && vendorOrders.length > 0 && (
                <span className={styles.tabCount}>{vendorOrders.length}</span>
              )}
            </button>
            <button
              className={`${styles.tab} ${topTab === 'offers' ? styles.tabActive : ''}`}
              onClick={() => setTopTab('offers')}
            >
              <FiTag /> Offers
              {role === 'buyer' &&
                offerStats &&
                (offerStats.pending > 0 || offerStats.countered > 0) && (
                  <span className={styles.tabBadge}>
                    {(offerStats.pending || 0) + (offerStats.countered || 0)}
                  </span>
                )}
              {role === 'vendor' &&
                (vendorOfferCounts.pending > 0 || vendorOfferCounts.countered > 0) && (
                  <span className={styles.tabBadge}>
                    {vendorOfferCounts.pending + vendorOfferCounts.countered}
                  </span>
                )}
            </button>
          </div>

          {/* Sub-filter for buyer offers */}
          {topTab === 'offers' && role === 'buyer' && (
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

          {/* Sub-filter for vendor offers */}
          {topTab === 'offers' && role === 'vendor' && (
            <div className={styles.subFilters}>
              {(['all', 'pending', 'countered', 'accepted', 'rejected'] as OfferFilter[]).map(
                (f) => {
                  const count =
                    f === 'all' ? vendorOfferCounts.total : (vendorOfferCounts as any)[f] || 0;
                  return (
                    <button
                      key={f}
                      className={`${styles.subFilter} ${vendorOfferFilter === f ? styles.subFilterActive : ''}`}
                      onClick={() => setVendorOfferFilter(f)}
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

        {/* ===== BUYER: ORDERS TAB ===== */}
        {topTab === 'orders' && role === 'buyer' && (
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
                      style={{ '--card-accent': statusInfo.color } as React.CSSProperties}
                      layout
                    >
                      {/* Accent Bar */}
                      <div className={styles.orderCardAccent} />
                      {/* Compact Order Row */}
                      <div
                        className={styles.orderRow}
                        onClick={() => setExpandedOrder(isExpanded ? null : order._id)}
                      >
                        <div className={styles.orderThumb}>
                          {order.assetImage ? (
                            <img src={resolveImageUrl(order.assetImage)} alt={order.assetTitle} />
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

        {/* ===== VENDOR: ORDERS TAB ===== */}
        {topTab === 'orders' && role === 'vendor' && (
          <div className={styles.content}>
            {vendorOrdersLoading ? (
              <div className={styles.loadingState}>
                <FiLoader className={styles.spinner} />
                <p>Loading your orders...</p>
              </div>
            ) : vendorOrders.length === 0 ? (
              <div className={styles.emptyState}>
                <FiPackage className={styles.emptyIcon} />
                <h2>No Vendor Orders Yet</h2>
                <p>Once buyers purchase your listings, orders will appear here.</p>
              </div>
            ) : (
              <div className={styles.ordersList}>
                {vendorOrders.map((order) => {
                  const statusInfo = getVendorOrderStatusInfo(order.status);
                  return (
                    <div key={order._id} className={styles.orderCard} style={{ '--card-accent': statusInfo.color } as React.CSSProperties}>
                      <div className={styles.orderCardAccent} />
                      <div className={styles.orderRow}>
                        <div className={styles.orderThumb}>
                          {order.assetImage ? (
                            <img src={resolveImageUrl(order.assetImage)} alt={order.assetTitle || 'Asset'} />
                          ) : (
                            <FiPackage />
                          )}
                        </div>
                        <div className={styles.orderInfo}>
                          <div className={styles.orderTopLine}>
                            <h3>{order.assetTitle || 'Listing'}</h3>
                            {order.amount != null && (
                              <span className={styles.orderAmount}>
                                ${order.amount.toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className={styles.orderBottomLine}>
                            <span className={styles.orderMeta}>
                              {order.assetBrand && (
                                <span className={styles.brand}>{order.assetBrand}</span>
                              )}
                              {order.buyerWallet && (
                                <>
                                  <span className={styles.dot} />
                                  <span>Buyer: {order.buyerWallet.slice(0, 6)}...</span>
                                </>
                              )}
                              <span className={styles.dot} />
                              <span>{formatTimeAgo(order.fundedAt || order.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                        <div className={`${styles.statusChip} ${statusInfo.className}`}>
                          <span>{statusInfo.label}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== BUYER: OFFERS TAB ===== */}
        {topTab === 'offers' && role === 'buyer' && (
          <div className={styles.content}>
            <UrgencyBanner offers={(offers as any[]) || []} />
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
                    <div key={offer._id} className={styles.offerCard} style={{ '--card-accent': statusInfo.color } as React.CSSProperties}>
                      <div className={styles.orderCardAccent} />
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

        {/* ===== VENDOR: OFFERS TAB ===== */}
        {topTab === 'offers' && role === 'vendor' && (
          <div className={styles.content}>
            {vendorOffersLoading ? (
              <div className={styles.loadingState}>
                <FiLoader className={styles.spinner} />
                <p>Loading incoming offers...</p>
              </div>
            ) : filteredVendorOffers.length === 0 ? (
              <div className={styles.emptyState}>
                <FiTag className={styles.emptyIcon} />
                <h2>
                  {vendorOfferFilter === 'all'
                    ? 'No Incoming Offers'
                    : `No ${vendorOfferFilter} offers`}
                </h2>
                <p>Buyers can make offers on your listings. They will appear here.</p>
              </div>
            ) : (
              <div className={styles.ordersList}>
                {filteredVendorOffers.map((offer) => {
                  const statusInfo = getOfferStatusInfo(offer.status);
                  const lastCounter =
                    offer.counterOffers && offer.counterOffers.length > 0
                      ? offer.counterOffers[offer.counterOffers.length - 1]
                      : null;

                  return (
                    <div key={offer._id} className={styles.offerCard} style={{ '--card-accent': statusInfo.color } as React.CSSProperties}>
                      <div className={styles.orderCardAccent} />
                      <div className={styles.offerRow}>
                        <div className={styles.orderThumb}>
                          {offer.assetImage ? (
                            <img
                              src={resolveImageUrl(offer.assetImage)}
                              alt={offer.assetTitle || 'Asset'}
                            />
                          ) : (
                            <FiTag />
                          )}
                        </div>
                        <div className={styles.orderInfo}>
                          <div className={styles.orderTopLine}>
                            <h3>{offer.assetTitle || 'Asset'}</h3>
                            <div className={styles.priceStack}>
                              <span className={styles.offerPrice}>
                                ${(offer.offerPriceUSD || offer.offerAmount || 0).toLocaleString()}
                              </span>
                              {(offer.listPriceUSD || offer.listPrice) && (
                                <span className={styles.listPrice}>
                                  List: $
                                  {(offer.listPriceUSD || offer.listPrice || 0).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={styles.orderBottomLine}>
                            <span className={styles.orderMeta}>
                              {offer.buyerWallet && (
                                <span>Buyer: {offer.buyerWallet.slice(0, 8)}...</span>
                              )}
                              <span className={styles.dot} />
                              <span>{formatTimeAgo(offer.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                        <div className={`${styles.statusChip} ${statusInfo.className}`}>
                          <span>{statusInfo.label}</span>
                        </div>
                      </div>

                      {/* Message */}
                      {offer.message && (
                        <div className={styles.counterSection}>
                          <div className={styles.counterLabel}>
                            <FiMessageSquare /> Buyer Message
                          </div>
                          <p
                            style={{
                              fontSize: '0.85rem',
                              color: 'var(--text-secondary)',
                              margin: 0,
                            }}
                          >
                            {offer.message}
                          </p>
                        </div>
                      )}

                      {/* Counter history */}
                      {offer.counterOffers && offer.counterOffers.length > 0 && (
                        <div className={styles.counterSection}>
                          <div className={styles.counterLabel}>
                            <FiRefreshCw /> Negotiation
                          </div>
                          <div className={styles.counterChain}>
                            <div className={styles.counterStep}>
                              <span className={styles.counterWho}>Buyer</span>
                              <span className={styles.counterAmt}>
                                ${(offer.offerPriceUSD || offer.offerAmount || 0).toLocaleString()}
                              </span>
                            </div>
                            {offer.counterOffers.map((co, idx) => (
                              <React.Fragment key={idx}>
                                <FiChevronRight className={styles.counterArrow} />
                                <div className={styles.counterStep}>
                                  <span className={styles.counterWho}>
                                    {co.fromType === 'vendor' ? 'You' : 'Buyer'}
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

                      {/* Rejection reason */}
                      {offer.status === 'rejected' && offer.rejectionReason && (
                        <div className={styles.counterSection}>
                          <div className={styles.counterLabel}>
                            <FiAlertCircle /> Rejection Reason
                          </div>
                          <p
                            style={{
                              fontSize: '0.85rem',
                              color: 'var(--error)',
                              margin: 0,
                            }}
                          >
                            {offer.rejectionReason}
                          </p>
                        </div>
                      )}

                      {/* Vendor Offer Actions */}
                      {(offer.status === 'pending' || offer.status === 'countered') && (
                        <div className={styles.offerActions}>
                          <button
                            className={styles.vendorAcceptBtn}
                            onClick={() => handleVendorAcceptOffer(offer)}
                            disabled={vendorOfferActionLoading}
                          >
                            <FiCheckCircle /> Accept
                          </button>
                          <button
                            className={styles.vendorCounterBtn}
                            onClick={() => openVendorCounterModal(offer)}
                            disabled={vendorOfferActionLoading}
                          >
                            <FiRefreshCw /> Counter
                          </button>
                          <button
                            className={styles.vendorRejectBtn}
                            onClick={() => openVendorRejectModal(offer)}
                            disabled={vendorOfferActionLoading}
                          >
                            <FiX /> Reject
                          </button>
                        </div>
                      )}

                      {/* Countered waiting for buyer */}
                      {offer.status === 'countered' && lastCounter?.fromType === 'vendor' && (
                        <div
                          className={styles.offerActions}
                          style={{ borderTop: 'none', paddingTop: 0 }}
                        >
                          <div className={styles.awaitingMsg}>
                            <FiClock /> Awaiting buyer response to your counter of $
                            {lastCounter.amountUSD.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== BUYER: CONFIRM DELIVERY MODAL ===== */}
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
                          <img src={resolveImageUrl(selectedOrder.assetImage)} alt={selectedOrder.assetTitle} />
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

        {/* ===== BUYER: COUNTER-OFFER MODAL ===== */}
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

        {/* ===== VENDOR: COUNTER-OFFER MODAL ===== */}
        {showVendorCounterModal && vendorSelectedOffer && (
          <div className={styles.modalOverlay} onClick={() => setShowVendorCounterModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.modalClose}
                onClick={() => setShowVendorCounterModal(false)}
              >
                <FiX />
              </button>
              <div className={styles.modalHeader}>
                <FiRefreshCw className={styles.modalIcon} />
                <div>
                  <h2>Counter Offer</h2>
                  <p>
                    Counter the offer of $
                    {(
                      vendorSelectedOffer.offerPriceUSD ||
                      vendorSelectedOffer.offerAmount ||
                      0
                    ).toLocaleString()}{' '}
                    for {vendorSelectedOffer.assetTitle || 'this item'}
                  </p>
                </div>
              </div>
              <div className={styles.modalForm}>
                <div className={styles.formGroup}>
                  <label>Counter Amount (USD)</label>
                  <div className={styles.counterInputWrap}>
                    <span className={styles.counterCurrency}>$</span>
                    <input
                      type="number"
                      className={styles.counterInput}
                      placeholder="0.00"
                      value={vendorCounterAmount}
                      onChange={(e) => setVendorCounterAmount(e.target.value)}
                      min={0}
                      step="0.01"
                    />
                  </div>
                </div>
                <div className={styles.formGroup}>
                  <label>Message (optional)</label>
                  <textarea
                    placeholder="Add a message for the buyer..."
                    value={vendorCounterMessage}
                    onChange={(e) => setVendorCounterMessage(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className={styles.modalActions}>
                  <button
                    className={styles.cancelButton}
                    onClick={() => setShowVendorCounterModal(false)}
                    disabled={vendorOfferActionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.confirmSubmitButton}
                    onClick={handleVendorCounterOffer}
                    disabled={vendorOfferActionLoading || !vendorCounterAmount}
                  >
                    {vendorOfferActionLoading ? (
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
            </div>
          </div>
        )}

        {/* ===== VENDOR: REJECT OFFER MODAL ===== */}
        {showVendorRejectModal && vendorSelectedOffer && (
          <div className={styles.modalOverlay} onClick={() => setShowVendorRejectModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <button className={styles.modalClose} onClick={() => setShowVendorRejectModal(false)}>
                <FiX />
              </button>
              <div className={styles.modalHeader}>
                <FiAlertCircle className={styles.modalIcon} style={{ color: 'var(--error)' }} />
                <div>
                  <h2>Reject Offer</h2>
                  <p>
                    Reject the offer of $
                    {(
                      vendorSelectedOffer.offerPriceUSD ||
                      vendorSelectedOffer.offerAmount ||
                      0
                    ).toLocaleString()}{' '}
                    for {vendorSelectedOffer.assetTitle || 'this item'}
                  </p>
                </div>
              </div>
              <div className={styles.modalForm}>
                <div className={styles.formGroup}>
                  <label>Reason for Rejection *</label>
                  <textarea
                    placeholder="Please provide a reason for rejecting this offer..."
                    value={vendorRejectReason}
                    onChange={(e) => setVendorRejectReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className={styles.modalActions}>
                  <button
                    className={styles.cancelButton}
                    onClick={() => setShowVendorRejectModal(false)}
                    disabled={vendorOfferActionLoading}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.dangerAction}
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={handleVendorRejectOffer}
                    disabled={vendorOfferActionLoading || !vendorRejectReason.trim()}
                  >
                    {vendorOfferActionLoading ? (
                      <>
                        <FiLoader className={styles.spinner} /> Rejecting...
                      </>
                    ) : (
                      <>
                        <FiX /> Reject Offer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default MyOrdersPage;
