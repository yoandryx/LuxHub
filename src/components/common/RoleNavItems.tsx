// src/components/common/RoleNavItems.tsx - Role-based navigation items
import React, { memo } from 'react';
import Link from 'next/link';
import { FaShoppingBag, FaStore, FaPlus, FaUserShield, FaClock, FaChartLine } from 'react-icons/fa';
import { UserRole } from '@/hooks/useUserRole';
import styles from '@/styles/UserMenuDropdown.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
  description?: string;
}

// Navigation items configuration — only routes that actually exist
const NAV_ITEMS: NavItem[] = [
  // User items (everyone who's connected)
  {
    href: '/my-orders',
    label: 'My Orders',
    icon: <FaShoppingBag />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Track purchases & sales',
  },
  {
    href: '/pools',
    label: 'My Pools',
    icon: <FaChartLine />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Fractional investments',
  },
  // Vendor-specific items — dashboard is the hub
  {
    href: '/sellerDashboard',
    label: 'Vendor Dashboard',
    icon: <FaStore />,
    roles: ['vendor', 'admin'],
    description: 'Inventory, orders & payouts',
  },
  {
    href: '/requestMint',
    label: 'Request Listing',
    icon: <FaPlus />,
    roles: ['vendor', 'admin'],
    description: 'Submit a new asset',
  },
  // Admin-specific items — dashboard is the hub
  {
    href: '/adminDashboard',
    label: 'Admin Dashboard',
    icon: <FaUserShield />,
    roles: ['admin'],
    description: 'Approvals, escrow & users',
  },
  {
    href: '/createNFT',
    label: 'Mint NFT',
    icon: <FaClock />,
    roles: ['admin'],
    description: 'Mint directly on-chain',
  },
];

interface RoleNavItemsProps {
  role: UserRole;
  walletAddress?: string | null;
  onItemClick?: () => void;
  className?: string;
}

function RoleNavItems({ role, walletAddress, onItemClick, className = '' }: RoleNavItemsProps) {
  // Filter items based on role
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  // Group items by category
  const userItems = visibleItems.filter((item) => ['My Orders', 'My Pools'].includes(item.label));
  const vendorItems = visibleItems.filter((item) =>
    ['Vendor Dashboard', 'Request Listing'].includes(item.label)
  );
  const adminItems = visibleItems.filter((item) =>
    ['Admin Dashboard', 'Mint NFT'].includes(item.label)
  );

  const renderItems = (items: NavItem[], sectionLabel?: string) => (
    <>
      {sectionLabel && items.length > 0 && (
        <div className={styles.sectionLabel}>{sectionLabel}</div>
      )}
      {items.map((item) => {
        // Special case: vendor dashboard uses wallet address
        let href = item.href;
        if (item.href === '/sellerDashboard' && walletAddress) {
          href = `/vendor/${walletAddress}`;
        }

        return (
          <Link key={item.href} href={href} className={styles.navItem} onClick={onItemClick}>
            <span className={styles.navIcon}>{item.icon}</span>
            <div className={styles.navItemContent}>
              <span className={styles.navLabel}>{item.label}</span>
              {item.description && (
                <span className={styles.navDescription}>{item.description}</span>
              )}
            </div>
          </Link>
        );
      })}
    </>
  );

  if (role === 'browser') {
    return null;
  }

  return (
    <nav className={`${styles.navSection} ${className}`}>
      {userItems.length > 0 && renderItems(userItems)}
      {vendorItems.length > 0 && renderItems(vendorItems, 'Vendor')}
      {adminItems.length > 0 && renderItems(adminItems, 'Admin')}
    </nav>
  );
}

export default memo(RoleNavItems);
