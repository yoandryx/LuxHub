import { useEffect, useState } from "react";
import styles from "../styles/Navbar.module.css";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function Navbar() {

  const [isClient, setIsClient] = useState(false);  
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <nav className={styles.navbar}>

      <div className={styles.leftSection}>
        <Link href="/">
          <img src="/logo.svg" alt="Logo" className={styles.logo} />
        </Link>
        <div className={styles.logo}>Marketplace</div>
      </div>

      <div className={styles.links}>
          <Link href="/">Home</Link>
          <Link href="/listings">Listings</Link>
          <Link href="/create-listing">Create</Link>
          <Link href="/profile">Profile</Link>
      </div>

      <div className={styles.walletWrapper}>
        {isClient && <WalletMultiButton className={styles.walletButton} />}
      </div>

    </nav>
  );
}
