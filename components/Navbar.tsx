import { useEffect, useState } from "react";
import styles from "../styles/Navbar.module.css";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Navbar() {
  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  return (

    <nav className={styles.navbar}>

      {/* Navbar Left Section */}
      <div className={styles.leftSection}>

        {/* Navbar Logo */}
        <Link href="/">
          {/* <img src="/logo.svg" alt="Logo" className={styles.logo} /> */}
        </Link>

        {/* Navbar Title*/}
        <div className={styles.logo}>Mercatus</div>

        {/* Mobile Hamburger Menu */}
        <div className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)}>
          ☰
        </div>

      </div>

      {/* Navbar Links */}
      <div className={`${styles.links} ${menuOpen ? styles.open : ""}`}>
        <Link href="/">Home</Link>
        <Link href="/listings">Listings</Link>
        <Link href="/create-listing">Create</Link>
        <Link href="/profile">Profile</Link>
      </div>
    
      {/* Search Bar */}
      <input type="text"placeholder="Search listings..." value={searchQuery} onChange={handleSearch} className={styles.searchBar}/>

      {/* Wallet Button */}
      <div className={styles.walletWrapper}>
        {isClient && <WalletMultiButton className={styles.walletButton} />}
      </div>

    </nav>
  );
}
