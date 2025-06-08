import { useEffect, useState } from "react";
import styles from "../../styles/WalletNavbar.module.css";
import { useRouter } from "next/router";
import { WalletMultiButton, WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { SiSolana } from "react-icons/si";
import { IoFingerPrint } from "react-icons/io5";
import { Connection, Keypair } from "@solana/web3.js";
import WalletComponent from "./WalletConnect";

const endpoint = process.env.NEXT_PUBLIC_SOLANA_ENDPOINT ?? "https://api.devnet.solana.com";  // Default to Devnet
const secretKey = process.env.DEVNET_KEYPAIR ? JSON.parse(process.env.DEVNET_KEYPAIR) : [];  // Default to empty array
const keypair = secretKey.length > 0 ? Keypair.fromSecretKey(new Uint8Array(secretKey)) : null;

export default function WalletNavbar() {

  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const { connected, publicKey, disconnect } = useWallet();
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [shimmer, setShimmer] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    const fetchSolPrice = async () => {
      try {
        const res = await fetch("/api/users/sol-price");
        const data = await res.json();
        if (data.price && data.price !== solPrice) {
          setSolPrice(data.price);
          setShimmer(true);
          setTimeout(() => setShimmer(false), 500);
        }
      } catch (err) {
        console.error("Failed to fetch SOL price:", err);
      }
    };
  
    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 60000); // every 60s
    return () => clearInterval(interval);
  }, []);

  // useEffect(() => {
  //   const fetchWalletBalance = async () => {
  //     if (publicKey) {
  //       try {
  //         const connection = new Connection(endpoint, "confirmed");
  //         const lamports = await connection.getBalance(publicKey);
  //         setWalletBalance(lamports / 10 ** 9); // convert to SOL
  //       } catch (err) {
  //         console.error("Failed to fetch wallet balance:", err);
  //       }
  //     } else {
  //       setWalletBalance(null);
  //     }
  //   };
  
  //   fetchWalletBalance();
  
  //   const interval = setInterval(fetchWalletBalance, 30000); // update every 30s
  //   return () => clearInterval(interval);
  // }, [publicKey]);
  
  

  // Toggle menu open/close state
  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);

  // Handle wallet disconnect and redirect to login
  const handleLogout = () => {
    disconnect();
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Handle login navigation
  const handleLogin = () => {
    router.push("/login");
    closeMenu();
  };
  
  // Handle signup navigation
  const handleSignup = () => {
    router.push("/signup");
    closeMenu();
  };

  // Fetch balance from Devnet wallet
  const fetchBalance = async () => {
    if (!keypair) {
        console.error("Keypair not found. Check .env.local configuration.");
        return;
    }
    try {
        const connection = new Connection(endpoint, "confirmed");
        const walletBalance = await connection.getBalance(keypair.publicKey);
        setBalance(walletBalance / 10 ** 9);  // Convert to SOL
    } catch (error) {
        console.error("Failed to fetch balance:", error);
    }
  };

  return (
    <div className={styles.walletNavContainer}>
      <nav className={`${styles.walletNavbar} ${menuOpen ? styles.open : ""}`}>
        {/* <div className={styles.leftSide}>
          <SiSolana className={styles.icons} />
        </div> */}

        {/* <div className={styles.rightSide} onClick={toggleMenu}>
          <IoFingerPrint className={styles.icons} />
          {connected && publicKey && (
            <div className={styles.walletAddress}>
              <span>{`${publicKey.toBase58().slice(0, 5)}...`}</span>
            </div>
          )}

          {solPrice && (
            <div className={`${styles.solPriceTag} ${shimmer ? styles.shimmer : ""}`}>
              <SiSolana className={styles.solIcon} />
              <span>${solPrice.toFixed(2)}</span>
            </div>
          )}

          {walletBalance !== null && (
            <div className={styles.solPriceTag}>
              <SiSolana className={styles.solIcon} />
              <span>{walletBalance.toFixed(2)} SOL</span>
            </div>
          )}
          
        </div> */}

        {connected && publicKey && (
            <div className={styles.walletAddress}>
              <span>{`${publicKey.toBase58().slice(0, 5)}...${publicKey.toBase58().slice(-5)}`}</span>
            </div>
          )}

        {solPrice && (
            <div className={`${styles.solPriceTag} ${shimmer ? styles.shimmer : ""}`}>
              <SiSolana className={styles.solIcon} />
              <span>${solPrice.toFixed(2)}</span>
            </div>
          )}

        {/* <div className={styles.walletContainer}>
          <WalletModalProvider>
            <WalletMultiButton />
          </WalletModalProvider>
        </div> */}

        {/* <div className={styles.rightSide} onClick={toggleMenu}>
          <IoFingerPrint className={styles.icons} />
          {connected && publicKey && (
            <div className={styles.walletAddress}>
              <span>{`${publicKey.toBase58().slice(0, 5)}...`}</span>
            </div>
          )}
        </div> */}

        {/* <div className={`${styles.walletMenuContainer} ${menuOpen ? styles.open : ""}`}>
          {connected ? (
            <button onClick={handleLogout}>Log Out</button>
          ) : (
            <>
              <button onClick={handleLogin}>Login</button>
              <button onClick={handleSignup}>Signup</button>
            </>
          )}
          <button onClick={fetchBalance}>Check Balance</button>
          {balance !== null && <p>Balance: {balance.toFixed(2)} SOL</p>}
        </div> */}
        
      </nav>
    </div>
  );
}
