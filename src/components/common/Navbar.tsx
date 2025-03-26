import { useEffect, useState } from "react";
import styles from "../../styles/Navbar.module.css";
import Link from "next/link";
import { FaBars, FaTimes, FaAtom } from "react-icons/fa";
import { CiSearch } from "react-icons/ci";
import { useRouter } from "next/router";

export default function Navbar() {

  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);


  useEffect(() => {
    setIsClient(true);
  }, []);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const handleLogin = () => {
    router.push("/login");
    closeMenu();
  };

  const toggleSearch = () => {
    setSearchOpen(!searchOpen);
  }


  // Close menu when a link is clicked
  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <>

      {/* Desktop Navbar Section */}
      <div className={styles.navbarContainer}>
        <nav className={`${styles.navbar} ${menuOpen ? styles.open : ""}`}>

          <div className={styles.leftSection}>

            <Link href="/">
              <img src="/images/purpleLGG.png" alt="logo" className={styles.nwlogo} />
            </Link>
            <Link href="/">
              <div className={styles.title}>
                  LUXHUB.FUN
              </div>
            </Link>
            
          </div>

          <div className={styles.links}>
            <Link href="/watchMarket" onClick={closeMenu}>Inventory</Link>
            <Link href="/createNFT" onClick={closeMenu}>Mint NFT</Link>
            <Link href="/profile" onClick={closeMenu}>Wallet</Link>
          </div>

          <div className={styles.rightSection}>
            <div className={styles.searchContainer}>
              <CiSearch className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search collection"
                className={styles.searchBar}
              />
            </div>

            <button className={styles.loginButton} onClick={handleLogin}>
              Log In
            </button>
          </div>

        </nav>
      </div>

      {/* Mobile Navbar Section */}
      <div className={styles.mobileNavContainer}>
        <nav className={`${styles.mobileNavbar} ${menuOpen ? styles.open : ""}`}>
          <div className={styles.mobileMenuContainer}>

            {/* Navbar Left Section */}
            <div className={styles.mobileLeftSection}>
              <div className={styles.logo}>
                <Link href="/">
                  {/* <FaAtom className={styles.logo} /> */}
                  <img src="/images/purpleLGG.png" alt="logo" className={styles.nwlogo} />
                </Link>
              </div>

              <Link href="/">
                <div className={styles.title}>
                  LUXHUB.FUN
                </div>
              </Link>
            </div>

            {/* Navbar Right Section */}
            <div className={styles.mobileRightSection}>
              <div className={styles.searchIconContainer} onClick={toggleSearch}>
                {searchOpen ? <FaTimes className={styles.mobileSearchIcon} /> : <CiSearch className={styles.mobileSearchIcon} />}
              </div>

              <button className={styles.loginButton} onClick={handleLogin}>
                Log In
              </button>

              <div className={styles.menuIcon} onClick={toggleMenu}>
                {menuOpen ? <FaTimes className={styles.icon} /> : <FaBars className={styles.icon} />}
              </div>
            </div>

          </div>
        </nav>
      </div>
      
      {/* Mobile Search Section */}
      <div className={`${styles.mobileSearchContainer} ${searchOpen ? styles.open : ""}`}>
        <CiSearch className={styles.searchIconDisplay} />

        <input
          type="text"
          placeholder="Search collection"
          className={styles.searchBar}
        />

        <div className={styles.innerSearchIconContainer} onClick={toggleSearch}>
            {searchOpen ? <FaTimes className={styles.innerMobileSearchIcon} /> : <CiSearch className={styles.mobileSearchIcon} />}
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`${styles.menuContainer} ${menuOpen ? styles.open : ""}`}>
        <div className={`${styles.mobileNavLinks} ${menuOpen ? styles.open : ""}`}>
          <Link href="/watchMarket" className={styles.marketplaceBtn} onClick={closeMenu}>Watch Collection</Link>
          <Link href="/createNFT" onClick={closeMenu}>Mint NFT</Link>
          <Link href="/createNFT" onClick={closeMenu}>Learn More</Link>
          <Link href="/requestListing" onClick={closeMenu}>Create Listing</Link>
          <Link href="/userDashboard" onClick={closeMenu}>Profile</Link>
          <Link href="/adminDashboard" onClick={closeMenu}>Creators</Link>
          <Link href="/" onClick={closeMenu}>LUXHUB</Link>
        </div>
      </div>

    </>
  );
}
