import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VendorProfile } from "../../lib/models/VendorProfile";
import styles from "../../styles/VendorDashboard.module.css";
import AvatarBannerUploader from "../../components/vendor/AvatarBannerUploader";
import { SlArrowDown } from "react-icons/sl";
import {
  FiEdit2, FiTrash2, FiLoader, FiPackage, FiDollarSign,
  FiTrendingUp, FiClock, FiCheckCircle, FiPlus, FiEye,
  FiTruck, FiInbox
} from "react-icons/fi";
import AddInventoryForm from "../../components/vendor/AddInventoryForm";
import toast from "react-hot-toast";

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

const isSocialHandleValid = (handle: string) => /^[a-zA-Z0-9._]{2,30}$/.test(handle);

const cleanHandle = (handle: string) => handle?.replace(/^@/, "").trim();

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

type TabId = "dashboard" | "inventory" | "orders" | "offers" | "payouts" | "profile";

const VendorDashboard = () => {
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [vendorAssets, setVendorAssets] = useState<any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [offers, setOffers] = useState<any[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

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
        const pendingReview = assets.filter((a: any) => a.status === "pending").length;
        const listedCount = assets.filter((a: any) => a.status === "listed").length;
        const totalInventoryValue = assets.reduce((sum: number, a: any) => sum + (a.priceUSD || 0), 0);

        setMetrics(prev => ({
          ...prev,
          pendingReview,
          listedCount,
          totalInventoryValue,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch vendor assets:", err);
      toast.error("Failed to load assets");
    } finally {
      setAssetsLoading(false);
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
        setMetrics(prev => ({
          ...prev,
          activeEscrows: (data.orders || []).filter((o: any) => o.status === "in_escrow").length,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
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
        setMetrics(prev => ({
          ...prev,
          pendingOffers: (data.offers || []).filter((o: any) => o.status === "pending").length,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch offers:", err);
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
        setMetrics(prev => ({
          ...prev,
          totalSales: data.totalSales || 0,
          pendingPayouts: data.pendingPayouts || 0,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch payouts:", err);
    } finally {
      setPayoutsLoading(false);
    }
  };

  // Load data based on active tab
  useEffect(() => {
    if (!publicKey) return;

    if (activeTab === "dashboard") {
      fetchVendorAssets();
      fetchOrders();
      fetchOffers();
      fetchPayouts();
    } else if (activeTab === "inventory") {
      fetchVendorAssets();
    } else if (activeTab === "orders") {
      fetchOrders();
    } else if (activeTab === "offers") {
      fetchOffers();
    } else if (activeTab === "payouts") {
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
      errors.name = "Name is required";
    }

    if (!formData.bio?.trim()) {
      errors.bio = "Bio is required";
    }

    const isValidSocialInput = (input: string) =>
      isValidUrl(input) || isSocialHandleValid(cleanHandle(input));

    if (formData.socialLinks?.instagram && !isValidSocialInput(formData.socialLinks.instagram)) {
      errors.instagram = "Enter a valid username or full URL";
    }

    if (formData.socialLinks?.x && !isValidSocialInput(formData.socialLinks.x)) {
      errors.x = "Enter a valid username or full URL";
    }

    const cleanedWebsite = formData.socialLinks?.website?.trim() || "";
    const finalWebsite = cleanedWebsite && !/^https?:\/\//i.test(cleanedWebsite)
      ? "https://" + cleanedWebsite
      : cleanedWebsite;

    if (cleanedWebsite && !isValidUrl(finalWebsite)) {
      errors.website = "Enter a valid website URL";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUpdate = async () => {
    if (!validateForm()) {
      toast.error("Please fix the errors before saving");
      return;
    }

    setSaving(true);
    setFieldErrors({});

    const cleanedInstagram = formData.socialLinks?.instagram
      ? isValidUrl(formData.socialLinks.instagram)
        ? formData.socialLinks.instagram
        : `https://instagram.com/${cleanHandle(formData.socialLinks.instagram)}`
      : "";

    const cleanedX = formData.socialLinks?.x
      ? isValidUrl(formData.socialLinks.x)
        ? formData.socialLinks.x
        : `https://x.com/${cleanHandle(formData.socialLinks.x)}`
      : "";

    const cleanedWebsite = formData.socialLinks?.website?.trim() || "";
    const finalWebsite = cleanedWebsite && !/^https?:\/\//i.test(cleanedWebsite)
      ? "https://" + cleanedWebsite
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
      const res = await fetch("/api/vendor/updateProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile),
      });

      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("Profile updated successfully!");
        setProfile(data.profile || updatedProfile);
      }
    } catch (err) {
      toast.error("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!confirm("Are you sure you want to delete this asset? This cannot be undone.")) return;

    setDeletingAssetId(assetId);
    try {
      const res = await fetch(`/api/vendor/assets/${assetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey?.toBase58() }),
      });

      if (res.ok) {
        toast.success("Asset deleted");
        setVendorAssets(prev => prev.filter(a => a._id !== assetId));
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete asset");
      }
    } catch (err) {
      toast.error("Failed to delete asset");
    } finally {
      setDeletingAssetId(null);
    }
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Skeleton loader component
  const Skeleton = ({ className }: { className?: string }) => (
    <div className={`${styles.skeleton} ${className || ""}`} />
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

  // Tab configuration
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <FiTrendingUp /> },
    { id: "inventory", label: "Inventory", icon: <FiPackage /> },
    { id: "orders", label: "Orders", icon: <FiTruck /> },
    { id: "offers", label: "Offers", icon: <FiInbox /> },
    { id: "payouts", label: "Payouts", icon: <FiDollarSign /> },
    { id: "profile", label: "Profile", icon: <FiEdit2 /> },
  ];

  if (loading) return (
    <div className={styles.dashboardContainer}>
      <div className={styles.loadingState}>
        <FiLoader className={styles.spinner} />
        <p>Loading dashboard...</p>
      </div>
    </div>
  );

  if (!publicKey) return (
    <div className={styles.dashboardContainer}>
      <div className={styles.emptyState}>
        <p>Please connect your wallet to access the vendor dashboard.</p>
      </div>
    </div>
  );

  if (error) return (
    <div className={styles.dashboardContainer}>
      <div className={styles.errorState}>
        <p>{error}</p>
      </div>
    </div>
  );

  if (!profile?.approved) return (
    <div className={styles.dashboardContainer}>
      <div className={styles.pendingState}>
        <h2>Pending Approval</h2>
        <p>Your vendor profile is pending admin approval. You&apos;ll be notified once approved.</p>
      </div>
    </div>
  );

  return (
    <div className={styles.dashboardContainer}>

      {/* Tabs */}
      <div className={styles.tabButtons}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? styles.activeTab : ""}
          >
            <span className={styles.tabIcon}>{tab.icon}</span>
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Welcome back, {profile?.name || "Vendor"}</h2>
            </div>

            {/* Metrics Grid */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard} onClick={() => setActiveTab("inventory")}>
                <div className={styles.metricIcon}><FiPackage /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>${metrics.totalInventoryValue.toLocaleString()}</span>
                  <span className={styles.metricLabel}>Total Inventory Value</span>
                </div>
              </div>

              <div className={styles.metricCard} onClick={() => setActiveTab("inventory")}>
                <div className={styles.metricIconWarning}><FiClock /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>{metrics.pendingReview}</span>
                  <span className={styles.metricLabel}>Pending Review</span>
                </div>
              </div>

              <div className={styles.metricCard} onClick={() => setActiveTab("inventory")}>
                <div className={styles.metricIconSuccess}><FiCheckCircle /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>{metrics.listedCount}</span>
                  <span className={styles.metricLabel}>Listed Items</span>
                </div>
              </div>

              <div className={styles.metricCard} onClick={() => setActiveTab("orders")}>
                <div className={styles.metricIconInfo}><FiTruck /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>{metrics.activeEscrows}</span>
                  <span className={styles.metricLabel}>Active Escrows</span>
                </div>
              </div>

              <div className={styles.metricCard} onClick={() => setActiveTab("offers")}>
                <div className={styles.metricIcon}><FiInbox /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>{metrics.pendingOffers}</span>
                  <span className={styles.metricLabel}>Pending Offers</span>
                </div>
              </div>

              <div className={styles.metricCard} onClick={() => setActiveTab("payouts")}>
                <div className={styles.metricIconSuccess}><FiDollarSign /></div>
                <div className={styles.metricContent}>
                  <span className={styles.metricValue}>${metrics.totalSales.toLocaleString()}</span>
                  <span className={styles.metricLabel}>Total Sales</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Quick Actions</h2>
            </div>
            <div className={styles.quickActions}>
              <button className={styles.quickActionButton} onClick={() => setActiveTab("inventory")}>
                <FiPlus /> Add New Item
              </button>
              <button className={styles.quickActionButton} onClick={() => setActiveTab("offers")}>
                <FiEye /> View Offers
              </button>
              <button className={styles.quickActionButton} onClick={() => setActiveTab("orders")}>
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
                    {asset.status === "pending" ? <FiClock /> : <FiCheckCircle />}
                  </div>
                  <div className={styles.activityContent}>
                    <span className={styles.activityTitle}>{asset.title || asset.model}</span>
                    <span className={styles.activityMeta}>
                      {asset.status === "pending" ? "Pending review" : "Listed"} • ${asset.priceUSD?.toLocaleString()}
                    </span>
                  </div>
                  <span className={styles.activityDate}>
                    {asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : "—"}
                  </span>
                </div>
              ))}
              {vendorAssets.length === 0 && (
                <div className={styles.emptyActivity}>
                  <p>No recent activity. Start by adding your first item!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === "inventory" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContentRow}>
            <div className={styles.tabContentLeft}>
              <AddInventoryForm onSuccess={fetchVendorAssets} />
            </div>
          </div>

          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Your Submitted Assets</h2>
            </div>

            {assetsLoading ? (
              <div className={styles.assetGrid}>
                {[1, 2, 3, 4].map(i => <AssetSkeleton key={i} />)}
              </div>
            ) : vendorAssets.length === 0 ? (
              <div className={styles.emptyState}>
                <FiPackage className={styles.emptyIcon} />
                <p>No assets submitted yet. Add inventory above to request minting.</p>
              </div>
            ) : (
              <div className={styles.assetGrid}>
                {vendorAssets.map((asset: any) => (
                  <div key={asset._id} className={styles.assetCard}>
                    {asset.imageIpfsUrls?.[0] || asset.imageBase64s?.[0] ? (
                      <img
                        src={
                          asset.imageIpfsUrls?.[0]
                            ? `${process.env.NEXT_PUBLIC_GATEWAY_URL}${asset.imageIpfsUrls[0]}`
                            : asset.imageBase64s?.[0]
                        }
                        alt={asset.model || asset.title}
                        className={styles.assetImage}
                      />
                    ) : (
                      <div className={styles.assetImagePlaceholder}>
                        <span>No image</span>
                      </div>
                    )}
                    <div className={styles.assetInfo}>
                      <h4 className={styles.assetTitle}>{asset.model || asset.title || "Untitled"}</h4>
                      <p className={styles.assetDetail}>
                        {asset.brand && <span className={styles.assetBrand}>{asset.brand}</span>}
                      </p>
                      <p className={styles.assetDetail}>
                        Ref: {asset.reference || asset.serialNumber || "—"}
                      </p>
                      <p className={styles.assetPrice}>
                        ${asset.priceUSD?.toLocaleString() || "0"}
                      </p>
                      <div className={styles.assetMeta}>
                        <div className={`${styles.statusBadge} ${
                          asset.status === "pending" ? styles.statusPending :
                          asset.status === "listed" ? styles.statusListed :
                          asset.status === "rejected" ? styles.statusRejected : ""
                        }`}>
                          {asset.status === "pending" ? "Pending Review" :
                           asset.status === "listed" ? "Listed" :
                           asset.status === "rejected" ? "Rejected" : asset.status}
                        </div>
                        {asset.createdAt && (
                          <span className={styles.assetDate}>
                            {new Date(asset.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {asset.status === "pending" && (
                        <div className={styles.assetActions}>
                          <button
                            className={styles.editButton}
                            onClick={() => toast("Edit feature coming soon")}
                            title="Edit asset"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className={styles.deleteButton}
                            onClick={() => handleDeleteAsset(asset._id)}
                            disabled={deletingAssetId === asset._id}
                            title="Delete asset"
                          >
                            {deletingAssetId === asset._id ? (
                              <FiLoader className={styles.buttonSpinner} />
                            ) : (
                              <FiTrash2 />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Orders & Escrows</h2>
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
                      <span className={`${styles.orderStatus} ${
                        order.status === "in_escrow" ? styles.statusPending :
                        order.status === "shipped" ? styles.statusInfo :
                        order.status === "delivered" ? styles.statusListed : ""
                      }`}>
                        {order.status?.replace("_", " ").toUpperCase()}
                      </span>
                    </div>
                    <div className={styles.orderBody}>
                      <div className={styles.orderItem}>
                        <span className={styles.orderItemTitle}>{order.assetTitle || "Asset"}</span>
                        <span className={styles.orderItemPrice}>${order.amount?.toLocaleString()}</span>
                      </div>
                      <div className={styles.orderMeta}>
                        <span>Buyer: {order.buyerWallet?.slice(0, 8)}...</span>
                        <span>{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ""}</span>
                      </div>
                    </div>
                    {order.status === "in_escrow" && (
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
          </div>
        </div>
      )}

      {/* Offers Tab */}
      {activeTab === "offers" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Incoming Offers</h2>
            </div>

            {offersLoading ? (
              <div className={styles.loadingState}>
                <FiLoader className={styles.spinner} />
                <p>Loading offers...</p>
              </div>
            ) : offers.length === 0 ? (
              <div className={styles.emptyState}>
                <FiInbox className={styles.emptyIcon} />
                <h3>No Pending Offers</h3>
                <p>Offers from buyers will appear here. Keep your listings active!</p>
              </div>
            ) : (
              <div className={styles.offersList}>
                {offers.map((offer: any) => (
                  <div key={offer._id} className={styles.offerCard}>
                    <div className={styles.offerHeader}>
                      <span className={styles.offerAsset}>{offer.assetTitle || "Asset"}</span>
                      <span className={`${styles.offerStatus} ${
                        offer.status === "pending" ? styles.statusPending :
                        offer.status === "accepted" ? styles.statusListed :
                        offer.status === "rejected" ? styles.statusRejected : ""
                      }`}>
                        {offer.status?.toUpperCase()}
                      </span>
                    </div>
                    <div className={styles.offerBody}>
                      <div className={styles.offerPrices}>
                        <div className={styles.offerPrice}>
                          <span className={styles.offerPriceLabel}>Offer</span>
                          <span className={styles.offerPriceValue}>${offer.offerAmount?.toLocaleString()}</span>
                        </div>
                        <div className={styles.offerPrice}>
                          <span className={styles.offerPriceLabel}>Listed</span>
                          <span className={styles.offerPriceOriginal}>${offer.listPrice?.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className={styles.offerMeta}>
                        <span>From: {offer.buyerWallet?.slice(0, 8)}...</span>
                        <span>{offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : ""}</span>
                      </div>
                    </div>
                    {offer.status === "pending" && (
                      <div className={styles.offerActions}>
                        <button className={styles.acceptButton}>Accept</button>
                        <button className={styles.counterButton}>Counter</button>
                        <button className={styles.rejectButton}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payouts Tab */}
      {activeTab === "payouts" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Earnings & Payouts</h2>
            </div>

            {/* Earnings Summary */}
            <div className={styles.earningsSummary}>
              <div className={styles.earningsCard}>
                <span className={styles.earningsLabel}>Total Sales</span>
                <span className={styles.earningsValue}>${metrics.totalSales.toLocaleString()}</span>
              </div>
              <div className={styles.earningsCard}>
                <span className={styles.earningsLabel}>Platform Fee (3%)</span>
                <span className={styles.earningsDeduction}>-${(metrics.totalSales * 0.03).toLocaleString()}</span>
              </div>
              <div className={styles.earningsCard}>
                <span className={styles.earningsLabel}>Net Earnings</span>
                <span className={styles.earningsNet}>${(metrics.totalSales * 0.97).toLocaleString()}</span>
              </div>
              <div className={styles.earningsCard}>
                <span className={styles.earningsLabel}>Pending Payout</span>
                <span className={styles.earningsPending}>${metrics.pendingPayouts.toLocaleString()}</span>
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
                <div className={styles.sectionHeading}>
                  <h2 className={styles.editHeading}>Payout History</h2>
                </div>
                <div className={styles.payoutsList}>
                  {payouts.map((payout: any) => (
                    <div key={payout._id} className={styles.payoutItem}>
                      <div className={styles.payoutInfo}>
                        <span className={styles.payoutTitle}>{payout.assetTitle}</span>
                        <span className={styles.payoutDate}>
                          {payout.createdAt ? new Date(payout.createdAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <div className={styles.payoutAmount}>
                        <span className={styles.payoutGross}>${payout.grossAmount?.toLocaleString()}</span>
                        <span className={styles.payoutNet}>Net: ${payout.netAmount?.toLocaleString()}</span>
                      </div>
                      <span className={`${styles.payoutStatus} ${
                        payout.status === "completed" ? styles.statusListed :
                        payout.status === "pending" ? styles.statusPending : ""
                      }`}>
                        {payout.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <div className={styles.tabContentColumn}>
          <div className={styles.tabContent}>
            <div className={styles.sectionHeading}>
              <h2 className={styles.editHeading}>Edit Profile</h2>
            </div>

            <div className={styles.tabContentRow}>
              <div className={styles.tabContentLeft}>
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
                <div className={styles.sectionHeading}><h2>Profile Info</h2></div>

                <div className={styles.formField}>
                  <p>NAME *</p>
                  <input
                    placeholder="Name"
                    value={formData.name || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      clearFieldError("name");
                    }}
                    className={fieldErrors.name ? styles.inputError : ""}
                  />
                  {fieldErrors.name && <span className={styles.inputErrorMsg}>{fieldErrors.name}</span>}
                </div>

                <div className={styles.formField}>
                  <p>USERNAME</p>
                  <input
                    placeholder="Username"
                    value={formData.username || ""}
                    disabled
                    className={styles.inputDisabled}
                  />
                </div>

                <div className={styles.formField}>
                  <p>BIO *</p>
                  <textarea
                    placeholder="Bio"
                    value={formData.bio || ""}
                    onChange={(e) => {
                      setFormData({ ...formData, bio: e.target.value });
                      clearFieldError("bio");
                    }}
                    className={fieldErrors.bio ? styles.inputError : ""}
                  />
                  {fieldErrors.bio && <span className={styles.inputErrorMsg}>{fieldErrors.bio}</span>}
                </div>

                <div className={styles.formField}>
                  <p>INSTAGRAM</p>
                  <input
                    placeholder="Instagram username or full URL"
                    value={formData.socialLinks?.instagram || ""}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        socialLinks: {
                          ...formData.socialLinks,
                          instagram: e.target.value,
                        },
                      });
                      clearFieldError("instagram");
                    }}
                    className={fieldErrors.instagram ? styles.inputError : ""}
                  />
                  {fieldErrors.instagram && <span className={styles.inputErrorMsg}>{fieldErrors.instagram}</span>}
                </div>

                <div className={styles.formField}>
                  <p>X ACCOUNT</p>
                  <input
                    placeholder="X username or full link"
                    value={formData.socialLinks?.x || ""}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        socialLinks: {
                          ...formData.socialLinks,
                          x: e.target.value,
                        },
                      });
                      clearFieldError("x");
                    }}
                    className={fieldErrors.x ? styles.inputError : ""}
                  />
                  {fieldErrors.x && <span className={styles.inputErrorMsg}>{fieldErrors.x}</span>}
                </div>

                <div className={styles.formField}>
                  <p>WEBSITE</p>
                  <input
                    placeholder="Website URL"
                    value={formData.socialLinks?.website || ""}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        socialLinks: {
                          ...formData.socialLinks,
                          website: e.target.value,
                        },
                      });
                      clearFieldError("website");
                    }}
                    className={fieldErrors.website ? styles.inputError : ""}
                  />
                  {fieldErrors.website && <span className={styles.inputErrorMsg}>{fieldErrors.website}</span>}
                </div>

                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className={saving ? styles.buttonDisabled : ""}
                >
                  {saving ? (
                    <>
                      <FiLoader className={styles.buttonSpinner} />
                      SAVING...
                    </>
                  ) : (
                    "SAVE PROFILE"
                  )}
                </button>
              </div>

              <div className={styles.tabContentRight}>
                <div className={styles.sectionHeading}><h2>Tips</h2></div>
                <p>A complete profile builds trust with buyers.</p>
                <SlArrowDown/>
                <p>Add social links to verify your identity.</p>
                <SlArrowDown/>
                <p>Use a professional banner and avatar.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
