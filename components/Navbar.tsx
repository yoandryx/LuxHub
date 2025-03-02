import { useEffect, useState } from "react";
import styles from "../styles/Navbar.module.css";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { FaSearch, FaBars, FaTimes } from "react-icons/fa";

export default function Navbar() {

  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  // Close menu when a link is clicked
  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
  <>

    <div className={styles.navbarContainer}>

      <nav className={styles.navbar}>

        {/* Navbar Left Section */}
        <div className={styles.leftSection}>

          {/* Navbar Logo */}
          <Link href="/">
            {/* <img src="/logo.svg" alt="Logo" className={styles.logo} /> */}
          </Link>

          {/* Navbar Title*/}
          <div className={styles.logo}>Mercatus</div>

        </div>
        
        {/* Navbar Links */}
        {/* <div className={`${styles.links} ${menuOpen ? styles.open : ""}`}> */}
        <div className={`${styles.links}`}>

          <Link href="/" onClick={closeMenu}>Home</Link>
          <Link href="/listings" onClick={closeMenu}>Listings</Link>
          <Link href="/create-listing" onClick={closeMenu}>Create</Link>
          <Link href="/profile" onClick={closeMenu}>Profile</Link>
          
          {/* Wallet Button */}
          <div className={styles.walletWrapper}>
            {isClient && <WalletMultiButton className={styles.walletButton} />}
          </div>

        </div>

          <div className={styles.rightSection}>

            {/* Hamburger Menu Icon */}
            <div className={styles.hamburger} onClick={toggleMenu}>
              {menuOpen ? <FaTimes className={styles.icon} /> : <FaBars className={styles.icon} />}
            </div>
            
          </div>

      </nav>

    </div>

    <div className={`${styles.mobileLinks} ${menuOpen ? styles.open : ""}`}>

        <Link href="/" onClick={closeMenu}>Home</Link>
        <Link href="/listings" onClick={closeMenu}>Listings</Link>
        <Link href="/create-listing" onClick={closeMenu}>Create</Link>
        <Link href="/profile" onClick={closeMenu}>Profile</Link>
        
        {/* Wallet Button */}
        <div className={styles.walletWrapper}>
          {isClient && <WalletMultiButton className={styles.walletButton} />}
        </div>

      </div>

  </>

    
    
  );
}
