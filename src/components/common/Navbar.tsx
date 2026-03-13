// src/components/common/Navbar.tsx - Main navigation component
import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../styles/Navbar.module.css';
import Link from 'next/link';
import { FaTimes } from 'react-icons/fa';
import { CiSearch } from 'react-icons/ci';
import NotificationBell from './NotificationBell';
import { useUserRole } from '@/hooks/useUserRole';

// Lazy load dropdown components for better performance
const UserMenuDropdown = dynamic(() => import('./UserMenuDropdown'), {
  ssr: false,
  loading: () => <div style={{ width: 100, height: 36 }} />,
});

export default function Navbar() {
  const [isClient, setIsClient] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Use unified role detection hook
  const { isAdmin, isVendor, isConnected, walletAddress } = useUserRole();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const toggleSearch = useCallback(() => setSearchOpen((prev) => !prev), []);

  return (
    <>
      {/* Desktop Navbar */}
      <div className={styles.navbarContainer}>
        <nav className={styles.navbar}>
          <div className={styles.leftSection}>
            <Link href="/">
              <img src="/images/purpleLGG.png" alt="logo" className={styles.nwlogo} />
            </Link>
            <Link href="/">
              <div className={styles.title}>LUXHUB</div>
            </Link>
          </div>

          <div className={styles.links}>
            <Link href="/marketplace" className={styles.marketplaceLink}>
              Marketplace
            </Link>
            <Link href="/pools" className={styles.poolsLink}>
              Pools
            </Link>
            <Link href="/vendors">Vendors</Link>
            {isAdmin && <Link href="/createNFT">Mint NFT</Link>}
            {isAdmin && <Link href="/adminDashboard">Admins</Link>}
            {isVendor && walletAddress && <Link href={`/vendor/${walletAddress}`}>Profile</Link>}
            {!isAdmin && <Link href="/learnMore">Learn More</Link>}
          </div>

          <div className={styles.rightSection}>
            <div className={styles.searchContainer}>
              <CiSearch className={styles.searchIcon} />
              <input type="text" placeholder="Search collection" className={styles.searchBar} />
            </div>

            {/* Notification Bell */}
            {isConnected && <NotificationBell walletAddress={walletAddress} />}

            {/* User Menu Dropdown */}
            {isClient && <UserMenuDropdown />}
          </div>
        </nav>
      </div>

      {/* Mobile Navbar */}
      <div className={styles.mobileNavContainer}>
        <nav className={styles.mobileNavbar}>
          <div className={styles.mobileMenuContainer}>
            <div className={styles.mobileLeftSection}>
              <div className={styles.logo}>
                <Link href="/">
                  <img src="/images/purpleLGG.png" alt="logo" className={styles.nwlogo} />
                </Link>
              </div>
              <Link href="/">
                <div className={styles.title}>LUXHUB</div>
              </Link>
            </div>

            <div className={styles.mobileRightSection}>
              <div className={styles.searchIconContainer} onClick={toggleSearch}>
                {searchOpen ? (
                  <FaTimes className={styles.mobileSearchIcon} />
                ) : (
                  <CiSearch className={styles.mobileSearchIcon} />
                )}
              </div>

              {/* Mobile Notification Bell */}
              {isConnected && <NotificationBell walletAddress={walletAddress} />}

              {/* User Menu Dropdown */}
              {isClient && <UserMenuDropdown />}
            </div>
          </div>
        </nav>
      </div>

      {/* Mobile Search */}
      <div className={`${styles.mobileSearchContainer} ${searchOpen ? styles.open : ''}`}>
        <CiSearch className={styles.searchIconDisplay} />
        <input type="text" placeholder="Search collection" className={styles.searchBar} />
        <div className={styles.innerSearchIconContainer} onClick={toggleSearch}>
          {searchOpen ? (
            <FaTimes className={styles.innerMobileSearchIcon} />
          ) : (
            <CiSearch className={styles.mobileSearchIcon} />
          )}
        </div>
      </div>
    </>
  );
}
