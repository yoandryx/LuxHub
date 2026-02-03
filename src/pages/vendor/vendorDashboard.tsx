import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VendorProfile } from '../../lib/models/VendorProfile';
import styles from '../../styles/VendorDashboard.module.css';
import AvatarBannerUploader from '../../components/vendor/AvatarBannerUploader';
import { SlArrowDown } from 'react-icons/sl';
import {
  FiEdit2,
  FiTrash2,
  FiLoader,
  FiPackage,
  FiDollarSign,
  FiTrendingUp,
  FiClock,
  FiCheckCircle,
  FiPlus,
  FiEye,
  FiTruck,
  FiInbox,
  FiUser,
  FiRefreshCw,
  FiKey,
  FiLock,
  FiX,
  FiAlertCircle,
} from 'react-icons/fi';
import AddInventoryForm from '../../components/vendor/AddInventoryForm';
import toast from 'react-hot-toast';
import { NFTGridCard } from '../../components/common/UnifiedNFTCard';
import type { NFTStatus } from '../../components/common/UnifiedNFTCard';
import { NftDetailCard } from '../../components/marketplace/NftDetailCard';

interface MintRequest {
  _id: string;
  title: string;
  brand: string;
  model: string;
  referenceNumber: string;
  description?: string;
  priceUSD: number;
  imageBase64?: string;
  imageUrl?: string;
  status: 'pending' | 'approved' | 'minted' | 'rejected';
  rejectionNotes?: string;
  adminNotes?: string;
  mintAddress?: string;
  material?: string;
  productionYear?: string;
  movement?: string;
  caseSize?: string;
  waterResistance?: string;
  dialColor?: string;
  condition?: string;
  boxPapers?: string;
  country?: string;
  createdAt: string;
}

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isSocialHandleValid = (handle: string) => /^[a-zA-Z0-9._]{2,30}$/.test(handle);

const cleanHandle = (handle: string) => handle?.replace(/^@/, '').trim();

interface FieldErrors {
  name?: string;
  bio?: string;
  instagram?: string;
  x?: string;
  website?: string;
}

interface DashboardMetrics {
  totalInventoryValue: number;
  pendingReview: number;
  listedCount: number;
  activeEscrows: number;
  pendingOffers: number;
  totalSales: number;
  pendingPayouts: number;
}

type TabId = 'dashboard' | 'inventory' | 'orders' | 'offers' | 'payouts' | 'profile';

const VendorDashboard = () => {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [vendorAssets, setVendorAssets] = useState<any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  // Mint requests state
  const [mintRequests, setMintRequests] = useState<MintRequest[]>([]);
  const [mintRequestsLoading, setMintRequestsLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MintRequest | null>(null);
  const [requestFilter, setRequestFilter] = useState<
    'all' | 'pending' | 'approved' | 'minted' | 'rejected'
  >('all');

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [offers, setOffers] = useState<any[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerFilter, setOfferFilter] = useState<
    'all' | 'pending' | 'accepted' | 'rejected' | 'countered'
  >('all');
  const [selectedOffer, setSelectedOffer] = useState<any | null>(null);
  const [offerActionLoading, setOfferActionLoading] = useState(false);

  // Counter offer modal state
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterAmount, setCounterAmount] = useState<string>('');
  const [counterMessage, setCounterMessage] = useState<string>('');

  // Reject offer modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>('');

  const [payouts, setPayouts] = useState<any[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);

  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalInventoryValue: 0,
    pendingReview: 0,
    listedCount: 0,
    activeEscrows: 0,
    pendingOffers: 0,
    totalSales: 0,
    pendingPayouts: 0,
  });

  const fetchVendorAssets = async () => {
    if (!publicKey) return;
    setAssetsLoading(true);
    try {
      const res = await fetch(`/api/vendor/assets?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        const assets = data.assets || [];
        setVendorAssets(assets);

        // Calculate metrics from assets
        const pendingReview = assets.filter((a: any) => a.status === 'pending').length;
        const listedCount = assets.filter((a: any) => a.status === 'listed').length;
        const totalInventoryValue = assets.reduce(
          (sum: number, a: any) => sum + (a.priceUSD || 0),
          0
        );

        setMetrics((prev) => ({
          ...prev,
          pendingReview,
          listedCount,
          totalInventoryValue,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch vendor assets:', err);
      toast.error('Failed to load assets');
    } finally {
      setAssetsLoading(false);
    }
  };

  const fetchMintRequests = async () => {
    if (!publicKey) return;
    setMintRequestsLoading(true);
    try {
      const res = await fetch(`/api/vendor/mint-request?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        const requests = data.requests || [];
        setMintRequests(requests);

        // Update metrics from mint requests
        const pendingReview = requests.filter((r: MintRequest) => r.status === 'pending').length;
        const totalValue = requests.reduce(
          (sum: number, r: MintRequest) => sum + (r.priceUSD || 0),
          0
        );

        setMetrics((prev) => ({
          ...prev,
          pendingReview,
          totalInventoryValue: totalValue,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch mint requests:', err);
      toast.error('Failed to load mint requests');
    } finally {
      setMintRequestsLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!publicKey) return;
    if (!confirm('Are you sure you want to cancel this mint request?')) return;

    try {
      const res = await fetch('/api/vendor/mint-request', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          wallet: publicKey.toBase58(),
        }),
      });

      if (res.ok) {
        toast.success('Mint request cancelled');
        fetchMintRequests();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to cancel request');
      }
    } catch (err) {
      toast.error('Failed to cancel request');
    }
  };

  const filteredRequests = mintRequests.filter((r) =>
    requestFilter === 'all' ? true : r.status === requestFilter
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#ffc107';
      case 'approved':
        return '#2196f3';
      case 'minted':
        return '#4caf50';
      case 'rejected':
        return '#f44336';
      default:
        return '#888';
    }
  };

  const fetchOrders = async () => {
    if (!publicKey) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/vendor/orders?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setMetrics((prev) => ({
          ...prev,
          activeEscrows: (data.orders || []).filter((o: any) => o.status === 'in_escrow').length,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchOffers = async () => {
    if (!publicKey) return;
    setOffersLoading(true);
    try {
      const res = await fetch(`/api/vendor/offers?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setOffers(data.offers || []);
        setMetrics((prev) => ({
          ...prev,
          pendingOffers: (data.offers || []).filter((o: any) => o.status === 'pending').length,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch offers:', err);
    } finally {
      setOffersLoading(false);
    }
  };

  const fetchPayouts = async () => {
    if (!publicKey) return;
    setPayoutsLoading(true);
    try {
      const res = await fetch(`/api/vendor/payouts?wallet=${publicKey.toBase58()}`);
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.payouts || []);
        setMetrics((prev) => ({
          ...prev,
          totalSales: data.totalSales || 0,
          pendingPayouts: data.pendingPayouts || 0,
        }));
      }
    } catch (err) {
      console.error('Failed to fetch payouts:', err);
    } finally {
      setPayoutsLoading(false);
    }
  };

  // Offer action handlers
  const handleAcceptOffer = async (offer: any) => {
    if (!publicKey) return;
    if (
      !confirm(
        `Accept this offer of $${offer.offerPriceUSD?.toLocaleString() || offer.offerAmount?.toLocaleString()}?`
      )
    )
      return;

    setOfferActionLoading(true);
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: offer._id,
          vendorWallet: publicKey.toBase58(),
          action: 'accept',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Offer accepted! The buyer will be notified.');
        fetchOffers();
      } else {
        toast.error(data.error || 'Failed to accept offer');
      }
    } catch (err) {
      console.error('Error accepting offer:', err);
      toast.error('Failed to accept offer');
    } finally {
      setOfferActionLoading(false);
    }
  };

  const openRejectModal = (offer: any) => {
    setSelectedOffer(offer);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectOffer = async () => {
    if (!publicKey || !selectedOffer) return;
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setOfferActionLoading(true);
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOffer._id,
          vendorWallet: publicKey.toBase58(),
          action: 'reject',
          rejectionReason: rejectReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Offer rejected');
        setShowRejectModal(false);
        setSelectedOffer(null);
        setRejectReason('');
        fetchOffers();
      } else {
        toast.error(data.error || 'Failed to reject offer');
      }
    } catch (err) {
      console.error('Error rejecting offer:', err);
      toast.error('Failed to reject offer');
    } finally {
      setOfferActionLoading(false);
    }
  };

  const openCounterModal = (offer: any) => {
    setSelectedOffer(offer);
    setCounterAmount('');
    setCounterMessage('');
    setShowCounterModal(true);
  };

  const handleCounterOffer = async () => {
    if (!publicKey || !selectedOffer) return;

    const counterAmountNum = parseFloat(counterAmount);
    if (!counterAmountNum || counterAmountNum <= 0) {
      toast.error('Please enter a valid counter amount');
      return;
    }

    setOfferActionLoading(true);
    try {
      const res = await fetch('/api/offers/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerId: selectedOffer._id,
          vendorWallet: publicKey.toBase58(),
          action: 'counter',
          counterAmountUSD: counterAmountNum,
          counterMessage: counterMessage.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Counter offer sent! Awaiting buyer response.');
        setShowCounterModal(false);
        setSelectedOffer(null);
        setCounterAmount('');
        setCounterMessage('');
        fetchOffers();
      } else {
        toast.error(data.error || 'Failed to send counter offer');
      }
    } catch (err) {
      console.error('Error sending counter offer:', err);
      toast.error('Failed to send counter offer');
    } finally {
      setOfferActionLoading(false);
    }
  };

  // Filter offers by status
  const filteredOffers = offers.filter((o) =>
    offerFilter === 'all' ? true : o.status === offerFilter
  );

  // Load data based on active tab
  useEffect(() => {
    if (!publicKey) return;

    if (activeTab === 'dashboard') {
      fetchVendorAssets();
      fetchOrders();
      fetchOffers();
      fetchPayouts();
    } else if (activeTab === 'inventory') {
      fetchMintRequests();
    } else if (activeTab === 'orders') {
      fetchOrders();
    } else if (activeTab === 'offers') {
      fetchOffers();
    } else if (activeTab === 'payouts') {
      fetchPayouts();
    }
  }, [publicKey, activeTab]);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/vendor/profile?wallet=${publicKey.toBase58()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setProfile(data);
          setFormData(data);
        }
      })
      .finally(() => setLoading(false));
  }, [publicKey]);

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    if (!formData.name?.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.bio?.trim()) {
      errors.bio = 'Bio is required';
    }

    const isValidSocialInput = (input: string) =>
      isValidUrl(input) || isSocialHandleValid(cleanHandle(input));

    if (formData.socialLinks?.instagram && !isValidSocialInput(formData.socialLinks.instagram)) {
      errors.instagram = 'Enter a valid username or full URL';
    }

    if (formData.socialLinks?.x && !isValidSocialInput(formData.socialLinks.x)) {
      errors.x = 'Enter a valid username or full URL';
    }

    const cleanedWebsite = formData.socialLinks?.website?.trim() || '';
    const finalWebsite =
      cleanedWebsite && !/^https?:\/\//i.test(cleanedWebsite)
        ? 'https://' + cleanedWebsite
        : cleanedWebsite;

    if (cleanedWebsite && !isValidUrl(finalWebsite)) {
      errors.website = 'Enter a valid website URL';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdate = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors before saving');
      return;
    }

    setSaving(true);
    setFieldErrors({});

    const cleanedInstagram = formData.socialLinks?.instagram
      ? isValidUrl(formData.socialLinks.instagram)
        ? formData.socialLinks.instagram
        : `https://instagram.com/${cleanHandle(formData.socialLinks.instagram)}`
      : '';

    const cleanedX = formData.socialLinks?.x
      ? isValidUrl(formData.socialLinks.x)
        ? formData.socialLinks.x
        : `https://x.com/${cleanHandle(formData.socialLinks.x)}`
      : '';

    const cleanedWebsite = formData.socialLinks?.website?.trim() || '';
    const finalWebsite =
      cleanedWebsite && !/^https?:\/\//i.test(cleanedWebsite)
        ? 'https://' + cleanedWebsite
        : cleanedWebsite;

    const updatedProfile = {
      ...formData,
      socialLinks: {
        instagram: cleanedInstagram,
        x: cleanedX,
        website: finalWebsite,
      },
      wallet: publicKey?.toBase58(),
    };

    try {
      const res = await fetch('/api/vendor/updateProfile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProfile),
      });

      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success('Profile updated successfully!');
        setProfile(data.profile || updatedProfile);
      }
    } catch (err) {
      toast.error('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm('Are you sure you want to delete this asset? This cannot be undone.')) return;

    setDeletingAssetId(assetId);
    try {
      const res = await fetch(`/api/vendor/assets/${assetId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey?.toBase58() }),
      });

      if (res.ok) {
        toast.success('Asset deleted');
        setVendorAssets((prev) => prev.filter((a) => a._id !== assetId));
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete asset');
      }
    } catch (err) {
      toast.error('Failed to delete asset');
    } finally {
      setDeletingAssetId(null);
    }
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  // Skeleton loader component
  const Skeleton = ({ className }: { className?: string }) => (
    <div className={`${styles.skeleton} ${className || ''}`} />
  );

  const AssetSkeleton = () => (
    <div className={styles.assetCard}>
      <Skeleton className={styles.assetImageSkeleton} />
      <div className={styles.assetInfo}>
        <Skeleton className={styles.skeletonText} />
        <Skeleton className={styles.skeletonText} />
        <Skeleton className={styles.skeletonText} />
      </div>
    </div>
  );

  // Navigation items configuration (matching AdminDashboard style)
  const navItems = [
    { id: 'dashboard' as TabId, label: 'Dashboard', icon: FiTrendingUp },
    { id: 'inventory' as TabId, label: 'Inventory', icon: FiPackage, badge: metrics.pendingReview },
    { id: 'orders' as TabId, label: 'Orders', icon: FiTruck, badge: metrics.activeEscrows },
    { id: 'offers' as TabId, label: 'Offers', icon: FiInbox, badge: metrics.pendingOffers },
  ];

  const financeNavItems = [{ id: 'payouts' as TabId, label: 'Payouts', icon: FiDollarSign }];

  const settingsNavItems = [{ id: 'profile' as TabId, label: 'Profile', icon: FiUser }];

  // Page titles for each tab
  const pageTitles: Record<TabId, { title: string; subtitle: string }> = {
    dashboard: { title: 'Vendor Dashboard', subtitle: 'Overview of your sales and inventory' },
    inventory: { title: 'Inventory Management', subtitle: 'Add and manage your listed assets' },
    orders: { title: 'Orders & Escrows', subtitle: 'Track active orders and shipments' },
    offers: { title: 'Incoming Offers', subtitle: 'Review and respond to buyer offers' },
    payouts: { title: 'Earnings & Payouts', subtitle: 'Track your sales and pending payouts' },
    profile: { title: 'Vendor Profile', subtitle: 'Manage your public vendor profile' },
  };

  // Render sidebar nav item
  const renderNavItem = (item: { id: TabId; label: string; icon: any; badge?: number }) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        className={`${styles.navItem} ${activeTab === item.id ? styles.active : ''}`}
        onClick={() => setActiveTab(item.id)}
      >
        <Icon className={styles.navIcon} />
        <span>{item.label}</span>
        {item.badge !== undefined && item.badge > 0 && (
          <span className={styles.navBadge}>{item.badge}</span>
        )}
      </button>
    );
  };

  // Refresh data handler
  const refreshData = () => {
    if (activeTab === 'dashboard') {
      fetchVendorAssets();
      fetchOrders();
      fetchOffers();
      fetchPayouts();
    } else if (activeTab === 'inventory') {
      fetchMintRequests();
    } else if (activeTab === 'orders') {
      fetchOrders();
    } else if (activeTab === 'offers') {
      fetchOffers();
    } else if (activeTab === 'payouts') {
      fetchPayouts();
    }
  };

  if (loading)
    return (
      <div className={styles.dashboard}>
        <div className={styles.loadingState}>
          <FiLoader className={styles.spinner} />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );

  if (!publicKey)
    return (
      <div className={styles.dashboard}>
        <div className={styles.accessDenied}>
          <FiKey className={styles.accessDeniedIcon} />
          <h1 className={styles.accessDeniedTitle}>Connect Wallet</h1>
          <p className={styles.accessDeniedText}>
            Please connect your wallet to access the vendor dashboard.
          </p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className={styles.dashboard}>
        <div className={styles.accessDenied}>
          <FiLock className={styles.accessDeniedIcon} />
          <h1 className={styles.accessDeniedTitle}>Error</h1>
          <p className={styles.accessDeniedText}>{error}</p>
        </div>
      </div>
    );

  if (!profile?.approved)
    return (
      <div className={styles.dashboard}>
        <div className={styles.accessDenied}>
          <FiClock className={styles.accessDeniedIcon} style={{ color: 'var(--warning)' }} />
          <h1 className={styles.accessDeniedTitle}>Pending Approval</h1>
          <p className={styles.accessDeniedText}>
            Your vendor profile is pending admin approval. You&apos;ll be notified once approved.
          </p>
        </div>
      </div>
    );

  return (
    <div className={styles.dashboard}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar}>
        <nav className={styles.sidebarNav}>
          <div className={styles.navSection}>
            <div className={styles.navSectionLabel}>Marketplace</div>
            {navItems.map(renderNavItem)}
          </div>

          <div className={styles.navSection}>
            <div className={styles.navSectionLabel}>Finance</div>
            {financeNavItems.map(renderNavItem)}
          </div>

          <div className={styles.navSection}>
            <div className={styles.navSectionLabel}>Settings</div>
            {settingsNavItems.map(renderNavItem)}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={styles.mainContent}>
        <header className={styles.contentHeader}>
          <div className={styles.pageTitle}>
            <h1>{pageTitles[activeTab]?.title || 'Dashboard'}</h1>
            <p>{pageTitles[activeTab]?.subtitle || ''}</p>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.refreshBtn}
              onClick={refreshData}
              disabled={loading || assetsLoading}
            >
              <FiRefreshCw className={loading || assetsLoading ? styles.spinning : ''} />
              {loading || assetsLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </header>

        <div className={styles.contentBody}>
          {/* Dashboard Tab */}
          {activeTab === 'dashboard' && (
            <>
              {/* Metrics Grid */}
              <div className={styles.metricsGrid}>
                <div className={styles.metricCard} onClick={() => setActiveTab('inventory')}>
                  <div className={styles.metricIcon}>
                    <FiPackage />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>
                      ${metrics.totalInventoryValue.toLocaleString()}
                    </span>
                    <span className={styles.metricLabel}>Total Inventory Value</span>
                  </div>
                </div>

                <div className={styles.metricCard} onClick={() => setActiveTab('inventory')}>
                  <div className={styles.metricIconWarning}>
                    <FiClock />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>{metrics.pendingReview}</span>
                    <span className={styles.metricLabel}>Pending Review</span>
                  </div>
                </div>

                <div className={styles.metricCard} onClick={() => setActiveTab('inventory')}>
                  <div className={styles.metricIconSuccess}>
                    <FiCheckCircle />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>{metrics.listedCount}</span>
                    <span className={styles.metricLabel}>Listed Items</span>
                  </div>
                </div>

                <div className={styles.metricCard} onClick={() => setActiveTab('orders')}>
                  <div className={styles.metricIconInfo}>
                    <FiTruck />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>{metrics.activeEscrows}</span>
                    <span className={styles.metricLabel}>Active Escrows</span>
                  </div>
                </div>

                <div className={styles.metricCard} onClick={() => setActiveTab('offers')}>
                  <div className={styles.metricIcon}>
                    <FiInbox />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>{metrics.pendingOffers}</span>
                    <span className={styles.metricLabel}>Pending Offers</span>
                  </div>
                </div>

                <div className={styles.metricCard} onClick={() => setActiveTab('payouts')}>
                  <div className={styles.metricIconSuccess}>
                    <FiDollarSign />
                  </div>
                  <div className={styles.metricContent}>
                    <span className={styles.metricValue}>
                      ${metrics.totalSales.toLocaleString()}
                    </span>
                    <span className={styles.metricLabel}>Total Sales</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className={styles.sectionHeading}>
                <h2 className={styles.editHeading}>Quick Actions</h2>
              </div>
              <div className={styles.quickActions}>
                <button
                  className={styles.quickActionButton}
                  onClick={() => setActiveTab('inventory')}
                >
                  <FiPlus /> Add New Item
                </button>
                <button className={styles.quickActionButton} onClick={() => setActiveTab('offers')}>
                  <FiEye /> View Offers
                </button>
                <button className={styles.quickActionButton} onClick={() => setActiveTab('orders')}>
                  <FiTruck /> Manage Orders
                </button>
              </div>

              {/* Recent Activity */}
              <div className={styles.sectionHeading}>
                <h2 className={styles.editHeading}>Recent Activity</h2>
              </div>
              <div className={styles.activityList}>
                {vendorAssets.slice(0, 5).map((asset: any) => (
                  <div key={asset._id} className={styles.activityItem}>
                    <div className={styles.activityIcon}>
                      {asset.status === 'pending' ? <FiClock /> : <FiCheckCircle />}
                    </div>
                    <div className={styles.activityContent}>
                      <span className={styles.activityTitle}>{asset.title || asset.model}</span>
                      <span className={styles.activityMeta}>
                        {asset.status === 'pending' ? 'Pending review' : 'Listed'} • $
                        {asset.priceUSD?.toLocaleString()}
                      </span>
                    </div>
                    <span className={styles.activityDate}>
                      {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                ))}
                {vendorAssets.length === 0 && (
                  <div className={styles.emptyActivity}>
                    <p>No recent activity. Start by adding your first item!</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <>
              <AddInventoryForm onSuccess={fetchMintRequests} />

              {/* Mint Requests Section */}
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Your Mint Requests</h2>
              </div>

              {/* Filter Tabs */}
              <div className={styles.filterTabs}>
                {(['all', 'pending', 'approved', 'minted', 'rejected'] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`${styles.filterTab} ${requestFilter === filter ? styles.activeFilter : ''}`}
                    onClick={() => setRequestFilter(filter)}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    {filter !== 'all' && (
                      <span className={styles.filterCount}>
                        {mintRequests.filter((r) => r.status === filter).length}
                      </span>
                    )}
                    {filter === 'all' && (
                      <span className={styles.filterCount}>{mintRequests.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {mintRequestsLoading ? (
                <div className={styles.assetGrid}>
                  {[1, 2, 3, 4].map((i) => (
                    <AssetSkeleton key={i} />
                  ))}
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className={styles.emptyState}>
                  <FiPackage className={styles.emptyIcon} />
                  <p>
                    {requestFilter === 'all'
                      ? 'No mint requests yet. Add inventory above to request NFT minting.'
                      : `No ${requestFilter} requests.`}
                  </p>
                </div>
              ) : (
                <div className={styles.assetGrid}>
                  {filteredRequests.map((request) => {
                    // Map request status to NFTStatus
                    const mapStatus = (status: string): NFTStatus => {
                      switch (status) {
                        case 'pending':
                          return 'pending';
                        case 'approved':
                          return 'minting';
                        case 'minted':
                          return 'verified';
                        case 'rejected':
                          return 'error';
                        default:
                          return 'pending';
                      }
                    };

                    return (
                      <div key={request._id} className={styles.assetCardWrapper}>
                        <div
                          onClick={() => setSelectedRequest(request)}
                          style={{ cursor: 'pointer' }}
                        >
                          <NFTGridCard
                            title={request.title || `${request.brand} ${request.model}`}
                            image={request.imageBase64 || request.imageUrl}
                            price={request.priceUSD || 0}
                            priceLabel="USD"
                            brand={request.brand}
                            status={mapStatus(request.status)}
                            subtitle={request.referenceNumber}
                          />
                        </div>

                        {/* Status Badge & Actions */}
                        <div className={styles.requestStatusBar}>
                          <span
                            className={styles.statusBadge}
                            style={{
                              background: `${getStatusColor(request.status)}20`,
                              color: getStatusColor(request.status),
                            }}
                          >
                            {request.status.toUpperCase()}
                          </span>

                          <div className={styles.requestActions}>
                            <button
                              className={styles.viewButton}
                              onClick={() => setSelectedRequest(request)}
                              title="View details"
                            >
                              <FiEye />
                            </button>
                            {request.status === 'pending' && (
                              <button
                                className={styles.deleteButton}
                                onClick={() => handleCancelRequest(request._id)}
                                title="Cancel request"
                              >
                                <FiTrash2 />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Rejection Notes */}
                        {request.status === 'rejected' && request.rejectionNotes && (
                          <div className={styles.rejectionNote}>
                            <FiAlertCircle />
                            <span>{request.rejectionNotes}</span>
                          </div>
                        )}

                        {/* Minted Info */}
                        {request.status === 'minted' && request.mintAddress && (
                          <div className={styles.mintedInfo}>
                            <FiCheckCircle />
                            <span>Mint: {request.mintAddress.slice(0, 8)}...</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Detail Modal */}
              {selectedRequest && (
                <div className={styles.modalOverlay} onClick={() => setSelectedRequest(null)}>
                  <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <button className={styles.modalClose} onClick={() => setSelectedRequest(null)}>
                      <FiX />
                    </button>

                    <NftDetailCard
                      onClose={() => setSelectedRequest(null)}
                      mintAddress={selectedRequest.mintAddress}
                      previewData={{
                        title:
                          selectedRequest.title ||
                          `${selectedRequest.brand} ${selectedRequest.model}`,
                        description: selectedRequest.description || '',
                        image: selectedRequest.imageBase64 || selectedRequest.imageUrl || '',
                        priceSol: selectedRequest.priceUSD || 0,
                        attributes: [
                          { trait_type: 'Brand', value: selectedRequest.brand },
                          { trait_type: 'Model', value: selectedRequest.model },
                          { trait_type: 'Reference', value: selectedRequest.referenceNumber },
                          {
                            trait_type: 'Price',
                            value: `$${selectedRequest.priceUSD?.toLocaleString() || '0'}`,
                          },
                          { trait_type: 'Status', value: selectedRequest.status.toUpperCase() },
                          ...(selectedRequest.material
                            ? [{ trait_type: 'Material', value: selectedRequest.material }]
                            : []),
                          ...(selectedRequest.movement
                            ? [{ trait_type: 'Movement', value: selectedRequest.movement }]
                            : []),
                          ...(selectedRequest.caseSize
                            ? [{ trait_type: 'Case Size', value: selectedRequest.caseSize }]
                            : []),
                          ...(selectedRequest.dialColor
                            ? [{ trait_type: 'Dial Color', value: selectedRequest.dialColor }]
                            : []),
                          ...(selectedRequest.condition
                            ? [{ trait_type: 'Condition', value: selectedRequest.condition }]
                            : []),
                          ...(selectedRequest.boxPapers
                            ? [{ trait_type: 'Box & Papers', value: selectedRequest.boxPapers }]
                            : []),
                          ...(selectedRequest.country
                            ? [{ trait_type: 'Country', value: selectedRequest.country }]
                            : []),
                          ...(selectedRequest.productionYear
                            ? [{ trait_type: 'Year', value: selectedRequest.productionYear }]
                            : []),
                        ],
                      }}
                    />

                    {/* Additional Request Info */}
                    <div className={styles.requestDetailInfo}>
                      <p>
                        <strong>Submitted:</strong>{' '}
                        {new Date(selectedRequest.createdAt).toLocaleString()}
                      </p>
                      {selectedRequest.adminNotes && (
                        <p>
                          <strong>Admin Notes:</strong> {selectedRequest.adminNotes}
                        </p>
                      )}
                      {selectedRequest.rejectionNotes && (
                        <p className={styles.rejectionText}>
                          <strong>Rejection Reason:</strong> {selectedRequest.rejectionNotes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Orders & Escrows</h2>
              </div>

              {ordersLoading ? (
                <div className={styles.loadingState}>
                  <FiLoader className={styles.spinner} />
                  <p>Loading orders...</p>
                </div>
              ) : orders.length === 0 ? (
                <div className={styles.emptyState}>
                  <FiTruck className={styles.emptyIcon} />
                  <h3>No Active Orders</h3>
                  <p>When a buyer purchases one of your items, it will appear here.</p>
                </div>
              ) : (
                <div className={styles.ordersList}>
                  {orders.map((order: any) => (
                    <div key={order._id} className={styles.orderCard}>
                      <div className={styles.orderHeader}>
                        <span className={styles.orderId}>Order #{order._id?.slice(-8)}</span>
                        <span
                          className={`${styles.orderStatus} ${
                            order.status === 'in_escrow'
                              ? styles.statusPending
                              : order.status === 'shipped'
                                ? styles.statusInfo
                                : order.status === 'delivered'
                                  ? styles.statusListed
                                  : ''
                          }`}
                        >
                          {order.status?.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.orderBody}>
                        <div className={styles.orderItem}>
                          <span className={styles.orderItemTitle}>
                            {order.assetTitle || 'Asset'}
                          </span>
                          <span className={styles.orderItemPrice}>
                            ${order.amount?.toLocaleString()}
                          </span>
                        </div>
                        <div className={styles.orderMeta}>
                          <span>Buyer: {order.buyerWallet?.slice(0, 8)}...</span>
                          <span>
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                      </div>
                      {order.status === 'in_escrow' && (
                        <div className={styles.orderActions}>
                          <button className={styles.primaryButton}>
                            <FiTruck /> Add Tracking
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Offers Tab */}
          {activeTab === 'offers' && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Incoming Offers</h2>
              </div>

              {/* Offer Filter Tabs */}
              <div className={styles.filterTabs}>
                {(['all', 'pending', 'countered', 'accepted', 'rejected'] as const).map(
                  (filter) => (
                    <button
                      key={filter}
                      className={`${styles.filterTab} ${offerFilter === filter ? styles.activeFilter : ''}`}
                      onClick={() => setOfferFilter(filter)}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      {filter !== 'all' && (
                        <span className={styles.filterCount}>
                          {offers.filter((o) => o.status === filter).length}
                        </span>
                      )}
                      {filter === 'all' && (
                        <span className={styles.filterCount}>{offers.length}</span>
                      )}
                    </button>
                  )
                )}
              </div>

              {offersLoading ? (
                <div className={styles.loadingState}>
                  <FiLoader className={styles.spinner} />
                  <p>Loading offers...</p>
                </div>
              ) : filteredOffers.length === 0 ? (
                <div className={styles.emptyState}>
                  <FiInbox className={styles.emptyIcon} />
                  <h3>{offerFilter === 'all' ? 'No Offers Yet' : `No ${offerFilter} Offers`}</h3>
                  <p>
                    {offerFilter === 'all'
                      ? 'Offers from buyers will appear here. Keep your listings active!'
                      : `You don't have any ${offerFilter} offers.`}
                  </p>
                </div>
              ) : (
                <div className={styles.offersList}>
                  {filteredOffers.map((offer: any) => (
                    <div key={offer._id} className={styles.offerCard}>
                      <div className={styles.offerHeader}>
                        <span className={styles.offerAsset}>
                          {offer.assetTitle || offer.asset?.model || 'Asset'}
                        </span>
                        <span
                          className={`${styles.offerStatus} ${
                            offer.status === 'pending'
                              ? styles.statusPending
                              : offer.status === 'accepted'
                                ? styles.statusListed
                                : offer.status === 'rejected'
                                  ? styles.statusRejected
                                  : offer.status === 'countered'
                                    ? styles.statusInfo
                                    : ''
                          }`}
                        >
                          {offer.status?.toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.offerBody}>
                        <div className={styles.offerPrices}>
                          <div className={styles.offerPrice}>
                            <span className={styles.offerPriceLabel}>Offer</span>
                            <span className={styles.offerPriceValue}>
                              ${(offer.offerPriceUSD || offer.offerAmount)?.toLocaleString()}
                            </span>
                          </div>
                          <div className={styles.offerPrice}>
                            <span className={styles.offerPriceLabel}>Listed</span>
                            <span className={styles.offerPriceOriginal}>
                              ${(offer.listPriceUSD || offer.listPrice)?.toLocaleString()}
                            </span>
                          </div>
                          {offer.status === 'countered' && offer.counterOffers?.length > 0 && (
                            <div className={styles.offerPrice}>
                              <span className={styles.offerPriceLabel}>Counter</span>
                              <span className={styles.offerPriceCounter}>
                                $
                                {offer.counterOffers[
                                  offer.counterOffers.length - 1
                                ]?.amountUSD?.toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className={styles.offerMeta}>
                          <span>From: {offer.buyerWallet?.slice(0, 8)}...</span>
                          <span>
                            {offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {offer.message && (
                          <div className={styles.offerMessage}>
                            <span className={styles.offerMessageLabel}>Message:</span>
                            <p>{offer.message}</p>
                          </div>
                        )}
                        {offer.status === 'rejected' && offer.rejectionReason && (
                          <div className={styles.offerRejection}>
                            <FiAlertCircle />
                            <span>Rejected: {offer.rejectionReason}</span>
                          </div>
                        )}
                      </div>
                      {(offer.status === 'pending' || offer.status === 'countered') && (
                        <div className={styles.offerActions}>
                          <button
                            className={styles.acceptButton}
                            onClick={() => handleAcceptOffer(offer)}
                            disabled={offerActionLoading}
                          >
                            <FiCheckCircle /> Accept
                          </button>
                          <button
                            className={styles.counterButton}
                            onClick={() => openCounterModal(offer)}
                            disabled={offerActionLoading}
                          >
                            <FiRefreshCw /> Counter
                          </button>
                          <button
                            className={styles.rejectButton}
                            onClick={() => openRejectModal(offer)}
                            disabled={offerActionLoading}
                          >
                            <FiX /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Counter Offer Modal */}
              {showCounterModal && selectedOffer && (
                <div className={styles.modalOverlay} onClick={() => setShowCounterModal(false)}>
                  <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <button
                      className={styles.modalClose}
                      onClick={() => setShowCounterModal(false)}
                    >
                      <FiX />
                    </button>
                    <h2 className={styles.modalTitle}>Counter Offer</h2>
                    <p className={styles.modalSubtitle}>
                      Counter the offer of $
                      {(selectedOffer.offerPriceUSD || selectedOffer.offerAmount)?.toLocaleString()}{' '}
                      for {selectedOffer.assetTitle || 'this item'}
                    </p>

                    <div className={styles.formField}>
                      <label>Counter Amount (USD) *</label>
                      <input
                        type="number"
                        placeholder="Enter your counter price"
                        value={counterAmount}
                        onChange={(e) => setCounterAmount(e.target.value)}
                        min={0}
                        step="0.01"
                      />
                    </div>

                    <div className={styles.formField}>
                      <label>Message (optional)</label>
                      <textarea
                        placeholder="Add a message for the buyer..."
                        value={counterMessage}
                        onChange={(e) => setCounterMessage(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className={styles.modalActions}>
                      <button
                        className={styles.cancelButton}
                        onClick={() => setShowCounterModal(false)}
                        disabled={offerActionLoading}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles.primaryButton}
                        onClick={handleCounterOffer}
                        disabled={offerActionLoading || !counterAmount}
                      >
                        {offerActionLoading ? (
                          <>
                            <FiLoader className={styles.buttonSpinner} /> Sending...
                          </>
                        ) : (
                          'Send Counter Offer'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Reject Offer Modal */}
              {showRejectModal && selectedOffer && (
                <div className={styles.modalOverlay} onClick={() => setShowRejectModal(false)}>
                  <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <button className={styles.modalClose} onClick={() => setShowRejectModal(false)}>
                      <FiX />
                    </button>
                    <h2 className={styles.modalTitle}>Reject Offer</h2>
                    <p className={styles.modalSubtitle}>
                      Reject the offer of $
                      {(selectedOffer.offerPriceUSD || selectedOffer.offerAmount)?.toLocaleString()}{' '}
                      for {selectedOffer.assetTitle || 'this item'}
                    </p>

                    <div className={styles.formField}>
                      <label>Reason for Rejection *</label>
                      <textarea
                        placeholder="Please provide a reason for rejecting this offer..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                      />
                    </div>

                    <div className={styles.modalActions}>
                      <button
                        className={styles.cancelButton}
                        onClick={() => setShowRejectModal(false)}
                        disabled={offerActionLoading}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles.rejectButton}
                        onClick={handleRejectOffer}
                        disabled={offerActionLoading || !rejectReason.trim()}
                      >
                        {offerActionLoading ? (
                          <>
                            <FiLoader className={styles.buttonSpinner} /> Rejecting...
                          </>
                        ) : (
                          'Reject Offer'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Payouts Tab */}
          {activeTab === 'payouts' && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Earnings & Payouts</h2>
              </div>

              {/* Earnings Summary */}
              <div className={styles.earningsSummary}>
                <div className={styles.earningsCard}>
                  <span className={styles.earningsLabel}>Total Sales</span>
                  <span className={styles.earningsValue}>
                    ${metrics.totalSales.toLocaleString()}
                  </span>
                </div>
                <div className={styles.earningsCard}>
                  <span className={styles.earningsLabel}>Platform Fee (3%)</span>
                  <span className={styles.earningsDeduction}>
                    -${(metrics.totalSales * 0.03).toLocaleString()}
                  </span>
                </div>
                <div className={styles.earningsCard}>
                  <span className={styles.earningsLabel}>Net Earnings</span>
                  <span className={styles.earningsNet}>
                    ${(metrics.totalSales * 0.97).toLocaleString()}
                  </span>
                </div>
                <div className={styles.earningsCard}>
                  <span className={styles.earningsLabel}>Pending Payout</span>
                  <span className={styles.earningsPending}>
                    ${metrics.pendingPayouts.toLocaleString()}
                  </span>
                </div>
              </div>

              {payoutsLoading ? (
                <div className={styles.loadingState}>
                  <FiLoader className={styles.spinner} />
                  <p>Loading payout history...</p>
                </div>
              ) : payouts.length === 0 ? (
                <div className={styles.emptyState}>
                  <FiDollarSign className={styles.emptyIcon} />
                  <h3>No Payouts Yet</h3>
                  <p>Completed sales and payouts will be listed here.</p>
                </div>
              ) : (
                <>
                  <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle}>Payout History</h2>
                  </div>
                  <div className={styles.payoutsList}>
                    {payouts.map((payout: any) => (
                      <div key={payout._id} className={styles.payoutItem}>
                        <div className={styles.payoutInfo}>
                          <span className={styles.payoutTitle}>{payout.assetTitle}</span>
                          <span className={styles.payoutDate}>
                            {payout.createdAt
                              ? new Date(payout.createdAt).toLocaleDateString()
                              : ''}
                          </span>
                        </div>
                        <div className={styles.payoutAmount}>
                          <span className={styles.payoutGross}>
                            ${payout.grossAmount?.toLocaleString()}
                          </span>
                          <span className={styles.payoutNet}>
                            Net: ${payout.netAmount?.toLocaleString()}
                          </span>
                        </div>
                        <span
                          className={`${styles.payoutStatus} ${
                            payout.status === 'completed'
                              ? styles.statusListed
                              : payout.status === 'pending'
                                ? styles.statusPending
                                : ''
                          }`}
                        >
                          {payout.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Edit Profile</h2>
              </div>

              <div className={styles.profileContent}>
                <div className={styles.profileMain}>
                  <AvatarBannerUploader
                    onUploadComplete={(avatarUrl, bannerUrl) => {
                      setFormData((prev: any) => ({
                        ...prev,
                        avatarUrl: avatarUrl || prev.avatarUrl,
                        bannerUrl: bannerUrl || prev.bannerUrl,
                      }));
                    }}
                    onPreviewUpdate={(avatarPreview, bannerPreview) => {
                      setFormData((prev: any) => ({
                        ...prev,
                        avatarUrl: avatarPreview || prev.avatarUrl,
                        bannerUrl: bannerPreview || prev.bannerUrl,
                      }));
                    }}
                  />
                  <div className={styles.sectionHeading}>
                    <h2>Profile Info</h2>
                  </div>

                  <div className={styles.formField}>
                    <p>NAME *</p>
                    <input
                      placeholder="Name"
                      value={formData.name || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        clearFieldError('name');
                      }}
                      className={fieldErrors.name ? styles.inputError : ''}
                    />
                    {fieldErrors.name && (
                      <span className={styles.inputErrorMsg}>{fieldErrors.name}</span>
                    )}
                  </div>

                  <div className={styles.formField}>
                    <p>USERNAME</p>
                    <input
                      placeholder="Username"
                      value={formData.username || ''}
                      disabled
                      className={styles.inputDisabled}
                    />
                  </div>

                  <div className={styles.formField}>
                    <p>BIO *</p>
                    <textarea
                      placeholder="Bio"
                      value={formData.bio || ''}
                      onChange={(e) => {
                        setFormData({ ...formData, bio: e.target.value });
                        clearFieldError('bio');
                      }}
                      className={fieldErrors.bio ? styles.inputError : ''}
                    />
                    {fieldErrors.bio && (
                      <span className={styles.inputErrorMsg}>{fieldErrors.bio}</span>
                    )}
                  </div>

                  <div className={styles.formField}>
                    <p>INSTAGRAM</p>
                    <input
                      placeholder="Instagram username or full URL"
                      value={formData.socialLinks?.instagram || ''}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          socialLinks: {
                            ...formData.socialLinks,
                            instagram: e.target.value,
                          },
                        });
                        clearFieldError('instagram');
                      }}
                      className={fieldErrors.instagram ? styles.inputError : ''}
                    />
                    {fieldErrors.instagram && (
                      <span className={styles.inputErrorMsg}>{fieldErrors.instagram}</span>
                    )}
                  </div>

                  <div className={styles.formField}>
                    <p>X ACCOUNT</p>
                    <input
                      placeholder="X username or full link"
                      value={formData.socialLinks?.x || ''}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          socialLinks: {
                            ...formData.socialLinks,
                            x: e.target.value,
                          },
                        });
                        clearFieldError('x');
                      }}
                      className={fieldErrors.x ? styles.inputError : ''}
                    />
                    {fieldErrors.x && <span className={styles.inputErrorMsg}>{fieldErrors.x}</span>}
                  </div>

                  <div className={styles.formField}>
                    <p>WEBSITE</p>
                    <input
                      placeholder="Website URL"
                      value={formData.socialLinks?.website || ''}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          socialLinks: {
                            ...formData.socialLinks,
                            website: e.target.value,
                          },
                        });
                        clearFieldError('website');
                      }}
                      className={fieldErrors.website ? styles.inputError : ''}
                    />
                    {fieldErrors.website && (
                      <span className={styles.inputErrorMsg}>{fieldErrors.website}</span>
                    )}
                  </div>

                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className={saving ? styles.buttonDisabled : ''}
                  >
                    {saving ? (
                      <>
                        <FiLoader className={styles.buttonSpinner} />
                        SAVING...
                      </>
                    ) : (
                      'SAVE PROFILE'
                    )}
                  </button>
                </div>

                <div className={styles.profileSidebar}>
                  <div className={styles.tipsCard}>
                    <h3 className={styles.tipsTitle}>Profile Tips</h3>
                    <div className={styles.tipItem}>
                      <SlArrowDown className={styles.tipIcon} />
                      <p>A complete profile builds trust with buyers.</p>
                    </div>
                    <div className={styles.tipItem}>
                      <SlArrowDown className={styles.tipIcon} />
                      <p>Add social links to verify your identity.</p>
                    </div>
                    <div className={styles.tipItem}>
                      <SlArrowDown className={styles.tipIcon} />
                      <p>Use a professional banner and avatar.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default VendorDashboard;
