import { useEffect, useState } from "react";
import styles from "../styles/Navbar.module.css";
import Link from "next/link";
import { FaBars, FaTimes, FaAtom } from "react-icons/fa";
import { useRouter } from "next/router";

export default function Navbar() {

  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();


  useEffect(() => {
    setIsClient(true);
  }, []);

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
        <nav className={`${styles.navbar} ${menuOpen ? styles.open : ""}`}>

          <div className={styles.leftSection}>
            <Link href="/">
              <FaAtom className={styles.logo} />
            </Link>
          </div>

          <div className={styles.links}>
            <Link href="/listings" onClick={closeMenu}>Listings</Link>
            <Link href="/createNFT" onClick={closeMenu}>Create</Link>
            <Link href="/profile" onClick={closeMenu}>Profile</Link>
          </div>

        </nav>
      </div>

      <div className={styles.mobileNavContainer}>
        <nav className={`${styles.mobileNavbar} ${menuOpen ? styles.open : ""}`}>
          <div className={styles.mobileMenuContainer}>

            <div className={styles.mobileNavIcon}>
              <Link href="/">
                <FaAtom className={styles.logo} />
              </Link>
            </div>
            
            <div className={styles.mobileMenu} onClick={toggleMenu}>
                {menuOpen ? <FaTimes className={styles.icon} /> : <FaBars className={styles.icon} />}
                <div className={`${styles.mobileNavLinks} ${menuOpen ? styles.open : ""}`}>
                  <Link href="/listings" onClick={closeMenu}>Listings</Link>
                  <Link href="/createNFT" onClick={closeMenu}>Create</Link>
                  <Link href="/profile" onClick={closeMenu}>Profile</Link>
                </div>
            </div>

          </div>
        </nav>
      </div>

    </>
  );
}
