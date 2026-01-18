'use client'; // Add this if not already present (required for Privy hooks later if you add them here)

import { useEffect, useState } from 'react';
import styles from '../../styles/Navbar.module.css';
import Link from 'next/link';
import { FaBars, FaTimes } from 'react-icons/fa';
import { CiSearch } from 'react-icons/ci';
import { useRouter } from 'next/router';

export default function Navbar() {
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const toggleSearch = () => setSearchOpen(!searchOpen);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      {/* Desktop Navbar */}
      <div className={styles.navbarContainer}>
        <nav className={`${styles.navbar} ${menuOpen ? styles.open : ''}`}>
          <div className={styles.leftSection}>
            <Link href="/">
              <img src="/images/purpleLGG.png" alt="logo" className={styles.nwlogo} />
            </Link>
            <Link href="/">
              <div className={styles.title}>LUXHUB</div>
            </Link>
          </div>

          <div className={styles.links}>
            <Link href="/watchMarket" onClick={closeMenu}>
              Marketplace
            </Link>
            <Link href="/vendors" onClick={closeMenu}>
              Vendors
            </Link>
            <Link href="/luxhubHolders" onClick={closeMenu}>
              Holders
            </Link>
            {/* Temporarily hide admin links while we migrate */}
            {/* {isAdmin && <Link href="/createNFT" onClick={closeMenu}>Mint NFT</Link>}
            {isAdmin && <Link href="/adminDashboard" onClick={closeMenu}>Admins</Link>} */}
            <Link href="/sellerDashboard" onClick={closeMenu}>
              User
            </Link>
            <Link href="/learnMore" onClick={closeMenu}>
              Learn More
            </Link>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.searchContainer}>
              <CiSearch className={styles.searchIcon} />
              <input type="text" placeholder="Search collection" className={styles.searchBar} />
            </div>

            {/* Wallet area now empty — your custom WalletNavbar handles everything */}
            <div className={styles.walletContainer}>
              {/* You can leave this empty or add a placeholder */}
              {/* <span className={styles.walletPlaceholder}>Wallet (via dropdown)</span> */}
            </div>
          </div>
        </nav>
      </div>

      {/* Mobile Navbar */}
      <div className={styles.mobileNavContainer}>
        <nav className={`${styles.mobileNavbar} ${menuOpen ? styles.open : ''}`}>
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

              {/* Mobile wallet area also empty — WalletNavbar is visible globally */}
              <div className={styles.walletContainer}>{/* Empty for now */}</div>

              <div className={styles.menuIcon} onClick={toggleMenu}>
                {menuOpen ? (
                  <FaTimes className={styles.icon} />
                ) : (
                  <FaBars className={styles.icon} />
                )}
              </div>
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

      {/* Mobile Menu */}
      <div className={`${styles.menuContainer} ${menuOpen ? styles.open : ''}`}>
        <div className={styles.mobileMenuContent}>
          <div className={styles.mobileNavSection}>
            <div className={styles.headerTab}>MARKETPLACE</div>
            <Link href="/watchMarket" onClick={closeMenu}>
              Inventory
            </Link>
            <Link href="/learnMore" onClick={closeMenu}>
              Learn More
            </Link>
          </div>

          <div className={styles.mobileNavSection}>
            <div className={styles.headerTab}>LUXHUB</div>
            <Link href="/vendors" onClick={closeMenu}>
              Vendors
            </Link>
            <Link href="/luxhubHolders" onClick={closeMenu}>
              Holders
            </Link>
            {/* Admin links hidden for now */}
          </div>

          <div className={styles.mobileNavSection}>
            <div className={styles.headerTab}>ACCOUNT</div>
            <Link href="/sellerDashboard" onClick={closeMenu}>
              Profile
            </Link>
            <Link href="/" onClick={closeMenu}>
              Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
