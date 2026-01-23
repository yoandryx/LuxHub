import { useEffect, useState } from 'react';
import styles from '../../styles/Navbar.module.css';
import Link from 'next/link';
import { FaBars, FaTimes } from 'react-icons/fa';
import { CiSearch } from 'react-icons/ci';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getProgram } from '../../utils/programUtils';
import { FaWallet } from 'react-icons/fa6';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';

export default function Navbar() {
  const router = useRouter();
  const wallet = useWallet();

  // Privy hooks for authentication and wallets
  const { login, authenticated } = usePrivy();
  const { wallets: privyWallets } = useWallets();
  const privyWalletAddress = privyWallets?.[0]?.address;

  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Get active public key (wallet adapter or Privy)
  const activePublicKey =
    wallet.publicKey || (privyWalletAddress ? new PublicKey(privyWalletAddress) : null);

  // Check if connected via any method
  const isConnected = wallet.connected || (authenticated && !!privyWalletAddress);

  // Get display address
  const displayAddress = activePublicKey
    ? `${activePublicKey.toBase58().slice(0, 4)}...${activePublicKey.toBase58().slice(-4)}`
    : null;

  // Handle wallet button click - opens Privy login modal
  const handleWalletClick = () => {
    if (!isConnected) {
      login();
    }
  };

  // Check admin status - works with both wallet adapter and Privy
  useEffect(() => {
    const checkAdmin = async () => {
      if (!activePublicKey) {
        setIsAdmin(false);
        return;
      }

      try {
        const program = getProgram({ publicKey: activePublicKey } as any);
        const [adminListPda] = PublicKey.findProgramAddressSync(
          [Buffer.from('admin_list')],
          program.programId
        );

        const adminAccountRaw = await (program.account as any).adminList.fetch(adminListPda);
        const adminListStr: string[] = adminAccountRaw.admins
          .map((admin: any) => admin?.toBase58?.())
          .filter(Boolean);

        setIsAdmin(adminListStr.includes(activePublicKey.toBase58()));
      } catch (err) {
        console.error('Navbar admin check error:', err);
        setIsAdmin(false);
      }
    };

    checkAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePublicKey?.toBase58()]);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const toggleSearch = () => setSearchOpen(!searchOpen);
  const closeMenu = () => setMenuOpen(false);
  const handleLogin = () => {
    router.push('/login');
    closeMenu();
  };

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
            <Link href="/pools" onClick={closeMenu}>
              Pools
            </Link>
            <Link href="/vendors" onClick={closeMenu}>
              Vendors
            </Link>
            <Link href="/luxhubHolders" onClick={closeMenu}>
              Holders
            </Link>
            {isAdmin && (
              <Link href="/createNFT" onClick={closeMenu}>
                Mint NFT
              </Link>
            )}
            {isAdmin && (
              <Link href="/adminDashboard" onClick={closeMenu}>
                Admins
              </Link>
            )}
            <Link href="/sellerDashboard" onClick={closeMenu}>
              User
            </Link>
            {!isAdmin && (
              <Link href="/learnMore" onClick={closeMenu}>
                Learn More
              </Link>
            )}
          </div>

          <div className={styles.rightSection}>
            <div className={styles.searchContainer}>
              <CiSearch className={styles.searchIcon} />
              <input type="text" placeholder="Search collection" className={styles.searchBar} />
            </div>

            <div className={styles.walletContainer}>
              <FaWallet className={styles.icon} />
              {isClient && (
                <button
                  className="wallet-adapter-button wallet-adapter-button-trigger"
                  onClick={handleWalletClick}
                >
                  <span>{isConnected ? displayAddress : 'Select Wallet'}</span>
                </button>
              )}
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

              <div className={styles.mobileWalletContainer}>
                <FaWallet className={styles.icon} />
                {isClient && (
                  <button
                    className="wallet-adapter-button wallet-adapter-button-trigger"
                    onClick={handleWalletClick}
                  >
                    <FaWallet className={styles.icon} />
                    <span>{isConnected ? displayAddress : 'Select Wallet'}</span>
                  </button>
                )}
              </div>

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
            <Link href="/pools" onClick={closeMenu}>
              Investment Pools
            </Link>
            {!isAdmin && (
              <Link href="/learnMore" onClick={closeMenu}>
                Learn More
              </Link>
            )}
          </div>

          <div className={styles.mobileNavSection}>
            <div className={styles.headerTab}>LUXHUB</div>
            <Link href="/vendors" onClick={closeMenu}>
              vendors
            </Link>
            <Link href="/luxhubHolders" onClick={closeMenu}>
              Holders
            </Link>
            {isAdmin && (
              <Link href="/adminDashboard" onClick={closeMenu}>
                Admins
              </Link>
            )}
            {isAdmin && (
              <Link href="/createNFT" onClick={closeMenu}>
                Mint
              </Link>
            )}
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
