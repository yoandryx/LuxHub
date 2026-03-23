// src/components/common/Navbar.tsx - Main navigation with global search
import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from '../../styles/Navbar.module.css';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FaTimes } from 'react-icons/fa';
import { CiSearch } from 'react-icons/ci';
import { FaGem, FaStore, FaChartPie, FaTag } from 'react-icons/fa';
import NotificationBell from './NotificationBell';
import { useUserRole } from '@/hooks/useUserRole';

const UserMenuDropdown = dynamic(() => import('./UserMenuDropdown'), {
  ssr: false,
  loading: () => <div style={{ width: 100, height: 36 }} />,
});

interface SearchResult {
  type: 'asset' | 'vendor' | 'pool' | 'listing';
  id: string;
  title: string;
  subtitle: string;
  image: string | null;
  href: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  asset: <FaGem />,
  vendor: <FaStore />,
  pool: <FaChartPie />,
  listing: <FaTag />,
};

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  vendor: 'Vendor',
  pool: 'Pool',
  listing: 'Listing',
};

export default function Navbar() {
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const { isAdmin, isVendor, isConnected, walletAddress } = useUserRole();

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Scroll hide
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        setHidden(y > 80 && y > lastScrollY);
        lastScrollY = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Click outside to close results
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close results on route change
  useEffect(() => {
    setShowResults(false);
    setQuery('');
    setSearchOpen(false);
  }, [router.asPath]);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    setShowResults(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        const data = await res.json();
        if (data.success) {
          setResults(data.results || []);
        }
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const navigateToResult = (result: SearchResult) => {
    setShowResults(false);
    setQuery('');
    router.push(result.href);
  };

  const toggleSearch = useCallback(() => setSearchOpen((prev) => !prev), []);

  const resolveImg = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    const gw = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.pinata.cloud/ipfs/';
    return `${gw}${url}`;
  };

  return (
    <>
      {/* Desktop Navbar */}
      <div className={styles.navbarContainer}>
        <nav className={`${styles.navbar} ${hidden ? styles.navHidden : ''}`}>
          <div className={styles.leftSection}>
            <Link href="/">
              <Image
                src="/images/purpleLGG.png"
                alt="logo"
                width={40}
                height={40}
                className={styles.nwlogo}
              />
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
            {isConnected && <Link href="/orders">Orders</Link>}
            {isAdmin && <Link href="/createNFT">Mint NFT</Link>}
            {isAdmin && <Link href="/adminDashboard">Admins</Link>}
            {isVendor && walletAddress && <Link href={`/vendor/${walletAddress}`}>Profile</Link>}
            {!isAdmin && <Link href="/learnMore">Learn More</Link>}
          </div>

          <div className={styles.rightSection}>
            {/* Search */}
            <div className={styles.searchContainer} ref={searchRef}>
              <CiSearch className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search watches, vendors, pools..."
                className={styles.searchBar}
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => query.length >= 2 && setShowResults(true)}
              />

              {/* Search Results Dropdown */}
              {showResults && (
                <div className={styles.searchDropdown}>
                  {searching && <div className={styles.searchLoading}>Searching...</div>}
                  {!searching && results.length === 0 && query.length >= 2 && (
                    <div className={styles.searchEmpty}>No results for &ldquo;{query}&rdquo;</div>
                  )}
                  {results.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      className={styles.searchResult}
                      onClick={() => navigateToResult(result)}
                    >
                      <div className={styles.searchResultIcon}>
                        {result.image ? (
                          <img src={resolveImg(result.image) || ''} alt="" />
                        ) : (
                          TYPE_ICONS[result.type]
                        )}
                      </div>
                      <div className={styles.searchResultInfo}>
                        <span className={styles.searchResultTitle}>{result.title}</span>
                        <span className={styles.searchResultSub}>{result.subtitle}</span>
                      </div>
                      <span className={styles.searchResultType}>{TYPE_LABELS[result.type]}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {isConnected && <NotificationBell walletAddress={walletAddress} />}
            {isClient && <UserMenuDropdown />}
          </div>
        </nav>
      </div>

      {/* Mobile Navbar */}
      <div className={styles.mobileNavContainer}>
        <nav className={`${styles.mobileNavbar} ${hidden ? styles.navHidden : ''}`}>
          <div className={styles.mobileMenuContainer}>
            <div className={styles.mobileLeftSection}>
              <div className={styles.logo}>
                <Link href="/">
                  <Image
                    src="/images/purpleLGG.png"
                    alt="logo"
                    width={40}
                    height={40}
                    className={styles.nwlogo}
                  />
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
              {isConnected && <NotificationBell walletAddress={walletAddress} />}
              {isClient && <UserMenuDropdown />}
            </div>
          </div>
        </nav>
      </div>

      {/* Mobile Search — slides down below navbar */}
      {searchOpen && (
        <div className={styles.mobileSearch}>
          <div className={styles.mobileSearchInputRow}>
            <CiSearch className={styles.mobileSearchInputIcon} />
            <input
              type="text"
              placeholder="Search..."
              className={styles.mobileSearchInput}
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            <button onClick={toggleSearch} className={styles.mobileSearchClose}>
              <FaTimes />
            </button>
          </div>

          {/* Results */}
          {(searching || results.length > 0 || query.length >= 2) && (
            <div className={styles.mobileSearchResults}>
              {searching && <div className={styles.mobileSearchMsg}>Searching...</div>}
              {!searching && results.length === 0 && query.length >= 2 && (
                <div className={styles.mobileSearchMsg}>No results</div>
              )}
              {results.map((r) => (
                <button
                  key={`m-${r.type}-${r.id}`}
                  className={styles.mobileSearchItem}
                  onClick={() => {
                    navigateToResult(r);
                    setSearchOpen(false);
                  }}
                >
                  <div className={styles.mobileSearchThumb}>
                    {r.image ? <img src={resolveImg(r.image) || ''} alt="" /> : TYPE_ICONS[r.type]}
                  </div>
                  <div className={styles.mobileSearchItemText}>
                    <span>{r.title}</span>
                    <span>{r.subtitle}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
