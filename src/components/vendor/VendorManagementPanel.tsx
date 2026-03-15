import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import styles from '../../styles/VendorManagementPanel.module.css';

interface VendorProfile {
  wallet: string;
  name: string;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  verified?: boolean;
  bio?: string;
  applicationStatus?: string;
  businessType?: string;
  primaryCategory?: string;
  estimatedInventorySize?: string;
  yearsInBusiness?: number;
  hasPhysicalLocation?: boolean;
  additionalNotes?: string;
  businessWebsite?: string;
  socialLinks?: { instagram?: string; x?: string; website?: string };
  reliabilityScore?: number;
  joined?: string;
}

interface Props {
  wallet?: any;
}

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  individual: 'Individual Seller',
  small_business: 'Small Business',
  dealer: 'Dealer',
  auction_house: 'Auction House',
  brand_authorized: 'Brand Authorized',
};

const CATEGORY_LABELS: Record<string, string> = {
  watches: 'Watches',
  jewelry: 'Jewelry',
  collectibles: 'Collectibles',
  art: 'Art',
  mixed: 'Mixed',
};

const VendorManagementPanel: React.FC<Props> = ({ wallet }) => {
  const [pendingVendors, setPendingVendors] = useState<VendorProfile[]>([]);
  const [approvedVendors, setApprovedVendors] = useState<VendorProfile[]>([]);
  const [vendorMessage, setVendorMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [businessTypeFilter, setBusinessTypeFilter] = useState('');

  // Expanded card details
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Rejection modal
  const [rejectingWallet, setRejectingWallet] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const adminWallet = wallet?.publicKey?.toBase58?.() || '';

  useEffect(() => {
    fetchPendingVendors();
    fetchApprovedVendors();
  }, []);

  useEffect(() => {
    if (vendorMessage) {
      const timer = setTimeout(() => setVendorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [vendorMessage]);

  const fetchPendingVendors = async () => {
    const res = await fetch(`/api/vendor/pending`, {
      headers: { 'x-wallet-address': adminWallet },
    });
    const data = await res.json();
    setPendingVendors(data.vendors || []);
  };

  const fetchApprovedVendors = async () => {
    const res = await fetch('/api/vendor/approved');
    const data = await res.json();
    setApprovedVendors(data.vendors || []);
  };

  // Filter pending vendors
  const filteredPending = useMemo(() => {
    let list = pendingVendors;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.username?.toLowerCase().includes(q) ||
          v.wallet?.toLowerCase().includes(q) ||
          v.additionalNotes?.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) {
      list = list.filter((v) => v.primaryCategory === categoryFilter);
    }
    if (businessTypeFilter) {
      list = list.filter((v) => v.businessType === businessTypeFilter);
    }
    return list;
  }, [pendingVendors, searchQuery, categoryFilter, businessTypeFilter]);

  // Filter approved vendors
  const filteredApproved = useMemo(() => {
    if (!searchQuery) return approvedVendors;
    const q = searchQuery.toLowerCase();
    return approvedVendors.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) ||
        v.username?.toLowerCase().includes(q) ||
        v.wallet?.toLowerCase().includes(q)
    );
  }, [approvedVendors, searchQuery]);

  const toggleVerification = async (vendorWallet: string, verified: boolean) => {
    setLoading(true);
    const res = await fetch('/api/vendor/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: vendorWallet, verified: !verified, adminWallet }),
    });
    if (res.ok) {
      setVendorMessage({
        type: 'success',
        text: `Vendor ${!verified ? 'verified' : 'unverified'}.`,
      });
      fetchApprovedVendors();
    }
    setLoading(false);
  };

  const approveVendor = async (vendorWallet: string) => {
    setLoading(true);
    const res = await fetch('/api/vendor/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: vendorWallet, adminWallet }),
    });
    const data = await res.json();
    if (res.ok) {
      navigator.clipboard.writeText(`${window.location.origin}/vendor/${vendorWallet}`);
      setVendorMessage({ type: 'success', text: `Approved! Profile link copied.` });
      fetchPendingVendors();
      fetchApprovedVendors();
    } else {
      setVendorMessage({ type: 'error', text: data.error || 'Failed to approve vendor.' });
    }
    setLoading(false);
  };

  const rejectVendor = async (vendorWallet: string) => {
    setLoading(true);
    const res = await fetch('/api/vendor/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: vendorWallet,
        adminWallet,
        reason: rejectionReason || undefined,
      }),
    });
    if (res.ok) {
      setVendorMessage({ type: 'success', text: 'Vendor application rejected.' });
      setRejectingWallet(null);
      setRejectionReason('');
      fetchPendingVendors();
    } else {
      const data = await res.json();
      setVendorMessage({ type: 'error', text: data.error || 'Failed to reject.' });
    }
    setLoading(false);
  };

  const revokeVendor = async (vendorWallet: string) => {
    if (!confirm('Revoke this vendor? Their profile will be marked as rejected.')) return;
    setLoading(true);
    const res = await fetch('/api/vendor/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: vendorWallet,
        adminWallet,
        reason: 'Approval revoked by admin',
      }),
    });
    if (res.ok) {
      setVendorMessage({ type: 'success', text: 'Vendor approval revoked.' });
      fetchApprovedVendors();
      fetchPendingVendors();
    }
    setLoading(false);
  };

  const renderQuestionnaireDetails = (vendor: VendorProfile) => (
    <div className={styles.detailsGrid}>
      {vendor.businessType && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Business Type</span>
          <span className={styles.detailValue}>
            {BUSINESS_TYPE_LABELS[vendor.businessType] || vendor.businessType}
          </span>
        </div>
      )}
      {vendor.primaryCategory && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Category</span>
          <span className={styles.detailValue}>
            {CATEGORY_LABELS[vendor.primaryCategory] || vendor.primaryCategory}
          </span>
        </div>
      )}
      {vendor.estimatedInventorySize && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Inventory Size</span>
          <span className={styles.detailValue}>{vendor.estimatedInventorySize} items</span>
        </div>
      )}
      {vendor.yearsInBusiness !== undefined && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Experience</span>
          <span className={styles.detailValue}>
            {vendor.yearsInBusiness} year{vendor.yearsInBusiness !== 1 ? 's' : ''}
          </span>
        </div>
      )}
      {vendor.hasPhysicalLocation !== undefined && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Physical Location</span>
          <span className={styles.detailValue}>{vendor.hasPhysicalLocation ? 'Yes' : 'No'}</span>
        </div>
      )}
      {vendor.socialLinks?.website && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Website</span>
          <span className={styles.detailValue}>{vendor.socialLinks.website}</span>
        </div>
      )}
      {vendor.socialLinks?.instagram && (
        <div className={styles.detailItem}>
          <span className={styles.detailLabel}>Instagram</span>
          <span className={styles.detailValue}>{vendor.socialLinks.instagram}</span>
        </div>
      )}
      {vendor.bio && (
        <div className={`${styles.detailItem} ${styles.detailFull}`}>
          <span className={styles.detailLabel}>Bio</span>
          <span className={styles.detailValue}>{vendor.bio}</span>
        </div>
      )}
      {vendor.additionalNotes && (
        <div className={`${styles.detailItem} ${styles.detailFull}`}>
          <span className={styles.detailLabel}>Notes from Applicant</span>
          <span className={styles.detailValue}>{vendor.additionalNotes}</span>
        </div>
      )}
      <div className={styles.detailItem}>
        <span className={styles.detailLabel}>Wallet</span>
        <span className={`${styles.detailValue} ${styles.mono}`}>
          {vendor.wallet.slice(0, 8)}...{vendor.wallet.slice(-6)}
        </span>
      </div>
    </div>
  );

  return (
    <div className={styles.panelWrapper}>
      <h1 className={styles.sectionTitle}>Vendor Management</h1>

      {vendorMessage && (
        <div className={`${styles.notification} ${styles[vendorMessage.type]}`}>
          {vendorMessage.text}
        </div>
      )}

      {/* Search & Filters */}
      <div className={styles.filterBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search by name, username, wallet, or notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="watches">Watches</option>
          <option value="jewelry">Jewelry</option>
          <option value="collectibles">Collectibles</option>
          <option value="art">Art</option>
          <option value="mixed">Mixed</option>
        </select>
        <select
          className={styles.filterSelect}
          value={businessTypeFilter}
          onChange={(e) => setBusinessTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="small_business">Small Business</option>
          <option value="dealer">Dealer</option>
          <option value="auction_house">Auction House</option>
          <option value="brand_authorized">Brand Authorized</option>
        </select>
      </div>

      {/* Pending Applications */}
      <h2 className={styles.subTitle}>
        Pending Applications
        <span className={styles.countBadge}>{filteredPending.length}</span>
      </h2>

      {filteredPending.length === 0 ? (
        <p className={styles.emptyText}>
          {pendingVendors.length === 0
            ? 'No pending applications'
            : 'No applications match your filters'}
        </p>
      ) : (
        <div className={styles.grid}>
          {filteredPending.map((vendor) => (
            <div key={vendor.wallet} className={styles.card}>
              {vendor.bannerUrl && <img src={vendor.bannerUrl} className={styles.banner} alt="" />}
              <div className={styles.cardInfo}>
                <p className={styles.username}>@{vendor.username}</p>
                <p className={styles.name}>{vendor.name}</p>
                {vendor.primaryCategory && (
                  <span className={styles.categoryTag}>
                    {CATEGORY_LABELS[vendor.primaryCategory] || vendor.primaryCategory}
                  </span>
                )}
                {vendor.businessType && (
                  <span className={styles.typeTag}>
                    {BUSINESS_TYPE_LABELS[vendor.businessType] || vendor.businessType}
                  </span>
                )}
              </div>

              {/* Expandable details */}
              <button
                className={styles.detailsToggle}
                onClick={() =>
                  setExpandedCard(expandedCard === vendor.wallet ? null : vendor.wallet)
                }
              >
                {expandedCard === vendor.wallet ? 'Hide Details' : 'View Application'}
              </button>

              {expandedCard === vendor.wallet && renderQuestionnaireDetails(vendor)}

              {/* Action buttons */}
              <div className={styles.buttonGroup}>
                <button disabled={loading} onClick={() => approveVendor(vendor.wallet)}>
                  Approve
                </button>
                <button
                  className={styles.rejectButton}
                  disabled={loading}
                  onClick={() => setRejectingWallet(vendor.wallet)}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingWallet && (
        <div className={styles.modalOverlay} onClick={() => setRejectingWallet(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Reject Application</h3>
            <p className={styles.modalSubtext}>
              @{pendingVendors.find((v) => v.wallet === rejectingWallet)?.username || ''}
            </p>
            <textarea
              className={styles.rejectionTextarea}
              placeholder="Reason for rejection (optional, will be sent to applicant)..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => {
                  setRejectingWallet(null);
                  setRejectionReason('');
                }}
              >
                Cancel
              </button>
              <button
                className={styles.rejectButton}
                disabled={loading}
                onClick={() => rejectVendor(rejectingWallet)}
              >
                {loading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approved Vendors */}
      <h2 className={styles.subTitle}>
        Approved Vendors
        <span className={styles.countBadge}>{filteredApproved.length}</span>
      </h2>

      <div className={styles.grid}>
        {filteredApproved.map((vendor) => (
          <div key={vendor.wallet} className={styles.card}>
            {vendor.bannerUrl && <img src={vendor.bannerUrl} className={styles.banner} alt="" />}
            <div className={styles.cardInfo}>
              <p className={styles.username}>
                @{vendor.username}
                {vendor.verified && <span className={styles.verifiedBadge}>Verified</span>}
              </p>
              <p className={styles.name}>{vendor.name}</p>
              {vendor.reliabilityScore !== undefined && vendor.reliabilityScore < 100 && (
                <span className={styles.reliabilityTag}>
                  Reliability: {vendor.reliabilityScore}%
                </span>
              )}
            </div>
            <div className={styles.buttonGroup}>
              <Link href={`/vendor/${vendor.wallet}`}>
                <button>View</button>
              </Link>
              <button
                className={styles.verifyButton}
                disabled={loading}
                onClick={() => toggleVerification(vendor.wallet, vendor.verified || false)}
              >
                {vendor.verified ? 'Unverify' : 'Verify'}
              </button>
              <button
                className={styles.rejectButton}
                disabled={loading}
                onClick={() => revokeVendor(vendor.wallet)}
              >
                Revoke
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VendorManagementPanel;
