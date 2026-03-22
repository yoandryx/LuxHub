import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { FiSend, FiCopy, FiCheck, FiUsers, FiMail, FiTrash2 } from 'react-icons/fi';
import toast from 'react-hot-toast';
import styles from '../../styles/VendorManagementPanel.module.css';

interface InviteEntry {
  code: string;
  vendorWallet: string;
  vendorName?: string;
  used: boolean;
  createdBy: string;
  createdAt?: string;
}

interface InterestEntry {
  _id: string;
  wallet?: string;
  name: string;
  category?: string;
  email?: string;
  phone?: string;
  message: string;
  contact?: string;
  status: string;
  createdAt: string;
}

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
  const [approvingVendor, setApprovingVendor] = useState<string | null>(null);

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [businessTypeFilter, setBusinessTypeFilter] = useState('');

  // Expanded card details
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Rejection modal
  const [rejectingWallet, setRejectingWallet] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Invite management
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [newInviteWallet, setNewInviteWallet] = useState('');
  const [newInviteName, setNewInviteName] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Interest submissions
  const [interests, setInterests] = useState<InterestEntry[]>([]);
  const [showInterests, setShowInterests] = useState(false);

  // Active tab for admin sections
  const [adminTab, setAdminTab] = useState<'vendors' | 'invites' | 'interests'>('vendors');

  const adminWallet = wallet?.publicKey?.toBase58?.() || '';

  const confirmAction = (message: string, onConfirm: () => void) => {
    toast(
      (t) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <span style={{ fontSize: '0.9rem' }}>{message}</span>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => toast.dismiss(t.id)}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '6px',
                color: '#a1a1a1',
                cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                toast.dismiss(t.id);
                onConfirm();
              }}
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #c8a1ff, #a855f7)',
                border: 'none',
                borderRadius: '6px',
                color: '#0a0a0c',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.82rem',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      ),
      {
        duration: 10000,
        style: {
          background: '#111',
          color: '#fff',
          border: '1px solid rgba(200, 161, 255, 0.2)',
          borderRadius: '10px',
          padding: '14px 16px',
        },
      }
    );
  };

  useEffect(() => {
    fetchPendingVendors();
    fetchApprovedVendors();
    fetchInvites();
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

  const fetchInvites = async () => {
    try {
      const res = await fetch('/api/admin/invites', {
        headers: { 'x-wallet-address': adminWallet },
      });
      if (res.ok) {
        const data = await res.json();
        setInvites(data.invites || []);
      }
    } catch {
      // silent
    }
  };

  const fetchInterests = async () => {
    try {
      const res = await fetch('/api/admin/interests', {
        headers: { 'x-wallet-address': adminWallet },
      });
      if (res.ok) {
        const data = await res.json();
        setInterests(data.interests || []);
        setShowInterests(true);
      }
    } catch {
      // silent
    }
  };

  // Invite email field
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [inviteInterestId, setInviteInterestId] = useState<string | null>(null);

  const createInvite = async () => {
    if (!newInviteWallet.trim()) {
      toast.error('Vendor wallet address is required');
      return;
    }
    setCreatingInvite(true);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': adminWallet,
        },
        body: JSON.stringify({
          vendorWallet: newInviteWallet.trim(),
          vendorName: newInviteName.trim() || null,
          vendorEmail: newInviteEmail.trim() || null,
          interestId: inviteInterestId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const link = `${window.location.origin}/vendor/onboard?invite=${data.code}`;
        navigator.clipboard.writeText(link);

        // Show clear feedback about invite + email status
        if (data.existing) {
          toast.success('Invite link copied (already existed).');
        } else {
          toast.success('Invite created! Link copied to clipboard.');
        }

        if (newInviteEmail.trim()) {
          if (data.emailSent) {
            toast.success(`Invite email sent to ${newInviteEmail.trim()}`, { duration: 5000 });
          } else {
            toast.error(
              `Email failed to send${data.emailError ? ': ' + data.emailError : ''}. Link was still copied — send it manually.`,
              { duration: 8000 }
            );
          }
        }
        setNewInviteWallet('');
        setNewInviteName('');
        setNewInviteEmail('');
        setInviteInterestId(null);
        fetchInvites();
        if (inviteInterestId) fetchInterests();
      } else {
        toast.error(data.error || 'Failed to create invite');
      }
    } catch {
      toast.error('Failed to create invite');
    }
    setCreatingInvite(false);
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/vendor/onboard?invite=${code}`;
    navigator.clipboard.writeText(link);
    setCopiedCode(code);
    toast.success('Invite link copied!');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const deleteInvite = (code: string) => {
    confirmAction(
      'Delete this invite? The vendor will no longer be able to use this link.',
      async () => {
        try {
          const res = await fetch('/api/admin/invites', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'x-wallet-address': adminWallet,
            },
            body: JSON.stringify({ code }),
          });
          if (res.ok) {
            toast.success('Invite deleted');
            fetchInvites();
          } else {
            const data = await res.json();
            toast.error(data.error || 'Failed to delete invite');
          }
        } catch {
          toast.error('Failed to delete invite');
        }
      }
    );
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

  const approveVendor = (vendorWallet: string) => {
    confirmAction('Approve this vendor? They will be able to list watches on LuxHub.', async () => {
      setApprovingVendor(vendorWallet);
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
      setApprovingVendor(null);
      setLoading(false);
    });
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

  const revokeVendor = (vendorWallet: string) => {
    confirmAction('Revoke this vendor? Their profile will be marked as rejected.', async () => {
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
    });
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

      {/* Admin Section Tabs */}
      <div className={styles.adminTabs}>
        <button
          className={`${styles.adminTab} ${adminTab === 'vendors' ? styles.adminTabActive : ''}`}
          onClick={() => setAdminTab('vendors')}
        >
          <FiUsers /> Vendors
        </button>
        <button
          className={`${styles.adminTab} ${adminTab === 'invites' ? styles.adminTabActive : ''}`}
          onClick={() => setAdminTab('invites')}
        >
          <FiSend /> Invites
          {invites.filter((i) => !i.used).length > 0 && (
            <span className={styles.tabBadge}>{invites.filter((i) => !i.used).length}</span>
          )}
        </button>
        <button
          className={`${styles.adminTab} ${adminTab === 'interests' ? styles.adminTabActive : ''}`}
          onClick={() => {
            setAdminTab('interests');
            if (!showInterests) fetchInterests();
          }}
        >
          <FiMail /> Applications
        </button>
      </div>

      {/* INVITES TAB */}
      {adminTab === 'invites' && (
        <div className={styles.inviteSection}>
          <h2 className={styles.subTitle}>Generate Vendor Invite</h2>
          <div className={styles.inviteForm}>
            <input
              className={styles.searchInput}
              placeholder="Vendor wallet address *"
              value={newInviteWallet}
              onChange={(e) => setNewInviteWallet(e.target.value)}
            />
            <input
              className={styles.searchInput}
              placeholder="Vendor name (optional)"
              value={newInviteName}
              onChange={(e) => setNewInviteName(e.target.value)}
            />
            <input
              className={styles.searchInput}
              type="email"
              placeholder="Vendor email (sends invite automatically)"
              value={newInviteEmail}
              onChange={(e) => setNewInviteEmail(e.target.value)}
            />
            <button
              className={styles.inviteBtn}
              disabled={creatingInvite || !newInviteWallet.trim()}
              onClick={createInvite}
            >
              {creatingInvite
                ? 'Creating...'
                : newInviteEmail.trim()
                  ? 'Generate & Send Email'
                  : 'Generate & Copy Link'}
            </button>
          </div>

          <h2 className={styles.subTitle} style={{ marginTop: '2rem' }}>
            Invite History
            <span className={styles.countBadge}>{invites.length}</span>
          </h2>

          {invites.length === 0 ? (
            <p className={styles.emptyText}>No invites generated yet</p>
          ) : (
            <div className={styles.inviteList}>
              {invites.map((inv) => (
                <div
                  key={inv.code}
                  className={`${styles.inviteRow} ${inv.used ? styles.inviteUsed : ''}`}
                >
                  <div className={styles.inviteInfo}>
                    <span className={styles.inviteName}>
                      {inv.vendorName || inv.vendorWallet.slice(0, 8) + '...'}
                    </span>
                    <span className={styles.inviteWallet}>
                      {inv.vendorWallet.slice(0, 6)}...{inv.vendorWallet.slice(-4)}
                    </span>
                    <span className={inv.used ? styles.inviteStatusUsed : styles.inviteStatusOpen}>
                      {inv.used ? 'Used' : 'Open'}
                    </span>
                  </div>
                  {!inv.used && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className={styles.copyBtn} onClick={() => copyInviteLink(inv.code)}>
                        {copiedCode === inv.code ? <FiCheck /> : <FiCopy />}
                      </button>
                      <button
                        className={styles.copyBtn}
                        style={{ color: '#f87171' }}
                        onClick={() => deleteInvite(inv.code)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INTERESTS TAB */}
      {adminTab === 'interests' && (
        <div className={styles.interestSection}>
          <h2 className={styles.subTitle}>
            Vendor Applications
            <span className={styles.countBadge}>{interests.length}</span>
          </h2>

          {interests.length === 0 ? (
            <p className={styles.emptyText}>No applications received yet</p>
          ) : (
            <div className={styles.interestList}>
              {interests.map((int) => (
                <div key={int._id} className={styles.interestCard}>
                  <div className={styles.interestHeader}>
                    <span className={styles.interestName}>{int.name}</span>
                    {int.category && <span className={styles.categoryTag}>{int.category}</span>}
                    <span className={styles.interestDate}>
                      {new Date(int.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className={styles.interestMessage}>{int.message}</p>
                  <div className={styles.interestMeta}>
                    {int.email && <span>Email: {int.email}</span>}
                    {int.phone && <span>Phone: {int.phone}</span>}
                    {int.contact && <span>Social: {int.contact}</span>}
                    {int.wallet && (
                      <span className={styles.mono}>
                        Wallet: {int.wallet.slice(0, 6)}...{int.wallet.slice(-4)}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    {int.wallet ? (
                      <button
                        className={styles.inviteBtn}
                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                        onClick={() => {
                          setNewInviteWallet(int.wallet || '');
                          setNewInviteName(int.name);
                          setNewInviteEmail(int.email || '');
                          setInviteInterestId(int._id);
                          setAdminTab('invites');
                        }}
                      >
                        <FiSend /> Send Invite
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        No wallet — contact vendor to get their wallet address
                      </span>
                    )}
                    {int.status === 'invited' && (
                      <span className={styles.inviteStatusOpen} style={{ fontSize: '0.72rem' }}>
                        Invited
                      </span>
                    )}
                    <button
                      className={styles.copyBtn}
                      style={{ color: '#f87171', marginLeft: 'auto' }}
                      onClick={() =>
                        confirmAction(`Delete application from ${int.name}?`, async () => {
                          try {
                            const res = await fetch('/api/admin/interests', {
                              method: 'DELETE',
                              headers: {
                                'Content-Type': 'application/json',
                                'x-wallet-address': adminWallet,
                              },
                              body: JSON.stringify({ id: int._id }),
                            });
                            if (res.ok) {
                              toast.success('Application deleted');
                              fetchInterests();
                            } else {
                              toast.error('Failed to delete');
                            }
                          } catch {
                            toast.error('Failed to delete');
                          }
                        })
                      }
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VENDORS TAB */}
      {adminTab === 'vendors' && (
        <>
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
                  {vendor.bannerUrl && (
                    <img src={vendor.bannerUrl} className={styles.banner} alt="" />
                  )}
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
                    <button
                      disabled={loading || approvingVendor === vendor.wallet}
                      onClick={() => approveVendor(vendor.wallet)}
                    >
                      {approvingVendor === vendor.wallet ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      className={styles.rejectButton}
                      disabled={loading || approvingVendor === vendor.wallet}
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
                {vendor.bannerUrl && (
                  <img src={vendor.bannerUrl} className={styles.banner} alt="" />
                )}
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
        </>
      )}
    </div>
  );
};

export default VendorManagementPanel;
