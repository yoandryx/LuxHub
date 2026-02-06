// src/components/common/RoleNavItems.tsx - Role-based navigation items
import React, { memo } from 'react';
import Link from 'next/link';
import {
  FaShoppingBag,
  FaHandshake,
  FaMapMarkerAlt,
  FaCog,
  FaStore,
  FaPlus,
  FaUserShield,
  FaClock,
} from 'react-icons/fa';
import { UserRole } from '@/hooks/useUserRole';
import styles from '@/styles/UserMenuDropdown.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[]; // Roles that can see this item
}

// Navigation items configuration
const NAV_ITEMS: NavItem[] = [
  // User items (everyone who's connected)
  {
    href: '/orders',
    label: 'My Orders',
    icon: <FaShoppingBag />,
    roles: ['user', 'vendor', 'admin'],
  },
  {
    href: '/offers',
    label: 'My Offers',
    icon: <FaHandshake />,
    roles: ['user', 'vendor', 'admin'],
  },
  {
    href: '/addresses',
    label: 'Saved Addresses',
    icon: <FaMapMarkerAlt />,
    roles: ['user', 'vendor', 'admin'],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: <FaCog />,
    roles: ['user', 'vendor', 'admin'],
  },
  // Vendor-specific items
  {
    href: '/sellerDashboard',
    label: 'Vendor Dashboard',
    icon: <FaStore />,
    roles: ['vendor', 'admin'],
  },
  {
    href: '/submitListing',
    label: 'Submit Listing',
    icon: <FaPlus />,
    roles: ['vendor', 'admin'],
  },
  // Admin-specific items
  {
    href: '/adminDashboard',
    label: 'Admin Dashboard',
    icon: <FaUserShield />,
    roles: ['admin'],
  },
  {
    href: '/createNFT',
    label: 'Mint NFT',
    icon: <FaClock />,
    roles: ['admin'],
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
  const userItems = visibleItems.filter((item) =>
    ['My Orders', 'My Offers', 'Saved Addresses', 'Settings'].includes(item.label)
  );
  const vendorItems = visibleItems.filter((item) =>
    ['Vendor Dashboard', 'Submit Listing'].includes(item.label)
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
            <span className={styles.navLabel}>{item.label}</span>
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
