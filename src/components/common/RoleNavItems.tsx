// src/components/common/RoleNavItems.tsx - Role-based navigation items
import React, { memo } from 'react';
import Link from 'next/link';
import {
  FaShoppingBag,
  FaStore,
  FaPlus,
  FaUserShield,
  FaClock,
  FaChartLine,
  FaUser,
  FaGem,
  FaUsers,
  FaBookOpen,
} from 'react-icons/fa';
import { UserRole } from '@/hooks/useUserRole';
import styles from '@/styles/UserMenuDropdown.module.css';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
  description?: string;
  category: 'explore' | 'user' | 'vendor' | 'admin';
}

// Navigation items configuration — only routes that actually exist
const NAV_ITEMS: NavItem[] = [
  // Explore — visible to all connected users
  {
    href: '/marketplace',
    label: 'Marketplace',
    icon: <FaGem />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Browse luxury listings',
    category: 'explore',
  },
  {
    href: '/pools',
    label: 'Investment Pools',
    icon: <FaChartLine />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Fractional ownership',
    category: 'explore',
  },
  {
    href: '/vendors',
    label: 'Vendors',
    icon: <FaUsers />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Verified dealers',
    category: 'explore',
  },
  {
    href: '/learnMore',
    label: 'Learn More',
    icon: <FaBookOpen />,
    roles: ['user', 'vendor', 'admin'],
    description: 'How LuxHub works',
    category: 'explore',
  },
  // User items — personal pages
  {
    href: '/profile', // will be replaced with /user/{wallet} dynamically
    label: 'My Profile',
    icon: <FaUser />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Your holdings & info',
    category: 'user',
  },
  {
    href: '/my-orders',
    label: 'My Orders',
    icon: <FaShoppingBag />,
    roles: ['user', 'vendor', 'admin'],
    description: 'Track purchases & sales',
    category: 'user',
  },
  // Vendor application — visible to users who aren't vendors yet
  {
    href: '/vendor/apply',
    label: 'Become a Vendor',
    icon: <FaPlus />,
    roles: ['user'],
    description: 'Apply to sell on LuxHub',
    category: 'explore',
  },
  // Vendor-specific items
  {
    href: '/vendor/vendorDashboard',
    label: 'Vendor Dashboard',
    icon: <FaStore />,
    roles: ['vendor', 'admin'],
    description: 'Inventory, orders & payouts',
    category: 'vendor',
  },
  // Admin-specific items
  {
    href: '/adminDashboard',
    label: 'Admin Dashboard',
    icon: <FaUserShield />,
    roles: ['admin'],
    description: 'Approvals, escrow & users',
    category: 'admin',
  },
  {
    href: '/createNFT',
    label: 'Mint NFT',
    icon: <FaClock />,
    roles: ['admin'],
    description: 'Mint directly on-chain',
    category: 'admin',
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
  const exploreItems = visibleItems.filter((item) => item.category === 'explore');
  const userItems = visibleItems.filter((item) => item.category === 'user');
  const vendorItems = visibleItems.filter((item) => item.category === 'vendor');
  const adminItems = visibleItems.filter((item) => item.category === 'admin');

  const resolveHref = (item: NavItem): string => {
    // Profile link → user profile page
    if (item.href === '/profile' && walletAddress) {
      return `/user/${walletAddress}`;
    }
    return item.href;
  };

  const renderItems = (items: NavItem[], sectionLabel?: string) => (
    <>
      {sectionLabel && items.length > 0 && (
        <div className={styles.sectionLabel}>{sectionLabel}</div>
      )}
      {items.map((item) => (
        <Link
          key={item.href}
          href={resolveHref(item)}
          className={styles.navItem}
          onClick={onItemClick}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <div className={styles.navItemContent}>
            <span className={styles.navLabel}>{item.label}</span>
            {item.description && <span className={styles.navDescription}>{item.description}</span>}
          </div>
        </Link>
      ))}
    </>
  );

  if (role === 'browser') {
    return null;
  }

  return (
    <nav className={`${styles.navSection} ${className}`}>
      {exploreItems.length > 0 && renderItems(exploreItems, 'Explore')}
      {userItems.length > 0 && renderItems(userItems, 'Account')}
      {vendorItems.length > 0 && renderItems(vendorItems, 'Vendor')}
      {adminItems.length > 0 && renderItems(adminItems, 'Admin')}
    </nav>
  );
}

export default memo(RoleNavItems);
