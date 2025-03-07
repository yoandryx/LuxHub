import { useEffect, useState } from "react";
import styles from "../styles/WalletNavbar.module.css";
import Link from "next/link";
import { useRouter } from "next/router";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { SiSolana, SiEthereum, SiBitcoinsv, SiStripe} from "react-icons/si";
import { FaCcStripe } from "react-icons/fa6";
import { IoFingerPrint } from "react-icons/io5";


export default function WalletNavbar() {

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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleLogin = () => {
    router.push("/login");
    setMenuOpen(false);
  };

  const handleSignup = () => {
    router.push("/signup");
    setMenuOpen(false);
  }

  return (
    <>
      <div className={styles.walletNavContainer}>
        <nav className={`${styles.walletNavbar} ${menuOpen ? styles.open : ""}`}>

            <div className={styles.leftSide}>
                <SiSolana className={styles.icons}/>
                {/* <SiBitcoinsv className={styles.icons}/> */}
                {/* <SiEthereum className={styles.icons}/> */}
                {/* <SiStripe className={styles.icons}/> */}
                <FaCcStripe className={styles.icons}/>
            </div>

            <div className={styles.walletContainer}>
                <WalletMultiButton className={styles.wallet}/>
            </div>

            <div className={styles.rightSide} onClick={toggleMenu}>
                <IoFingerPrint className={styles.icons} />
                <div>Sign In</div>
            </div>

            <div className={`${styles.walletMenuContainer} ${menuOpen ? styles.open : ""}`}>
                {/* <button onClick={handleLogout} className={""}>
                    Log Out
                </button> */}

                <div className={styles.walletMenuSelection}>
                    <button onClick={handleLogin} className={""}>
                        Login
                    </button>
                    <button  onClick={handleSignup} className={""}>
                        Signup
                    </button>
                    <button onClick={handleLogout} className={""}>
                      Log Out
                    </button>
                </div>

                <div className={styles.prompt}>Log in with Wallet or a personal profile</div>
            </div>

        </nav>
      </div>
    </>
  );
}
